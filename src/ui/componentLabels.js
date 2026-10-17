import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Vector3 } from "../babylon.js";
import { PALETTE } from "../config.js";

const FONT = "'Segoe UI', Roboto, Arial, sans-serif";
const LABEL_W = 0.74;
const LABEL_H = LABEL_W / 4;
const LEVEL_STEP = 0.25;
const MIN_GAP_Z = 0.92;

/**
 * Legendas do raio X: placa (sempre de frente para a câmera) + linha até o componente
 * + ponto de ancoragem. São objetos 3D — aparecem no desktop e dentro do headset.
 * Ficam no grupo de renderização 1 (desenhadas por cima do carro) e presas ao prato
 * giratório, então acompanham o carro sem recálculo por quadro.
 * Clicar numa legenda seleciona o componente (metadata.evxr.labelFor).
 */
export function createComponentLabels(scene, { items, parent, roofY, halfLength }) {
  const placed = layoutLabels(items, roofY, halfLength);
  const entries = placed.map((p) => buildLabel(scene, p, parent));
  let activeId = null;
  let visibility = 0;
  let filter = null;

  // Tamanho aparente mínimo: legendas distantes crescem um pouco para continuarem legíveis.
  const tmp = new Vector3();
  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (visibility <= 0.001 || !cam) return;
    const eye = cam.globalPosition;
    for (const e of entries) {
      e.plane.getAbsolutePosition().subtractToRef(eye, tmp);
      const grow = Math.min(1.7, Math.max(1, tmp.length() / 5));
      e.plane.scaling.setAll(grow * (e.id === activeId ? 1.15 : 1));
    }
  });

  function setVisibility(k) {
    visibility = k;
    for (const e of entries) {
      setEnabled(e, k > 0.001 && (!filter || filter.has(e.id)));
      const emphasis = !activeId || activeId === e.id ? 1 : 0.45;
      e.plane.material.alpha = k * emphasis;
      e.line.alpha = 0.9 * k * emphasis;
      e.dot.material.alpha = k * emphasis;
    }
  }
  setVisibility(0);

  return {
    meshes: entries.flatMap((e) => [e.plane, e.line, e.dot]),
    setVisibility,
    /** Destaca a legenda do componente selecionado e esmaece as demais. */
    setActive(id) {
      activeId = id;
      setVisibility(visibility);
    },
    setFilter(ids) {
      filter = ids ? new Set(ids) : null;
      setVisibility(visibility);
    },
    setText(id, value) {
      const e = entries.find((x) => x.id === id);
      if (e) drawLabel(e.tex, { ...e.item, short: value ?? e.item.short });
    },
  };
}

/**
 * Agrupa os componentes por região ao longo do carro (frente, meio, traseira) e empilha
 * as legendas de cada região verticalmente acima do teto, no eixo central. Pilhas
 * verticais continuam legíveis de qualquer ângulo — inclusive andando ao redor em VR.
 * Dentro da pilha, o componente mais baixo fica com a legenda mais baixa (linhas não se cruzam).
 */
function layoutLabels(items, roofY, halfLength) {
  const sorted = [...items].sort((a, b) => b.center.z - a.center.z);
  const clusters = [];
  for (const item of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && last.startZ - item.center.z < MIN_GAP_Z) last.items.push(item);
    else clusters.push({ startZ: item.center.z, items: [item] });
  }
  const placed = [];
  for (const cluster of clusters) {
    const z = Math.max(-halfLength * 0.8, Math.min(halfLength * 0.8, avg(cluster.items.map((i) => i.center.z))));
    cluster.items
      .sort((a, b) => a.center.y - b.center.y)
      .forEach((item, level) => {
        placed.push({ ...item, level, labelPos: new Vector3(0, roofY + 0.3 + level * LEVEL_STEP, z) });
      });
  }
  return placed;
}

const avg = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Legendas 3D "flutuantes" (VR) que seguem âncoras móveis — usadas no exploded view.
 * `items[i].center` é um Vector3 (local do prato) atualizado por quem move as peças;
 * chame `update()` enquanto houver movimento.
 */
