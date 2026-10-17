import { Mesh, TransformNode, Vector3 } from "../babylon.js";

/**
 * Catálogo de componentes do veículo e regras para reconhecê-los pelos nomes
 * dos nós do GLB (nome da malha e de seus ancestrais).
 *
 * A ORDEM IMPORTA: a primeira regra que casar vence. Por isso "Cabo_HV_Inversor_Motor"
 * cai em cabos (e não em inversor/motor) e "Porta_Recarga" cai em recarga (e não em portas).
 * Ao receber o GLB definitivo, rode `evxr.componentes()` no console e ajuste os padrões
 * aqui para os nomes usados no novo arquivo.
 *
 * Componentes ausentes no modelo NÃO são inventados: as próximas etapas usarão
 * representações esquemáticas identificadas como ilustrativas.
 */
export const COMPONENT_CATALOG = [
  { id: "cabos_hv", label: "Cabos de alta tensão", patterns: [/cabo_?hv|hv_?cable|cabo.*alta.*tens/i] },
  { id: "recarga", label: "Sistema de recarga", patterns: [/porta_recarga|carregador|obc|charg|tomada|inlet/i] },
  { id: "portas", label: "Portas", patterns: [/porta|door/i] },
  { id: "bateria", label: "Bateria de alta tensão", patterns: [/bateria|battery/i] },
  { id: "ecu", label: "Unidade de controle eletrônico (BMS/ECU)", patterns: [/bms|ecu|vcu|controlador|controller/i] },
  { id: "inversor", label: "Inversor de frequência", patterns: [/inversor|inverter/i] },
  { id: "motor", label: "Motor elétrico", patterns: [/motor/i] },
  { id: "redutor", label: "Redutor / transmissão", patterns: [/redutor|reducer|transmiss|gearbox|cambio|câmbio/i] },
  { id: "refrigeracao", label: "Sistema de refrigeração", patterns: [/refrigera|radiador|radiator|cooling|arrefec/i] },
  { id: "freios", label: "Freios (discos e pinças)", patterns: [/disco|disc|pinca|pinça|brake_?disc|caliper|freio/i] },
  // Interior antes das rodas: "steeringwheel" (volante) não é roda.
  { id: "interior", label: "Interior", patterns: [/interior|assento|encosto|apoio_?cabeca|volante|seat|steering|console|dashboard|dash_|leather|tela|display/i] },
  { id: "rodas", label: "Rodas e pneus", patterns: [/roda|wheel|pneu|tire|tyre|velg/i] },
  { id: "chassi", label: "Chassi", patterns: [/chassi|chassis|longarina|subframe/i] },
  { id: "vidros", label: "Vidros", patterns: [/vidro|glass|window|windshield|windscreen|para-?brisa/i] },
  {
    id: "carroceria",
    label: "Carroceria",
    patterns: [
      /carroceria|body|retrovisor|farol|lanterna|headlight|taillight|brakelight|reversinglight|indicator|lamp|para-?choque|bumper|capo|hood|teto|roof/i,
    ],
  },
];

export const COMPONENT_LABELS = Object.fromEntries(COMPONENT_CATALOG.map((c) => [c.id, c.label]));

/** Componentes do trem de força: recebem legenda no raio X e, se ausentes do modelo, representação ilustrativa. */
export const INTERNAL_COMPONENTS = ["bateria", "motor", "inversor", "redutor", "ecu", "recarga", "refrigeracao", "cabos_hv"];

/** Peças que não abrem painel ao clicar (o clique "atravessa" para o que está atrás delas). */
const NON_SELECTABLE = new Set(["vidros"]);
export const isSelectableComponent = (id) => !!id && !NON_SELECTABLE.has(id);

/**
 * Componente de uma malha pelo nome dela e dos ancestrais (do mais próximo ao mais distante).
 * `extra` ({ id: [regex] }) são regras do modelo carregado (config: extraPatterns), testadas primeiro.
 */
