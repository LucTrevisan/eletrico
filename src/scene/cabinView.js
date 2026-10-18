import { ArcRotateCamera, Vector3 } from "../babylon.js";
import { easeInOutCubic, tween } from "./presentation.js";

const STEERING = /steering|volante/i;

/**
 * Banco do motorista (local do prato), deduzido do volante — medido ANTES da fusão de malhas,
 * que junta o volante ao bloco do interior. Frente do carro em +Z.
 *   eye   altura dos olhos de um adulto sentado, atrás do volante
 *   side  −1 = motorista à esquerda, +1 = à direita (lado da porta por onde se entra)
 */
export function findDriverSeat(vehicle, parent, dims) {
  const toLocal = parent.getWorldMatrix().clone().invert();
  const meshes = vehicle.meshes.filter((m) => STEERING.test(m.name) || STEERING.test(m.parent?.name ?? ""));
  if (!meshes.length) {
    // Sem volante identificável: posição típica de um SUV com motorista à esquerda.
    return { eye: new Vector3(-dims.width * 0.18, dims.height * 0.74, dims.length * 0.02), side: -1, estimated: true };
  }
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    for (const v of m.getBoundingInfo().boundingBox.vectorsWorld) {
      const l = Vector3.TransformCoordinates(v, toLocal);
      min.minimizeInPlace(l);
      max.maximizeInPlace(l);
    }
  }
  const wheel = Vector3.Center(min, max);
  return { eye: new Vector3(wheel.x, wheel.y + 0.28, wheel.z - 0.5), side: Math.sign(wheel.x) || -1, steering: wheel };
}

/**
 * VISTA INTERNA (desktop e celular): a câmera entra pela porta do motorista, senta no banco e
 * permite olhar ao redor arrastando (mouse ou dedo). Usa uma câmera própria — a câmera orbital do
 * showroom não é alterada e volta exatamente à vista inicial na saída.
 *
 *  enter()/exit()  animações de entrada e saída (a porta abre/fecha junto)
 *  exitNow()       volta na hora (ex.: antes de entrar em VR)
 */
