import {
  Axis,
  Color3,
  Curve3,
  DynamicTexture,
  Matrix,
  MeshBuilder,
  PBRMaterial,
  Path3D,
  Space,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { PALETTE } from "../config.js";

/**
 * FLUXO DE ENERGIA em 3D: rotas entre os componentes com partículas luminosas.
 * Cada trecho tem a cor do tipo de energia que transporta:
 *   CC (corrente contínua) azul · CA (corrente alternada) ciano · mecânica laranja.
 *
 * Modos:
 *   accel      Bateria → Inversor → Motor → Redutor → Rodas
 *   regen      Rodas → Redutor → Motor (gerador) → Inversor → Bateria
 *   charge-ac  Rede (CA) → Porta → Carregador de bordo (CA→CC) → Bateria
 *   charge-dc  Carregador rápido (CC) → Porta → Proteção e controle (BMS) → Bateria
 *
 * Tudo fica preso ao prato giratório (coordenadas locais: frente em +Z, piso do carro em y = 0).
 * As rotas aparecem por cima do carro (grupo de renderização 1), como num diagrama.
 */
export const ENERGY_KINDS = {
  cc: { color: PALETTE.blue, label: "Elétrica CC" },
  ca: { color: PALETTE.cyan, label: "Elétrica CA" },
  mec: { color: PALETTE.orange, label: "Mecânica" },
};

const SAMPLES = 96;
const FADE_MS = 450;

export function createEnergyFlow(scene, { parent, items, dims, platformRadius, floorY, spawnLocal, addGlow }) {
  const P = resolvePoints(items, dims, parent);
  const station = createChargingStation(scene, parent, P.port, dims, platformRadius, floorY, spawnLocal);
  addGlow?.(station.glowMeshes);

  const routes = buildRoutes(P, station);
  const modes = {};
  for (const [mode, defs] of Object.entries(routes)) {
    modes[mode] = defs.map((d, i) => makeStream(scene, parent, `${mode}-${i}`, d.points, d.kind));
    for (const s of modes[mode]) addGlow?.([s.dots]);
  }

  const wheels = prepareWheels(items, parent);

  let mode = null;
  let intensity = 0;
  let wheelKmh = 0;
  const fades = Object.fromEntries(Object.keys(modes).map((m) => [m, 0]));
  let stationFade = 0;

  function setStreamVisibility(stream, k, flowing) {
    const on = k > 0.001;
    stream.tube.setEnabled(on);
    stream.dots.setEnabled(on && flowing);
    stream.tubeMat.alpha = 0.32 * k;
    stream.dotMat.alpha = k;
  }

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
    const step = (dt * 1000) / FADE_MS;

    for (const [m, streams] of Object.entries(modes)) {
      const target = m === mode ? 1 : 0;
      const f = fades[m];
      if (f === target && target === 0) continue;
      fades[m] = target > f ? Math.min(1, f + step) : Math.max(0, f - step);
      const flowing = intensity > 0.001 && m === mode;
      for (const s of streams) {
        setStreamVisibility(s, fades[m], flowing);
        if (flowing) animateStream(s, dt, intensity);
      }
    }

    const wantStation = mode === "charge-ac" || mode === "charge-dc";
    stationFade = wantStation ? Math.min(1, stationFade + step) : Math.max(0, stationFade - step);
    station.setVisibility(stationFade);

    if (wheelKmh > 0.05) {
      // Velocidade angular "visual" (proporcional, mais lenta que a real para não virar estroboscópio).
      const angle = wheelKmh * 0.12 * dt;
      for (const w of wheels) w.hub.rotate(Axis.X, angle, Space.LOCAL);
    }
  });

  return {
    setMode(next) {
      mode = next;
      if (next === "charge-ac" || next === "charge-dc") station.setType(next === "charge-dc" ? "dc" : "ac");
    },
    get mode() {
      return mode;
    },
    /** 0 = rota visível sem partículas; 1 = fluxo máximo. */
    setFlow(k) {
      intensity = Math.max(0, Math.min(1, k));
    },
    setWheelSpeed(kmh) {
      wheelKmh = kmh;
    },
    stationMeshes: station.meshes,
  };
}

