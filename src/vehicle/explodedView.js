import { Animation, CubicEase, EasingFunction, Matrix, Quaternion, Vector3 } from "../babylon.js";

const FPS = 60;

/**
 * EXPLODED VIEW: separa os conjuntos do veículo mantendo a orientação de cada peça
 * (só translação) e restaura a montagem original. Animações do Babylon (Animation +
 * CubicEase), escalonadas: carroceria primeiro, depois interior, rodas e trem de força.
 *
 * Regras por componente (referencial do carro: frente +Z, lado esquerdo −X):
 *   up      sobe (m)              lateral  afasta para o lado do conjunto (m)
 *   radial  afasta do centro do carro no plano do piso (m)
 *   wave    ordem de saída (0 = primeiro)
 * Bateria e chassi ficam no lugar e servem de referência. As distâncias escalam com o
 * tamanho do carro e são limitadas, para nada sair do campo de visão.
 */
const RULES = {
  carroceria: { up: 1.25, wave: 0 },
  vidros: { up: 1.45, wave: 0 },
  portas: { up: 1.25, lateral: 0.3, wave: 0 },
  interior: { up: 0.62, wave: 1 },
  rodas: { lateral: 0.6, wave: 2 },
  freios: { lateral: 0.6, wave: 2 },
  motor: { radial: 0.55, up: 0.22, wave: 3 },
  redutor: { radial: 0.55, lateral: 0.25, up: 0.12, wave: 3 },
  inversor: { radial: 0.45, up: 0.62, wave: 3 },
  ecu: { radial: 0.35, lateral: 0.35, up: 0.4, wave: 3 },
  recarga: { radial: 0.5, up: 0.45, wave: 3 },
  refrigeracao: { radial: 0.7, up: 0.2, wave: 3 },
  cabos_hv: { up: 0.32, wave: 3 },
  outros: { radial: 0.35, wave: 3 },
  bateria: { wave: 3 },
  chassi: { wave: 3 },
};
/** Prioridade para escolher a regra de um conjunto que mistura componentes (ex.: roda + freio). */
const PRIORITY = Object.keys(RULES);

export function createExplodedView(scene, { vehicle, parent, dims, schematics, onProgress }) {
  const container = vehicle.container;
  const scale = Math.max(0.6, Math.min(1.4, dims.length / 4.7));

  // Deslocamento no referencial do carro → espaço local do contêiner (que pode estar girado/escalado).
  const containerRS = Matrix.Compose(
    container.scaling,
    container.rotationQuaternion ?? Quaternion.FromEulerVector(container.rotation),
    Vector3.Zero(),
  );
  const carToContainer = containerRS.clone().invert();

  const toLocal = () => parent.getWorldMatrix().clone().invert();
  const localCenter = (node, inv) => {
    const { min, max } = node.getHierarchyBoundingVectors(true, (m) => typeof m.getTotalVertices === "function" && m.getTotalVertices() > 0);
    return Vector3.TransformCoordinates(Vector3.Center(min, max), inv);
  };

  const entries = [];
  const inv = toLocal();
  const carCenter = new Vector3(0, dims.height / 2, 0);
  const add = (node, components, toNodeSpace) => {
    const id = PRIORITY.find((p) => components.includes(p)) ?? "outros";
    const rule = RULES[id];
    const c = localCenter(node, inv);
    const radialDir = new Vector3(c.x - carCenter.x, 0, c.z - carCenter.z);
    if (radialDir.lengthSquared() > 1e-4) radialDir.normalize();
    const lateralDir = new Vector3(Math.sign(c.x - carCenter.x) || 1, 0, 0);
    const disp = new Vector3(0, (rule.up ?? 0) * scale, 0)
      .add(radialDir.scale((rule.radial ?? 0) * scale))
      .add(lateralDir.scale((rule.lateral ?? 0) * scale));
    // Limite: nada se afasta mais que ~1,6 m na horizontal nem sobe acima de ~1,6 m.
    const horiz = Math.hypot(disp.x, disp.z);
    if (horiz > 1.6) disp.scaleInPlace(1.6 / horiz);
    disp.y = Math.min(disp.y, 1.6);
    entries.push({
      node,
      id,
      wave: rule.wave ?? 3,
      home: node.position.clone(),
      offset: toNodeSpace(disp),
    });
  };

  for (const node of vehicle.assemblies ?? []) {
    add(node, node.metadata?.evxr?.components ?? [], (d) => Vector3.TransformNormal(d, carToContainer));
  }
  // Peças ilustrativas ficam presas direto ao prato giratório (já no referencial do carro).
  for (const m of schematics?.meshes ?? []) add(m, [m.metadata.evxr.component], (d) => d);

  let exploded = false;
  let running = 0;
  const ease = new CubicEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

  let generation = 0;
  function animate(toExploded) {
    exploded = toExploded;
    running = entries.length;
    // Reverter no meio do caminho encerra as animações antigas: os retornos delas são ignorados.
    const gen = ++generation;
    // Sem as peças internas no GLB, as ilustrativas acompanham a desmontagem (e somem ao remontar).
    if (toExploded) schematics?.setVisibility(1, "explode");
    const waves = 4;
    for (const e of entries) {
      scene.stopAnimation(e.node, "explode");
      const order = toExploded ? e.wave : waves - 1 - e.wave;
      const delay = order * 10;
      const duration = 54;
      const from = e.node.position.clone();
      const to = toExploded ? e.home.add(e.offset) : e.home.clone();
      const anim = new Animation("explode", "position", FPS, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
      anim.setKeys([
        { frame: 0, value: from },
        { frame: delay, value: from },
        { frame: delay + duration, value: to },
      ]);
      anim.setEasingFunction(ease);
      scene.beginDirectAnimation(e.node, [anim], 0, delay + duration, false, 1, () => {
        if (gen !== generation) return;
        running = Math.max(0, running - 1);
        if (running) return;
        if (!exploded) schematics?.setVisibility(0, "explode");
        onProgress?.(exploded, true);
      });
    }
    onProgress?.(exploded, false);
  }

  return {
    get exploded() {
      return exploded;
    },
    /** Há animação de montagem/desmontagem em andamento (legendas acompanham as peças). */
    get animating() {
      return running > 0;
    },
    set(on) {
      if (on === exploded) return;
      animate(on);
    },
    toggle() {
      animate(!exploded);
      return exploded;
    },
  };
}
