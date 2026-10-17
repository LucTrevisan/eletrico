import { Color3, DynamicTexture, MeshBuilder, StandardMaterial, Texture, Vector3 } from "../babylon.js";
import { getContent } from "./componentContent.js";

/**
 * Representações ESQUEMÁTICAS para componentes internos ausentes no modelo 3D.
 *
 * Modelos comerciais costumam trazer só a carroceria. Para não inventar peças
 * detalhadas, cada componente ausente vira uma forma simples (caixa/cilindro/tubo)
 * em posição típica, calculada a partir das medidas do carro e dos eixos detectados
 * pelas rodas. Aparecem só no raio X, translúcidas, hachuradas e com a legenda
 * "ILUSTRATIVO" — nunca se passam por geometria real.
 *
 * drivetrain "front" | "rear" | "awd": um e-Axle (motor + redutor + inversor) por eixo motriz.
 * No AWD, motor/inversor/redutor têm duas peças; `item.parts` lista uma por eixo.
 *
 * Coordenadas no referencial do prato giratório: frente em +Z, lado esquerdo em −X, piso em y = 0.
 */
export function createSchematics(scene, { parent, dims, axles, missing, drivetrain = "front" }) {
  const items = {};
  const meshes = [];
  if (!missing.length) return { items, meshes, setVisibility() {} };

  const L = dims.length;
  const W = dims.width * 0.86; // largura sem retrovisores (aprox.)
  const front = axles?.front ?? L * 0.31;
  const rear = axles?.rear ?? -L * 0.29;
  const wheelR = axles?.wheelRadius ?? Math.max(0.3, dims.height * 0.21);
  const floorY = Math.max(0.16, dims.height * 0.11);
  const axleList = drivetrain === "awd" ? ["front", "rear"] : [drivetrain === "rear" ? "rear" : "front"];
  const axleZ = (a) => (a === "front" ? front : rear);
  const towardCabin = (a) => (a === "front" ? -1 : 1);

  const box = (size, at) => ({ shape: "box", size, at });
  const specs = {
    bateria: [box([W * 0.78, 0.13, Math.max(1, front - rear - 0.9)], [0, floorY + 0.065, (front + rear) / 2])],
    motor: axleList.map((a) => ({ shape: "cylinder", size: [0.42, 0.34], at: [-0.12, wheelR, axleZ(a)], axle: a })),
    redutor: axleList.map((a) => ({ ...box([0.24, 0.3, 0.26], [0.2, wheelR, axleZ(a)]), axle: a })),
    inversor: axleList.map((a) => ({ ...box([0.46, 0.14, 0.34], [-0.05, wheelR + 0.33, axleZ(a) + towardCabin(a) * 0.06]), axle: a })),
    ecu: [box([0.26, 0.1, 0.18], [-W * 0.3, floorY + 0.2, (front + rear) / 2 - (front - rear) * 0.3])],
    // Carregador de bordo sob o capô, ao lado do e-Axle dianteiro (ou atrás, em tração traseira).
    recarga: [box([0.4, 0.16, 0.3], [W * 0.28, wheelR + 0.34, drivetrain === "rear" ? rear + 0.2 : front + 0.1])],
    refrigeracao: [box([W * 0.6, 0.36, 0.06], [0, wheelR + 0.1, L / 2 - 0.25])],
    cabos_hv: axleList.map((a) => {
      const z = axleZ(a);
      const c = towardCabin(a);
      return {
        shape: "tube",
        path: [
          [0.18, floorY + 0.14, z + c * 0.55],
          [0.18, floorY + 0.3, z + c * 0.3],
          [0.1, wheelR + 0.26, z + c * 0.08],
        ],
        axle: a,
      };
    }),
  };

  const hatch = createHatchTexture(scene);

  for (const id of missing) {
    const list = specs[id];
    if (!list) continue;
    const content = getContent(id);
    const color = Color3.FromHexString(content.color);
    const mat = new StandardMaterial(`mat-ilustrativo-${id}`, scene);
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = color.scale(0.9);
    mat.opacityTexture = hatch; // hachura diagonal: leitura imediata de "esquemático"
    mat.alpha = 0;
    mat.backFaceCulling = false;

    const parts = [];
    for (const [i, spec] of list.entries()) {
      const name = `ilustrativo:${id}${list.length > 1 ? `:${spec.axle}` : ""}`;
      let mesh;
      let center;
      let size;
      if (spec.shape === "box") {
        mesh = MeshBuilder.CreateBox(name, { width: spec.size[0], height: spec.size[1], depth: spec.size[2] }, scene);
        center = new Vector3(...spec.at);
        size = new Vector3(...spec.size);
      } else if (spec.shape === "cylinder") {
        mesh = MeshBuilder.CreateCylinder(name, { height: spec.size[0], diameter: spec.size[1], tessellation: 20 }, scene);
        mesh.rotation.z = Math.PI / 2; // eixo do motor alinhado com o eixo das rodas (x)
        center = new Vector3(...spec.at);
        size = new Vector3(spec.size[0], spec.size[1], spec.size[1]);
      } else {
        const path = spec.path.map((p) => new Vector3(...p));
        mesh = MeshBuilder.CreateTube(name, { path, radius: 0.025, tessellation: 8 }, scene);
        const min = path.reduce((a, p) => Vector3.Minimize(a, p), path[0].clone());
        const max = path.reduce((a, p) => Vector3.Maximize(a, p), path[0].clone());
        center = Vector3.Center(min, max);
        size = max.subtract(min);
      }
      if (spec.shape !== "tube") mesh.position.copyFrom(center);
      mesh.parent = parent;
      mesh.material = mat;
      mesh.isPickable = true;
      mesh.metadata = { evxr: { vehicle: true, component: id, assembly: `ilustrativo:${id}:${i}`, parts: [], illustrative: true } };
      mesh.setEnabled(false);
      meshes.push(mesh);
      parts.push({ mesh, center, size, axle: spec.axle ?? null });
    }
    const first = parts[0];
    const half = first.size.scale(0.5);
    items[id] = {
      id,
      meshes: parts.map((p) => p.mesh),
      parts,
      center: first.center, // âncora principal (e-Axle dianteiro no AWD)
      size: first.size,
      min: first.center.subtract(half),
      max: first.center.add(half),
      illustrative: true,
    };
  }

  return {
    items,
    meshes,
    setVisibility(k) {
      for (const m of meshes) {
        m.setEnabled(k > 0.001);
        m.material.alpha = 0.85 * k;
      }
    },
  };
}

/** Hachura diagonal (canal alfa): faixas mais opacas sobre fundo translúcido. */
function createHatchTexture(scene) {
  const size = 128;
  const tex = new DynamicTexture("tex-ilustrativo-hachura", { width: size, height: size }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 10;
  // 32 divide 128: o padrão continua sem emenda ao repetir.
  for (let i = -size; i <= size * 2; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = 3;
  tex.vScale = 3;
  return tex;
}