// ----------------------------------------------------------------------------- pontos

function resolvePoints(items, dims, parent) {
  const c = (id) => items[id]?.center?.clone();
  const bat = items.bateria;
  const inv = c("inversor");
  const mot = c("motor");
  const red = c("redutor") ?? mot?.add(new Vector3(0.25, 0, 0));
  const ecu = c("ecu") ?? bat?.center.add(new Vector3(-dims.width * 0.25, 0.1, bat.size.z * -0.4));

  // Recarga: separa a porta (tomada) do carregador de bordo pelos nomes das peças originais.
  let port = null;
  let obc = null;
  const rec = items.recarga;
  if (rec && !rec.illustrative) {
    const isPort = (m) => m.metadata.evxr.parts.some((n) => /porta_recarga|inlet|tomada|socket|charge_?port/i.test(n));
    const portMeshes = rec.meshes.filter(isPort);
    const obcMeshes = rec.meshes.filter((m) => !isPort(m));
    if (portMeshes.length) port = localCenter(portMeshes, parent);
    if (obcMeshes.length) obc = localCenter(obcMeshes, parent);
  }
  obc ??= c("recarga") ?? bat.center.add(new Vector3(0.2, 0.2, bat.size.z * 0.4));
  // Sem porta modelada: posição típica (lateral traseira esquerda), apenas ilustrativa.
  port ??= new Vector3(-dims.width * 0.46, dims.height * 0.55, -dims.length * 0.36);

  // Rodas: centros por conjunto; o eixo motriz é o mais próximo do motor.
  const wheelCenters = groupBy(items.rodas?.meshes ?? [], (m) => m.metadata.evxr.assembly).map((ms) => localCenter(ms, parent));
  const motorZ = mot?.z ?? 0;
  const driven = [...wheelCenters].sort((a, b) => Math.abs(a.z - motorZ) - Math.abs(b.z - motorZ)).slice(0, 2);

  return { bat, inv, mot, red, ecu, port, obc, driven };
}

function buildRoutes(P, station) {
  const { bat, inv, mot, red, ecu, port, obc, driven } = P;
  const lift = (v, dy) => v.add(new Vector3(0, dy, 0));
  const mid = (a, b, dy = 0) => lift(Vector3.Lerp(a, b, 0.5), dy);
  const batTop = (towards) =>
    new Vector3(
      clamp(towards.x, bat.min.x + 0.1, bat.max.x - 0.1) * 0.4,
      bat.max.y + 0.03,
      clamp(towards.z, bat.min.z + 0.15, bat.max.z - 0.15),
    );
  const batCore = new Vector3(bat.center.x, bat.max.y + 0.03, bat.center.z);
  const reverse = (pts) => [...pts].reverse();

  const ccOut = [batCore, batTop(inv), mid(batTop(inv), inv, 0.12), inv];
  const caMotor = [inv, mid(inv, mot, 0.07), mot];
  const mecRed = [mot, mid(mot, red, 0.03), red];
  const toWheel = (w) => [red, new Vector3(w.x * 0.55, Vector3.Lerp(red, w, 0.5).y, Vector3.Lerp(red, w, 0.5).z), w];

  const accel = [
    { kind: "cc", points: ccOut },
    { kind: "ca", points: caMotor },
    { kind: "mec", points: mecRed },
    ...driven.map((w) => ({ kind: "mec", points: toWheel(w) })),
  ];
  const regen = [
    ...driven.map((w) => ({ kind: "mec", points: reverse(toWheel(w)) })),
    { kind: "mec", points: reverse(mecRed) },
    { kind: "ca", points: reverse(caMotor) },
    { kind: "cc", points: reverse(ccOut) },
  ];
  const portToObc = [port, mid(port, obc, 0.15), obc];
  const obcToBat = [obc, batTop(obc), batCore];
  const portToEcu = [port, mid(port, ecu, 0.12), ecu];
  const ecuToBat = [ecu, batTop(ecu), batCore];
  return {
    accel,
    regen,
    "charge-ac": [
      { kind: "ca", points: station.cablePath("ac") },
      { kind: "ca", points: portToObc },
      { kind: "cc", points: obcToBat },
    ],
    "charge-dc": [
      { kind: "cc", points: station.cablePath("dc") },
      { kind: "cc", points: portToEcu },
      { kind: "cc", points: ecuToBat },
    ],
  };
}