export function classifyMesh(mesh, stopAt, extra = {}) {
  const extraRules = Object.entries(extra).map(([id, patterns]) => ({ id, patterns }));
  for (let node = mesh; node && node !== stopAt; node = node.parent) {
    for (const c of extraRules) if (c.patterns.some((p) => p.test(node.name))) return c.id;
    for (const c of COMPONENT_CATALOG) if (c.patterns.some((p) => p.test(node.name))) return c.id;
  }
  return "outros";
}

/**
 * Reorganiza o carro em conjuntos (TransformNodes com pivô no centro de cada conjunto)
 * e, opcionalmente, une malhas de mesmo material dentro de cada conjunto para reduzir
 * draw calls — essencial para manter 72 fps no Meta Quest.
 *
 * Resultado: container → asm:<conjunto> → malhas com metadata.evxr = { vehicle, component, assembly, parts }.
 * Raio X, exploded view e seleção (próximas etapas) operam sobre essa estrutura,
 * independentemente de as malhas terem sido unidas ou não.
 */
export function organizeVehicle(vehicle, { mergeStrategy = "assembly", keepSeparate = [], mergeAcross = [] } = {}) {
  const { container, gltfRoot } = vehicle;
  const scene = container.getScene();
  const level = findAssemblyLevel(gltfRoot);
  const extra = vehicle.model.extraPatterns ?? {};

  const entries = vehicle.meshes.map((mesh) => {
    const component = classifyMesh(mesh, gltfRoot, extra);
    const assembly = mergeStrategy === "component" ? component : assemblyOf(mesh, level).name;
    return { mesh, component, assembly, name: mesh.name };
  });

  // Componentes que se movem em bloco (mesma regra na vista explodida, sem pivô próprio) são unidos
  // também entre conjuntos — só quando o conjunto não tem nada que se mova sozinho (porta, roda…).
  if (mergeStrategy === "assembly" && mergeAcross.length) {
    const across = new Set(mergeAcross);
    const kinds = new Map();
    for (const e of entries) {
      if (!kinds.has(e.assembly)) kinds.set(e.assembly, new Set());
      kinds.get(e.assembly).add(e.component);
    }
    for (const e of entries) {
      const pure = [...kinds.get(e.assembly)].every((c) => across.has(c));
      if (pure && canMerge(e.mesh, mergeStrategy, keepSeparate)) e.assembly = `bloco:${e.component}`;
    }
  }

  const byAssembly = new Map();
  for (const e of entries) {
    if (!byAssembly.has(e.assembly)) byAssembly.set(e.assembly, []);
    byAssembly.get(e.assembly).push(e);
  }

  const finalMeshes = [];
  const assemblies = [];
  for (const [assemblyName, list] of byAssembly) {
    const node = new TransformNode(`asm:${assemblyName}`, scene);
    node.parent = container;
    const { min, max } = worldBounds(list.map((e) => e.mesh));
    node.setAbsolutePosition(Vector3.Center(min, max));
    node.metadata = { evxr: { assembly: assemblyName, components: [...new Set(list.map((e) => e.component))] } };
    assemblies.push(node);

    const buckets = new Map();
    for (const e of list) {
      const key = canMerge(e.mesh, mergeStrategy, keepSeparate)
        ? [e.component, e.mesh.material?.uniqueId ?? "none", e.mesh.sideOrientation, e.mesh.getVerticesDataKinds().sort().join(",")].join("|")
        : `solo:${e.mesh.uniqueId}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(e);
    }

    for (const items of buckets.values()) {
      const parts = items.map((i) => i.name);
      let merged = null;
      if (items.length > 1) {
        try {
          merged = Mesh.MergeMeshes(items.map((i) => i.mesh), true, true, undefined, false, false);
        } catch (err) {
          console.warn(`[EV XR] Não foi possível unir malhas de ${assemblyName}:`, err);
        }
      }
      if (merged) {
        merged.name = `${assemblyName}::${items[0].mesh.material?.name ?? "material"}`;
        merged.setParent(node);
        finalMeshes.push(tag(merged, items[0].component, assemblyName, parts));
      } else {
        for (const i of items) {
          i.mesh.setParent(node);
          finalMeshes.push(tag(i.mesh, i.component, assemblyName, [i.name]));
        }
      }
    }
  }

  // Sobrou apenas a hierarquia vazia do glTF.
  gltfRoot.dispose(false, false);
  vehicle.gltfRoot = null;

  const before = vehicle.meshes.length;
  vehicle.meshes = finalMeshes;
  vehicle.assemblies = assemblies;
  vehicle.optimization = { strategy: mergeStrategy, meshesBefore: before, meshesAfter: finalMeshes.length };
  return vehicle;
}

export function summarizeComponents(vehicle) {
  const meshes = vehicle?.meshes ?? [];
  const rows = [...COMPONENT_CATALOG, { id: "outros", label: "Não classificado" }].map((c) => {
    const own = meshes.filter((m) => m.metadata?.evxr?.component === c.id);
    return {
      id: c.id,
      componente: c.label,
      presente: own.length > 0 ? "sim" : "—",
      malhas: own.length,
      pecasOriginais: own.reduce((n, m) => n + m.metadata.evxr.parts.length, 0),
    };
  });
  return rows.filter((r) => r.id !== "outros" || r.malhas > 0);
}

function canMerge(mesh, strategy, keepSeparate) {
  return (
    strategy !== "none" &&
    mesh.getClassName() === "Mesh" &&
    !mesh.skeleton &&
    !mesh.morphTargetManager &&
    !keepSeparate.some((p) => p.test(mesh.name))
  );
}

function tag(mesh, component, assembly, parts) {
  mesh.metadata = { ...(mesh.metadata || {}), evxr: { vehicle: true, component, assembly, parts } };
  mesh.isPickable = isSelectableComponent(component);
  return mesh;
}

/**
 * Centro e limites de cada componente no referencial do prato giratório (`parent`),
 * medidos com o prato parado. Usado por legendas, foco de câmera e representações ilustrativas.
 * Também estima a posição dos eixos a partir das rodas (para posicionar peças ilustrativas).
 */
export function computeComponentLayout(vehicle, parent) {
  const savedSpin = parent.rotation.y;
  parent.rotation.y = 0;
  parent.computeWorldMatrix(true);
  const origin = parent.getAbsolutePosition().clone();

  const groups = new Map();
  for (const mesh of vehicle.meshes) {
    if (!mesh.isEnabled()) continue;
    const id = mesh.metadata.evxr.component;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(mesh);
  }

  const layout = {};
  for (const [id, meshes] of groups) {
    const { min, max } = worldBounds(meshes);
    min.subtractInPlace(origin);
    max.subtractInPlace(origin);
    layout[id] = { id, meshes, min, max, center: Vector3.Center(min, max), size: max.subtract(min), illustrative: false };
  }

  // Eixos: centros dos conjuntos de roda, separados em dianteiro (+Z) e traseiro (-Z).
  const wheelCenters = [];
  for (const mesh of groups.get("rodas") ?? []) {
    const { min, max } = worldBounds([mesh]);
    wheelCenters.push({ c: Vector3.Center(min, max).subtractInPlace(origin), r: (max.y - min.y) / 2 });
  }
  let axles = null;
  if (wheelCenters.length >= 2) {
    const zs = wheelCenters.map((w) => w.c.z);
    axles = {
      front: Math.max(...zs),
      rear: Math.min(...zs),
      wheelRadius: Math.max(...wheelCenters.map((w) => w.r)),
    };
  }

  parent.rotation.y = savedSpin;
  parent.computeWorldMatrix(true);
  return { components: layout, axles };
}

/** Desce pelos nós "invólucro" (um só filho, sem geometria) até o nível que contém os conjuntos. */
function findAssemblyLevel(root) {
  let level = root;
  while (level.getChildren().length === 1 && !(level.getTotalVertices?.() > 0)) {
    level = level.getChildren()[0];
  }
  return level;
}

function assemblyOf(mesh, level) {
  let node = mesh;
  while (node.parent && node.parent !== level) node = node.parent;
  return node.parent === level ? node : mesh;
}

function worldBounds(meshes) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    const box = m.getBoundingInfo().boundingBox;
    min.minimizeInPlace(box.minimumWorld);
    max.maximizeInPlace(box.maximumWorld);
  }
  return { min, max };
}
