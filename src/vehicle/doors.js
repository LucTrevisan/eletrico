import { Animation, Axis, CubicEase, EasingFunction, Quaternion, TransformNode, Vector3 } from "../babylon.js";

const SIDE_DEG = 62;
const TAILGATE_DEG = 72;
const FPS = 60;
const TAILGATE = /boot|tailgate|trunk|hatch|porta[-_ ]?malas|tampa/i;

/**
 * PORTAS e TAMPA TRASEIRA que abrem e fecham (clique, gatilho do controle ou pinça).
 *
 * Agrupamento: se o modelo separa cada porta em um conjunto próprio (caso do bZ4X), usa
 * esses conjuntos; senão agrupa as peças pela posição (lado × dianteira/traseira).
 * Cada porta ganha uma "dobradiça" (TransformNode) alinhada ao carro, criada dentro do
 * conjunto original (o exploded view continua movendo a porta junto):
 *   portas laterais  → borda dianteira externa, giro vertical (para fora);
 *   tampa traseira   → borda superior, giro horizontal (para cima).
 * Animação do Babylon (Animation + CubicEase); só a dobradiça anima — custo mínimo.
 */
export function createDoors(scene, { items, parent }) {
  const meshes = items.portas?.meshes ?? [];
  if (!meshes.length) return null;

  const toLocal = parent.getWorldMatrix().clone().invert();
  const boxOf = (ms) => {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of ms) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      for (const v of b.vectorsWorld) {
        const l = Vector3.TransformCoordinates(v, toLocal);
        min.minimizeInPlace(l);
        max.maximizeInPlace(l);
      }
    }
    return { min, max, center: Vector3.Center(min, max) };
  };

  const all = boxOf(meshes);
  const byAssembly = new Map();
  for (const m of meshes) {
    const key = m.metadata?.evxr?.assembly ?? "portas";
    if (!byAssembly.has(key)) byAssembly.set(key, []);
    byAssembly.get(key).push(m);
  }
  let groups;
  if (byAssembly.size >= 2) {
    groups = [...byAssembly.entries()];
  } else {
    // Todas as portas num conjunto só: separa por lado e por fileira.
    const spanZ = all.max.z - all.min.z;
    const map = new Map();
    for (const m of meshes) {
      const c = boxOf([m]).center;
      const key = `${c.x < all.center.x ? "esq" : "dir"}-${spanZ > 1.6 ? (c.z > all.center.z ? "diant" : "tras") : "unica"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    groups = [...map.entries()];
  }

  const ease = new CubicEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
  const doors = [];
  for (const [key, ms] of groups) {
    const box = boxOf(ms);
    const tailgate = TAILGATE.test(key) || TAILGATE.test(ms[0].name);
    const left = box.center.x < 0;
    const hinge = new TransformNode(`door-hinge:${key}`, scene);
    hinge.parent = parent;
    hinge.position.copyFrom(
      tailgate
        ? new Vector3(box.center.x, box.max.y, box.max.z) // borda superior (lado do teto)
        : new Vector3(left ? box.min.x : box.max.x, box.center.y, box.max.z), // borda dianteira externa
    );
    hinge.rotationQuaternion = Quaternion.Identity();
    hinge.computeWorldMatrix(true);
    const assemblyNode = ms[0].parent;
    if (assemblyNode) hinge.setParent(assemblyNode);
    for (const m of ms) m.setParent(hinge);
    const closed = hinge.rotationQuaternion.clone();
    // Lateral: ângulo + em Y leva a borda traseira para fora no lado esquerdo (− no direito).
    // Tampa: ângulo + em X levanta a borda inferior para cima e para trás.
    const open = tailgate
      ? closed.multiply(Quaternion.RotationAxis(Axis.X, (TAILGATE_DEG * Math.PI) / 180))
      : closed.multiply(Quaternion.RotationAxis(Axis.Y, ((left ? 1 : -1) * SIDE_DEG * Math.PI) / 180));
    doors.push({ key, hinge, closed, open, isOpen: false, tailgate, center: box.center.clone() });
  }

  function animate(door, toOpen, delay = 0) {
    door.isOpen = toOpen;
    scene.stopAnimation(door.hinge, "door");
    const anim = new Animation("door", "rotationQuaternion", FPS, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CONSTANT);
    const from = door.hinge.rotationQuaternion.clone();
    const duration = door.tailgate ? 56 : 46;
    anim.setKeys([
      { frame: 0, value: from },
      { frame: delay, value: from },
      { frame: delay + duration, value: toOpen ? door.open : door.closed },
    ]);
    anim.setEasingFunction(ease);
    scene.beginDirectAnimation(door.hinge, [anim], 0, delay + duration, false);
  }

  /** Porta à qual uma malha pertence (sobe pela hierarquia até a dobradiça). */
  const doorOf = (mesh) => {
    for (let n = mesh; n; n = n.parent) {
      const d = doors.find((x) => x.hinge === n);
      if (d) return d;
    }
    return null;
  };

  return {
    count: doors.length,
    get anyOpen() {
      return doors.some((d) => d.isOpen);
    },
    /** Abre/fecha só a porta clicada. Retorna true se ela ficou aberta. */
    toggleFor(mesh) {
      const d = doorOf(mesh);
      if (!d) return null;
      animate(d, !d.isOpen);
      return d.isOpen;
    },
    /** Abre/fecha todas (ação do painel e tecla P). */
    toggleAll() {
      const open = !doors.some((d) => d.isOpen);
      doors.forEach((d, i) => animate(d, open, i * 6));
      return open;
    },
    closeAll({ stagger = false } = {}) {
      doors.forEach((d, i) => d.isOpen && animate(d, false, stagger ? i * 6 : 0));
    },
    /** Porta lateral mais próxima de um ponto (local do prato) — ex.: a do motorista, ao lado do banco. */
    nearest(point) {
      const d = doors
        .filter((x) => !x.tailgate)
        .sort((a, b) => Vector3.DistanceSquared(a.center, point) - Vector3.DistanceSquared(b.center, point))[0];
      if (!d) return null;
      return {
        get isOpen() {
          return d.isOpen;
        },
        set(open) {
          if (d.isOpen !== open) animate(d, open);
        },
      };
    },
  };
}