// ----------------------------------------------------------------------------- trechos

function makeStream(scene, parent, name, points, kind) {
  const curve = Curve3.CreateCatmullRomSpline(points, 12, false).getPoints();
  const path = new Path3D(curve);
  const length = Math.max(0.2, path.length());
  const color = Color3.FromHexString(ENERGY_KINDS[kind].color);

  const tubeMat = new StandardMaterial(`mat-flow-tube-${name}`, scene);
  tubeMat.disableLighting = true;
  tubeMat.emissiveColor = color.scale(0.75);
  tubeMat.diffuseColor = Color3.Black();
  tubeMat.alpha = 0;
  tubeMat.fogEnabled = false;
  const tube = MeshBuilder.CreateTube(`flow-tube:${name}`, { path: curve, radius: 0.016, tessellation: 8 }, scene);
  tube.parent = parent;
  tube.material = tubeMat;
  tube.renderingGroupId = 1;
  tube.isPickable = false;
  tube.setEnabled(false);

  const dotMat = new StandardMaterial(`mat-flow-dots-${name}`, scene);
  dotMat.disableLighting = true;
  dotMat.emissiveColor = color;
  dotMat.diffuseColor = Color3.Black();
  dotMat.fogEnabled = false;
  const dots = MeshBuilder.CreateSphere(`flow-dots:${name}`, { diameter: 0.07, segments: 6 }, scene);
  dots.parent = parent;
  dots.material = dotMat;
  dots.renderingGroupId = 1;
  dots.isPickable = false;
  dots.alwaysSelectAsActiveMesh = true;
  const count = Math.max(6, Math.round(length * 11));
  const buffer = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) Matrix.IdentityReadOnly.copyToArray(buffer, i * 16);
  dots.thinInstanceSetBuffer("matrix", buffer, 16, false);
  dots.setEnabled(false);

  // Tabela de pontos amostrados (sem alocação por quadro).
  const table = new Float32Array((SAMPLES + 1) * 3);
  for (let i = 0; i <= SAMPLES; i++) {
    const p = path.getPointAt(i / SAMPLES);
    table.set([p.x, p.y, p.z], i * 3);
  }
  return { name, kind, tube, tubeMat, dots, dotMat, buffer, table, count, length, offset: Math.random() };
}

function animateStream(s, dt, intensity) {
  const speed = 0.35 + 1.5 * intensity; // m/s ao longo da rota
  s.offset = (s.offset + (speed * dt) / s.length) % 1;
  const size = 0.6 + 0.7 * intensity;
  for (let i = 0; i < s.count; i++) {
    const t = (i / s.count + s.offset) % 1;
    const f = t * SAMPLES;
    const i0 = Math.floor(f);
    const a = f - i0;
    const j = i0 * 3;
    const k = Math.min(SAMPLES, i0 + 1) * 3;
    const fade = Math.min(1, t / 0.08, (1 - t) / 0.08);
    const sc = size * fade;
    const o = i * 16;
    s.buffer[o] = sc;
    s.buffer[o + 5] = sc;
    s.buffer[o + 10] = sc;
    s.buffer[o + 12] = s.table[j] + (s.table[k] - s.table[j]) * a;
    s.buffer[o + 13] = s.table[j + 1] + (s.table[k + 1] - s.table[j + 1]) * a;
    s.buffer[o + 14] = s.table[j + 2] + (s.table[k + 2] - s.table[j + 2]) * a;
  }
  s.dots.thinInstanceBufferUpdated("matrix");
}

// ----------------------------------------------------------------------------- estação de recarga

