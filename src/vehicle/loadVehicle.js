import { ImportMeshAsync, Tools, TransformNode, Vector3 } from "../babylon.js";
import { URL_PARAMS, VEHICLE } from "../config.js";

/**
 * Escolhe o primeiro modelo disponível em `public/models/`.
 * `?model=models/arquivo.glb&rot=0,90,0` força um arquivo específico (útil para testar o GLB definitivo).
 */
export async function resolveModel(candidates) {
  const forced = URL_PARAMS.get("model");
  if (forced) {
    const [x = 0, y = 0, z = 0] = (URL_PARAMS.get("rot") || "").split(",").map(Number);
    return { id: "custom", url: forced, label: "Modelo personalizado", provisional: false, rotationDeg: { x, y, z } };
  }
  for (const candidate of candidates) {
    if (await fileExists(candidate.url)) return candidate;
  }
  return candidates[candidates.length - 1];
}

async function fileExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    // O servidor de desenvolvimento do Vite responde index.html (200) para arquivos inexistentes.
    return res.ok && !(res.headers.get("content-type") || "").includes("text/html");
  } catch {
    return false;
  }
}

/**
 * Carrega o GLB dentro de um contêiner-pivô (filho do prato giratório).
 * A orientação é aplicada no contêiner — nunca nas peças — para preservar a
 * hierarquia original do modelo. Em seguida o carro é centralizado e apoiado no tampo.
 *
 * @param {(fraction: number|null) => void} onProgress fração 0–1 (null se o servidor não informar o tamanho)
 */
export async function loadVehicle(scene, model, { parent, onProgress }) {
  if (!(await fileExists(model.url))) {
    throw new Error(`Arquivo não encontrado: ${model.url}. Coloque o .glb em public/models/.`);
  }
  let result;
  try {
    result = await ImportMeshAsync(model.url, scene, {
      onProgress: (e) => onProgress?.(e.lengthComputable && e.total ? e.loaded / e.total : null),
    });
  } catch (err) {
    console.error(err);
    throw new Error(`O arquivo ${model.url} não pôde ser lido (GLB inválido ou corrompido).`);
  }
  for (const group of result.animationGroups) group.stop();

  const container = new TransformNode("vehicle-container", scene);
  container.parent = parent;
  const gltfRoot = result.meshes[0];
  gltfRoot.parent = container;

  const vehicle = {
    model,
    container,
    gltfRoot,
    parent,
    meshes: result.meshes.filter((m) => m.getTotalVertices() > 0),
    scale: 1,
    dims: null,
    info: null,
  };
  orientVehicle(vehicle, model.rotationDeg, { autoFront: model.autoFront });
  return vehicle;
}

const FRONT_MARKERS = /headlight|head_?lamp|farol|front_?light/i;
const REAR_MARKERS = /taillight|tail_?lamp|lanterna|brakelight|brake_?light|reversinglight|rear_?light/i;

/**
 * Yaw (rad, múltiplo de 90°) que aponta a frente do carro para +Z, deduzido da posição
 * dos faróis em relação às lanternas. null se o modelo não tiver luzes reconhecíveis.
 */
function detectFrontYaw(meshes) {
  const centroid = (re) => {
    const list = meshes.filter((m) => re.test(m.name) || re.test(m.parent?.name ?? ""));
    if (!list.length) return null;
    const c = new Vector3();
    for (const m of list) {
      m.computeWorldMatrix(true);
      c.addInPlace(m.getBoundingInfo().boundingBox.centerWorld);
    }
    return c.scaleInPlace(1 / list.length);
  };
  const front = centroid(FRONT_MARKERS);
  const rear = centroid(REAR_MARKERS);
  if (!front || !rear) return null;
  const dir = front.subtract(rear);
  if (Math.hypot(dir.x, dir.z) < 0.5) return null;
  const theta = Math.atan2(dir.x, dir.z); // ângulo atual da frente, a partir de +Z
  return Math.round(-theta / (Math.PI / 2)) * (Math.PI / 2);
}

/**
 * Aplica rotação (graus) ao contêiner, corrige a escala se a unidade parecer errada,
 * centraliza no prato e apoia as rodas no tampo (y = 0 local).
 */
export function orientVehicle(vehicle, rotationDeg, { autoFront = false } = {}) {
  const { container, parent } = vehicle;
  const savedSpin = parent.rotation.y;
  parent.rotation.y = 0; // mede no referencial "parado" do prato
  parent.computeWorldMatrix(true);

  container.rotation.set(Tools.ToRadians(rotationDeg.x), Tools.ToRadians(rotationDeg.y), Tools.ToRadians(rotationDeg.z));
  container.position.setAll(0);
  container.scaling.setAll(1);
  container.computeWorldMatrix(true);
  if (autoFront) {
    const yaw = detectFrontYaw(vehicle.meshes);
    if (yaw) {
      container.rotation.y += yaw;
      rotationDeg = { ...rotationDeg, y: Math.round(rotationDeg.y + Tools.ToDegrees(yaw)) };
      console.info(`[EV XR] Frente detectada pelos faróis: rotação y ajustada para ${rotationDeg.y}°.`);
    }
  }

  let box = measure(container);
  let length = Math.max(box.size.x, box.size.z);
  const [minLen, maxLen] = VEHICLE.plausibleLength;
  let scale = 1;
  if (length < minLen || length > maxLen) {
    scale = VEHICLE.referenceLength / length;
    console.warn(
      `[EV XR] Comprimento medido ${length.toFixed(3)} fora da faixa plausível; reescalando ×${scale.toFixed(5)} ` +
        `(o modelo provavelmente está em outra unidade).`,
    );
    container.scaling.setAll(scale);
    box = measure(container);
  }

  // Centraliza em x/z e apoia o ponto mais baixo (pneus) no tampo do prato.
  const parentPos = parent.getAbsolutePosition();
  container.position.set(parentPos.x - box.center.x, parentPos.y - box.min.y, parentPos.z - box.center.z);
  box = measure(container);

  vehicle.scale = scale;
  vehicle.rotationDeg = { ...rotationDeg };
  vehicle.dims = {
    length: Math.max(box.size.x, box.size.z),
    width: Math.min(box.size.x, box.size.z),
    height: box.size.y,
    lengthAxis: box.size.z >= box.size.x ? "z" : "x",
  };
  vehicle.info = {
    label: vehicle.model.label,
    provisional: vehicle.model.provisional,
    badge: vehicle.model.badge,
    dims: vehicle.dims,
  };

  parent.rotation.y = savedSpin;
  parent.computeWorldMatrix(true);
  return vehicle.dims;
}

function measure(node) {
  node.computeWorldMatrix(true);
  for (const child of node.getChildMeshes(false)) child.computeWorldMatrix(true);
  // O predicado também recebe TransformNodes (sem geometria) — por isso o teste de tipo.
  const { min, max } = node.getHierarchyBoundingVectors(
    true,
    (m) => typeof m.getTotalVertices === "function" && m.getTotalVertices() > 0 && m.isEnabled(),
  );
  const size = max.subtract(min);
  return { min, max, size, center: Vector3.Center(min, max) };
}