export function createFloatingLabels(scene, { items, parent }) {
  const lift = new Vector3(0, 0.34, 0);
  const entries = items.map((item) => {
    const e = buildLabel(scene, { ...item, labelPos: item.center.add(lift) }, parent, { updatable: true });
    e.plane.isNearPickable = true; // toque com o dedo (hand tracking)
    return { ...e, center: item.center };
  });
  let visibility = 0;
  const tmp = new Vector3();

  function update() {
    for (const e of entries) {
      e.plane.position.copyFrom(e.center).addInPlace(lift);
      e.dot.position.copyFrom(e.center);
      const top = e.plane.position.subtract(new Vector3(0, LABEL_H * 0.5, 0));
      MeshBuilder.CreateLines(e.line.name, { points: [e.center.clone(), top], instance: e.line });
    }
  }
  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (visibility <= 0.001 || !cam) return;
    for (const e of entries) {
      e.plane.getAbsolutePosition().subtractToRef(cam.globalPosition, tmp);
      e.plane.scaling.setAll(Math.min(1.6, Math.max(0.85, tmp.length() / 5)));
    }
  });

  function setVisibility(k) {
    visibility = k;
    for (const e of entries) {
      setEnabled(e, k > 0.001);
      e.plane.material.alpha = k;
      e.line.alpha = 0.9 * k;
      e.dot.material.alpha = k;
    }
  }
  setVisibility(0);
  return { update, setVisibility };
}

function buildLabel(scene, p, parent, { updatable = false } = {}) {
  const color = Color3.FromHexString(p.color);

  const tex = new DynamicTexture(`tex-label-${p.id}`, { width: 592, height: 148 }, scene, true);
  tex.hasAlpha = true;
  drawLabel(tex, p);

  const mat = new StandardMaterial(`mat-label-${p.id}`, scene);
  mat.disableLighting = true;
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.fogEnabled = false;

  const plane = MeshBuilder.CreatePlane(`label:${p.id}`, { width: LABEL_W, height: LABEL_H }, scene);
  plane.parent = parent;
  plane.position.copyFrom(p.labelPos);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.material = mat;
  plane.renderingGroupId = 1;
  plane.metadata = { evxr: { labelFor: p.id } };
  plane.isNearPickable = true; // toque com o dedo (hand tracking)

  const lineTop = p.labelPos.subtract(new Vector3(0, LABEL_H * 0.5, 0));
  const line = MeshBuilder.CreateLines(`label-line:${p.id}`, { points: [p.center.clone(), lineTop], updatable }, scene);
  line.parent = parent;
  line.color = color;
  line.renderingGroupId = 1;
  line.isPickable = false;

  const dot = MeshBuilder.CreateSphere(`label-dot:${p.id}`, { diameter: 0.055, segments: 8 }, scene);
  dot.parent = parent;
  dot.position.copyFrom(p.center);
  const dotMat = new StandardMaterial(`mat-label-dot-${p.id}`, scene);
  dotMat.disableLighting = true;
  dotMat.emissiveColor = color;
  dotMat.diffuseColor = Color3.Black();
  dotMat.fogEnabled = false;
  dot.material = dotMat;
  dot.renderingGroupId = 1;
  dot.isPickable = false;

  return { id: p.id, plane, line, dot, tex, item: p };
}

function drawLabel(tex, p) {
  const ctx = tex.getContext();
  const { width: w, height: h } = tex.getSize();
  ctx.clearRect(0, 0, w, h);
  const r = 40;
  ctx.beginPath();
  ctx.moveTo(6 + r, 6);
  ctx.arcTo(w - 6, 6, w - 6, h - 6, r);
  ctx.arcTo(w - 6, h - 6, 6, h - 6, r);
  ctx.arcTo(6, h - 6, 6, 6, r);
  ctx.arcTo(6, 6, w - 6, 6, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(8, 17, 31, 0.88)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = p.color;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(54, h / 2, 14, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();

  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.text;
  if (p.illustrative) {
    ctx.font = `600 46px ${FONT}`;
    ctx.fillText(p.short, 90, h / 2 - 18, w - 120);
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = PALETTE.orange;
    ctx.fillText("ILUSTRATIVO", 92, h / 2 + 30);
  } else {
    ctx.font = `600 52px ${FONT}`;
    ctx.fillText(p.short, 90, h / 2 + 2, w - 120);
  }
  tex.update();
}

function setEnabled(e, on) {
  e.plane.setEnabled(on);
  e.line.setEnabled(on);
  e.dot.setEnabled(on);
}