/**
 * Carregador externo ao lado da porta de recarga, fora da plataforma.
 * CA: pedestal com wallbox (mais baixo). CC: gabinete de recarga rápida (mais alto).
 */
function createChargingStation(scene, parent, port, dims, platformRadius, floorY, spawnLocal) {
  const sideways = Math.abs(port.x) > dims.width * 0.25;
  const out = platformRadius + 0.75;
  const base = sideways
    ? new Vector3(Math.sign(port.x) * out, floorY, port.z)
    : new Vector3(port.x, floorY, Math.sign(port.z || -1) * out);

  const root = new TransformNode("charging-station", scene);
  root.parent = parent;
  root.position.copyFrom(base);
  const face = base.subtract(spawnLocal);
  root.rotation.y = Math.atan2(face.x, face.z); // tela voltada para quem chega pelo ponto de partida

  const bodyMat = new PBRMaterial("mat-station-body", scene);
  bodyMat.albedoColor = Color3.FromHexString("#1a2738").toLinearSpace();
  bodyMat.metallic = 0.6;
  bodyMat.roughness = 0.35;
  bodyMat.alpha = 1;

  const accent = (hex) => {
    const m = new StandardMaterial(`mat-station-accent-${hex}`, scene);
    m.disableLighting = true;
    m.emissiveColor = Color3.FromHexString(hex);
    return m;
  };

  // CA: pedestal + wallbox
  const ac = new TransformNode("station-ac", scene);
  ac.parent = root;
  const pole = MeshBuilder.CreateBox("station-ac-pole", { width: 0.12, height: 1.3, depth: 0.12 }, scene);
  pole.position.y = 0.65;
  const box = MeshBuilder.CreateBox("station-ac-box", { width: 0.36, height: 0.46, depth: 0.15 }, scene);
  box.position.y = 1.12;
  const acStrip = MeshBuilder.CreateBox("station-ac-strip", { width: 0.3, height: 0.025, depth: 0.16 }, scene);
  acStrip.position.y = 0.92;
  acStrip.material = accent(PALETTE.cyan);
  for (const m of [pole, box]) m.material = bodyMat;
  const acScreen = screenPlane(scene, "ac", 0.32, 0.2, ["RECARGA CA", "carregador de bordo"], PALETTE.cyan);
  acScreen.position.set(0, 1.16, -0.077);
  for (const m of [pole, box, acStrip, acScreen]) m.parent = ac;

  // CC: gabinete
  const dc = new TransformNode("station-dc", scene);
  dc.parent = root;
  const cab = MeshBuilder.CreateBox("station-dc-cabinet", { width: 0.62, height: 1.8, depth: 0.42 }, scene);
  cab.position.y = 0.9;
  cab.material = bodyMat;
  const dcStrip = MeshBuilder.CreateBox("station-dc-strip", { width: 0.64, height: 0.03, depth: 0.44 }, scene);
  dcStrip.position.y = 1.72;
  dcStrip.material = accent(PALETTE.blue);
  const dcScreen = screenPlane(scene, "dc", 0.46, 0.3, ["RECARGA RÁPIDA", "CC · corrente contínua"], PALETTE.blue);
  dcScreen.position.set(0, 1.3, -0.213);
  for (const m of [cab, dcStrip, dcScreen]) m.parent = dc;

  const meshes = [pole, box, acStrip, acScreen, cab, dcStrip, dcScreen];
  for (const m of meshes) m.isPickable = false;
  let type = "ac";
  root.setEnabled(false);

  // Saída do cabo (local do prato), voltada para o carro.
  const toCar = port.subtract(base);
  toCar.y = 0;
  toCar.normalize();
  const outlet = (t) => base.add(toCar.scale(t === "dc" ? 0.24 : 0.1)).add(new Vector3(0, t === "dc" ? 1.05 : 0.98, 0));

  return {
    meshes,
    glowMeshes: [acStrip, dcStrip],
    setType(t) {
      type = t;
      ac.setEnabled(t === "ac");
      dc.setEnabled(t === "dc");
    },
    setVisibility(k) {
      root.setEnabled(k > 0.001);
      root.scaling.setAll(0.9 + 0.1 * k);
      ac.setEnabled(type === "ac");
      dc.setEnabled(type === "dc");
    },
    /** Cabo com "barriga" até a porta de recarga. */
    cablePath(t) {
      const a = outlet(t);
      const b = port.clone();
      const sag = Vector3.Lerp(a, b, 0.5);
      sag.y = floorY + 0.12;
      const nearPort = b.add(toCar.scale(-0.25));
      nearPort.y = b.y - 0.15;
      return [a, Vector3.Lerp(a, sag, 0.5).add(new Vector3(0, -0.15, 0)), sag, nearPort, b];
    },
  };
}

