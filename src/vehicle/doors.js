import { Animation, Axis, CubicEase, EasingFunction, Quaternion, TransformNode, Vector3 } from "../babylon.js";

const OPEN_DEG = 62;
const FPS = 60;

/**
 * PORTAS que abrem e fecham (quando o modelo tem portas como peças separadas).
 *
 * As malhas do componente "portas" são agrupadas por porta (lado esquerdo/direito ×
 * dianteira/traseira, pela posição). Cada porta ganha uma "dobradiça" (TransformNode)
 * na borda dianteira externa, alinhada ao carro, criada dentro do conjunto original —
 * assim o exploded view continua movendo as portas junto com o conjunto.
 * A abertura usa o sistema de animação do Babylon (Animation + CubicEase).
 */
export function createDoors(scene, { items, parent }) {
  const meshes = items.portas?.meshes ?? [];
  if (!meshes.length) return null;

  const toLocal = parent.getWorldMatrix().clone().invert();
  const centerOf = (ms) => {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of ms) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      min.minimizeInPlace(Vector3.TransformCoordinates(b.minimumWorld, toLocal));
      max.maximizeInPlace(Vector3.TransformCoordinates(b.maximumWorld, toLocal));
    }
    return { min, max, center: Vector3.Center(min, max) };
  };

  const all = centerOf(meshes);
  const spanZ = all.max.z - all.min.z;
  const groups = new Map();
  for (const m of meshes) {
    const c = centerOf([m]).center;
    const side = c.x < all.center.x ? "esq" : "dir";
    // Portas dianteiras e traseiras só se o conjunto for longo (carro de 4 portas).
    const row = spanZ > 1.6 ? (c.z > all.center.z ? "diant" : "tras") : "unica";
    const key = `${side}-${row}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  const doors = [];
  for (const [key, ms] of groups) {
    const box = centerOf(ms);
    const left = key.startsWith("esq");
    const hinge = new TransformNode(`door-hinge:${key}`, scene);
    hinge.parent = parent;
    hinge.position.set(left ? box.min.x : box.max.x, box.center.y, box.max.z); // borda dianteira externa
    hinge.rotationQuaternion = Quaternion.Identity();
    hinge.computeWorldMatrix(true);
    const assemblyNode = ms[0].parent;
    if (assemblyNode) hinge.setParent(assemblyNode);
    for (const m of ms) m.setParent(hinge);
    const closed = hinge.rotationQuaternion.clone();
    // Ângulo positivo em torno do Y do carro leva a borda traseira para fora no lado esquerdo.
    const angle = ((left ? 1 : -1) * OPEN_DEG * Math.PI) / 180;
    const open = closed.multiply(Quaternion.RotationAxis(Axis.Y, angle));
    doors.push({ key, hinge, closed, open, center: box.center, left });
  }

  let isOpen = false;
  const ease = new CubicEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

  function animate(toOpen, { stagger = true } = {}) {
    isOpen = toOpen;
    doors.forEach((d, i) => {
      scene.stopAnimation(d.hinge, "door");
      const anim = new Animation("door", "rotationQuaternion", FPS, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CONSTANT);
      const delay = stagger ? i * 6 : 0;
      const from = d.hinge.rotationQuaternion.clone();
      const to = toOpen ? d.open : d.closed;
      anim.setKeys([
        { frame: 0, value: from },
        { frame: delay, value: from },
        { frame: delay + 48, value: to },
      ]);
      anim.setEasingFunction(ease);
      scene.beginDirectAnimation(d.hinge, [anim], 0, delay + 48, false);
    });
  }

  return {
    count: doors.length,
    get isOpen() {
      return isOpen;
    },
    toggle() {
      animate(!isOpen);
      return isOpen;
    },
    open: () => animate(true),
    close: (opts) => animate(false, opts),
  };
}