export function createCabinView(scene, { mainCamera, canvas, parent, seat, dims, door, views, onChange }) {
  const cam = new ArcRotateCamera("cabin-camera", -Math.PI / 2, Math.PI / 2, 0.02, Vector3.Zero(), scene);
  cam.minZ = 0.02; // painel e volante ficam a poucos centímetros
  cam.maxZ = 250;
  cam.panningSensibility = 0;
  cam.inertia = 0.82;
  // Arrastar "puxa" a paisagem, como numa foto 360° (sinal negativo inverte o giro da órbita).
  cam.angularSensibilityX = -2200;
  cam.angularSensibilityY = -2200;
  cam.pinchToPanMaxDistance = 0;

  let state = "out"; // out | entering | in | leaving
  let doorWasOpen = false;
  // O voo é calculado no referencial do carro (prato) e convertido a cada quadro: se a plataforma
  // ainda estiver se alinhando, o trajeto acompanha o carro em vez de atravessá-lo.
  const toWorld = (v) => Vector3.TransformCoordinates(v, parent.getWorldMatrix());
  const toLocal = (v) => Vector3.TransformCoordinates(v, parent.getWorldMatrix().clone().invert());
  const forward = () => Vector3.TransformNormal(new Vector3(0, 0, 1), parent.getWorldMatrix()).normalize();
  const FWD = new Vector3(0, 0, 1);
  // Ponto do lado de fora da porta do motorista, na altura dos olhos (local).
  const outside = seat.eye.add(new Vector3(seat.side * (dims.width / 2 + 0.95), 0.05, 0.1));

  const setLimits = (free) => {
    cam.lowerRadiusLimit = free ? null : 0.02;
    cam.upperRadiusLimit = free ? null : 0.02;
    cam.lowerBetaLimit = free ? 0.01 : 0.35; // olhar para o teto e para os pedais, sem virar de ponta-cabeça
    cam.upperBetaLimit = free ? Math.PI - 0.01 : 2.55;
  };
  const cabinFov = () => (canvas.clientWidth < canvas.clientHeight ? 1.3 : 1.1);

  /** Voo por uma curva (Bézier quadrática, pontos locais) passando pela porta, com o olhar interpolado. */
  function fly({ from, via, to, lookFrom, lookTo, fovTo, duration }) {
    const fov0 = cam.fov;
    const p = new Vector3();
    const look = new Vector3();
    return new Promise((resolve) =>
      tween(scene, {
        duration,
        ease: easeInOutCubic,
        onUpdate: (t) => {
          const a = (1 - t) * (1 - t);
          const b = 2 * (1 - t) * t;
          const c = t * t;
          p.set(from.x * a + via.x * b + to.x * c, from.y * a + via.y * b + to.y * c, from.z * a + via.z * b + to.z * c);
          Vector3.LerpToRef(lookFrom, lookTo, Math.min(1, t * 1.25), look);
          cam.setTarget(toWorld(look));
          cam.setPosition(toWorld(p));
          cam.fov = fov0 + (fovTo - fov0) * t;
        },
        onComplete: resolve,
      }),
    );
  }

  async function enter() {
    if (state !== "out") return;
    state = "entering";
    onChange?.(state);
    doorWasOpen = !!door?.isOpen;
    door?.set(true);
    setLimits(true);
    cam.fov = mainCamera.fov;
    cam.setTarget(mainCamera.target.clone());
    cam.setPosition(mainCamera.position.clone());
    mainCamera.detachControl();
    scene.activeCamera = cam;
    await fly({
      from: toLocal(cam.position),
      via: outside,
      to: seat.eye,
      lookFrom: toLocal(cam.target),
      lookTo: seat.eye.add(FWD.scale(0.6)),
      fovTo: cabinFov(),
      duration: 2300,
    });
    if (state !== "entering") return; // saída imediata durante a animação
    // Olhar ao redor: pivô nos olhos (raio de 2 cm), de frente para o painel.
    const eye = toWorld(seat.eye);
    cam.setTarget(eye);
    cam.setPosition(eye.subtract(forward().scale(0.02)));
    setLimits(false);
    cam.attachControl(canvas, true);
    door?.set(false); // fecha a porta: imersão dentro da cabine
    state = "in";
    onChange?.(state);
  }

  /** Pose final da câmera do showroom na vista inicial (sem mexer nela enquanto está inativa). */
  function heroPose() {
    views.jumpTo("hero");
    const t = mainCamera.target.clone();
    const { alpha, beta, radius } = mainCamera;
    return { target: t, position: t.add(new Vector3(Math.cos(alpha) * Math.sin(beta), Math.cos(beta), Math.sin(alpha) * Math.sin(beta)).scale(radius)) };
  }

  function finishExit() {
    cam.detachControl();
    scene.activeCamera = mainCamera;
    mainCamera.attachControl(canvas, true);
    state = "out";
    onChange?.(state);
  }

  async function exit() {
    if (state !== "in") return;
    state = "leaving";
    onChange?.(state);
    cam.detachControl();
    door?.set(true);
    await new Promise((r) => setTimeout(r, 450)); // a porta começa a abrir antes de a câmera sair
    const dir = cam.target.subtract(cam.position).normalize();
    const eye = cam.target.clone();
    setLimits(true);
    cam.setTarget(eye.add(dir.scale(0.6)));
    cam.setPosition(eye);
    const hero = heroPose();
    await fly({
      from: seat.eye,
      via: outside,
      to: toLocal(hero.position),
      lookFrom: toLocal(cam.target),
      lookTo: toLocal(hero.target),
      fovTo: mainCamera.fov,
      duration: 2100,
    });
    if (state !== "leaving") return;
    if (!doorWasOpen) door?.set(false);
    finishExit();
  }

  return {
    camera: cam,
    get state() {
      return state;
    },
    /** Dentro ou em transição: o restante da interface fica em espera. */
    get active() {
      return state !== "out";
    },
    enter,
    exit,
    exitNow() {
      if (state === "out") return;
      views.jumpTo("hero");
      finishExit();
    },
  };
}