function screenPlane(scene, id, w, h, lines, color) {
  const tex = new DynamicTexture(`tex-station-${id}`, { width: 512, height: Math.round((512 * h) / w) }, scene, true);
  const ctx = tex.getContext();
  const { width: tw, height: th } = tex.getSize();
  ctx.fillStyle = "#06121f";
  ctx.fillRect(0, 0, tw, th);
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, tw - 16, th - 16);
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(th * 0.26)}px 'Segoe UI', Arial, sans-serif`;
  ctx.fillText(lines[0], tw / 2, th * 0.48, tw - 40);
  ctx.fillStyle = "#F5F7FA";
  ctx.font = `400 ${Math.round(th * 0.16)}px 'Segoe UI', Arial, sans-serif`;
  ctx.fillText(lines[1], tw / 2, th * 0.76, tw - 40);
  tex.update();
  const mat = new StandardMaterial(`mat-station-screen-${id}`, scene);
  mat.disableLighting = true;
  mat.emissiveTexture = tex;
  mat.diffuseColor = Color3.Black();
  const plane = MeshBuilder.CreatePlane(`station-screen-${id}`, { width: w, height: h }, scene);
  plane.material = mat;
  return plane;
}

// ----------------------------------------------------------------------------- rodas

/** Rodas (e discos de freio) giram em torno do eixo X do carro; pinças ficam paradas. */
function prepareWheels(items, parent) {
  const spinning = [
    ...(items.rodas?.meshes ?? []),
    ...(items.freios?.meshes ?? []).filter((m) => {
      const parts = m.metadata.evxr.parts;
      return parts.some((n) => /disco|disc|rotor/i.test(n)) && !parts.some((n) => /pinca|pinça|caliper/i.test(n));
    }),
  ];
  // Um nó "eixo" por roda, centrado no cubo e alinhado ao carro (X = eixo das rodas).
  // Ele é criado no prato e depois movido para dentro do conjunto original (setParent
  // preserva a posição), para que a vista explodida continue movendo a roda inteira.
  return groupBy(spinning, (m) => m.metadata.evxr.assembly).map((meshes) => {
    const wheelMeshes = meshes.filter((m) => m.metadata.evxr.component === "rodas");
    const center = worldCenter(wheelMeshes.length ? wheelMeshes : meshes);
    const hub = new TransformNode(`wheel-hub:${meshes[0].metadata.evxr.assembly}`, parent.getScene());
    hub.parent = parent;
    hub.setAbsolutePosition(center);
    hub.rotationQuaternion = null;
    hub.rotation.setAll(0);
    hub.computeWorldMatrix(true);
    const assemblyNode = meshes[0].parent;
    if (assemblyNode) hub.setParent(assemblyNode);
    for (const m of meshes) m.setParent(hub);
    return { hub };
  });
}

// ----------------------------------------------------------------------------- utilidades

function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map.values()];
}

function worldCenter(meshes) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    const b = m.getBoundingInfo().boundingBox;
    min.minimizeInPlace(b.minimumWorld);
    max.maximizeInPlace(b.maximumWorld);
  }
  return Vector3.Center(min, max);
}

function localCenter(meshes, parent) {
  const w = worldCenter(meshes);
  return Vector3.TransformCoordinates(w, parent.getWorldMatrix().clone().invert());
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
