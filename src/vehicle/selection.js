import { Color3, DynamicTexture, Mesh, MeshBuilder, PointerEventTypes, StandardMaterial, Vector3 } from "../babylon.js";
import { PALETTE } from "../config.js";
import { INTERNAL_COMPONENTS, isSelectableComponent } from "./components.js";
import { getContent } from "./componentContent.js";

/**
 * Seleção de componentes por clique, toque, gatilho do controle VR ou pinça/toque com a mão.
 * O WebXR do Babylon converte gatilho/pinça em eventos de ponteiro, então o mesmo
 * POINTERTAP atende mouse, tela de toque e Meta Quest.
 *
 *  - Hover com mouse: brilho ciano leve + dica (HTML) com o nome.
 *  - Hover com o raio do controle/mão em VR: brilho + etiqueta 3D com o nome junto ao ponto apontado.
 *  - Toque direto com o dedo (hand tracking): componentes internos e legendas aceitam "near pick".
 *  - Duplo clique/toque: ação rápida do componente (ex.: abrir/fechar portas).
 *  - Toque fora das peças (tela de toque): onEmptyTap — no celular, fecha a seleção.
 *  - Seleção: brilho pulsante na cor do componente.
 */
export function createSelection(scene, { meshesByComponent, states, onSelect, onDoubleSelect, onHover, onEmptyTap }) {
  let selected = null;
  const white = new Color3(1, 1, 1);
  const hoverColor = Color3.FromHexString(PALETTE.cyan).toLinearSpace();
  const colorOf = (id) => Color3.FromHexString(getContent(id).color).toLinearSpace();

  const componentOf = (mesh) => {
    const e = mesh?.metadata?.evxr;
    if (!e) return null;
    const id = e.labelFor ?? (e.vehicle ? e.component : null);
    return isSelectableComponent(id) ? id : null;
  };

  const setChannel = (id, channel, color, k) => {
    for (const m of meshesByComponent.get(id) ?? []) states.setTint(m, channel, color, k);
  };

  // Por desempenho, o Babylon só testa no movimento do ponteiro as malhas que pedem isso.
  // Toque direto com o dedo só nos componentes internos (evita toques acidentais na carroceria).
  for (const [id, meshes] of meshesByComponent) {
    for (const m of meshes) {
      m.enablePointerMoveEvents = true;
      if (INTERNAL_COMPONENTS.includes(id)) m.isNearPickable = true;
    }
  }

  // Hover: um registro por ponteiro (mouse, controle esquerdo, controle direito...).
  const hoverByPointer = new Map();
  let hoveredSet = new Set();
  function refreshHover() {
    const next = new Set([...hoverByPointer.values()].filter(Boolean));
    for (const id of hoveredSet) if (!next.has(id)) setChannel(id, "hover", hoverColor, 0);
    for (const id of next) if (!hoveredSet.has(id)) setChannel(id, "hover", hoverColor, 0.045);
    hoveredSet = next;
  }

  const tag = createHoverTag(scene);

  scene.onPointerObservable.add((pi) => {
    const type = pi.event?.pointerType;
    if (pi.type === PointerEventTypes.POINTERTAP) {
      const mesh = pi.pickInfo?.pickedMesh;
      const id = componentOf(mesh);
      if (id) onSelect?.(id, mesh);
      else if (pi.event?.pointerType === "touch") onEmptyTap?.(); // toque fora das peças (celular/tablet)
    } else if (pi.type === PointerEventTypes.POINTERDOUBLETAP) {
      const id = componentOf(pi.pickInfo?.pickedMesh);
      if (id) onDoubleSelect?.(id);
    } else if (pi.type === PointerEventTypes.POINTERMOVE) {
      if (type === "mouse") {
        // Durante o arraste da câmera não há hover.
        const id = pi.event.buttons ? null : componentOf(pi.pickInfo?.pickedMesh);
        hoverByPointer.set("mouse", id);
        refreshHover();
        onHover?.(id, pi.event.clientX, pi.event.clientY, pi.pickInfo?.pickedMesh);
      } else if (type === "xr") {
        const pick = pi.pickInfo;
        const id = componentOf(pick?.pickedMesh);
        hoverByPointer.set(pi.event.pointerId, id);
        refreshHover();
        if (id && pick.pickedPoint) tag.show(getContent(id).short, pick.pickedPoint, pi.event.pointerId);
        else tag.hide(pi.event.pointerId);
      }
    }
  });

  // Pulso do componente selecionado (só as malhas dele são atualizadas).
  let pulseColor = white;
  scene.onBeforeRenderObservable.add(() => {
    if (!selected) return;
    const k = 0.2 + 0.16 * Math.sin(performance.now() / 260);
    setChannel(selected, "select", pulseColor, k);
  });

  return {
    get selected() {
      return selected;
    },
    setSelected(id) {
      if (selected) setChannel(selected, "select", white, 0);
      selected = id;
      if (id) pulseColor = colorOf(id);
    },
    clearHover() {
      hoverByPointer.clear();
      refreshHover();
      tag.hide();
      onHover?.(null);
    },
  };
}

/** Etiqueta 3D que aparece junto ao ponto apontado pelo raio em VR (criada só no primeiro uso). */
function createHoverTag(scene) {
  let plane = null;
  let tex = null;
  let owner = null;
  let lastText = "";
  const ensure = () => {
    if (plane) return;
    tex = new DynamicTexture("tex-hover-tag", { width: 512, height: 112 }, scene, true);
    tex.hasAlpha = true;
    const mat = new StandardMaterial("mat-hover-tag", scene);
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.emissiveTexture = tex;
    mat.opacityTexture = tex;
    mat.fogEnabled = false;
    plane = MeshBuilder.CreatePlane("vr-hover-tag", { width: 0.34, height: 0.074 }, scene);
    plane.material = mat;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.renderingGroupId = 1;
    plane.isPickable = false;
  };
  const draw = (text) => {
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 512, 112);
    ctx.fillStyle = "rgba(8, 17, 31, 0.9)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(4, 4, 504, 104, 52);
    else ctx.rect(4, 4, 504, 104);
    ctx.fill();
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = "600 46px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 58, 470);
    tex.update();
  };
  return {
    show(text, point, pointerId) {
      ensure();
      owner = pointerId;
      if (text !== lastText) {
        draw(text);
        lastText = text;
      }
      const cam = scene.activeCamera;
      const toCam = cam.globalPosition.subtract(point).normalize();
      plane.position.copyFrom(point).addInPlace(toCam.scale(0.12)).addInPlace(new Vector3(0, 0.08, 0));
      plane.setEnabled(true);
    },
    hide(pointerId) {
      if (!plane || (pointerId !== undefined && pointerId !== owner)) return;
      plane.setEnabled(false);
    },
  };
}
