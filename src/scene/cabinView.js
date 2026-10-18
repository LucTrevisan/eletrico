import { ArcRotateCamera, Ray, Vector3 } from "../babylon.js";
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
 * Bancos traseiros (local do prato), medidos na geometria real com raios verticais atrás do
 * motorista: depois do encosto dianteiro vêm o assoalho traseiro (baixo), o assento (patamar) e o
 * encosto traseiro (sobe). Os olhos ficam um pouco à frente do encosto, na altura do motorista
 * corrigida pela diferença entre os assentos, e abaixo do forro do teto.
 * Sem leitura confiável, usa ~0,9 m atrás do motorista. Devolve { left, right } (lado −1 / +1).
 */
export function findRearSeats(scene, parent, driver, dims) {
  const W = parent.getWorldMatrix();
  const inv = W.clone().invert();
  const isInterior = (m) => m.metadata?.evxr?.component === "interior" && m.isEnabled();
  const isCar = (m) => !!m.metadata?.evxr?.vehicle && !m.metadata.evxr.illustrative && m.isEnabled();
  const down = Vector3.TransformNormal(new Vector3(0, -1, 0), W).normalize();
  const up = down.scale(-1);
  const cast = (x, y, z, dir, predicate) => {
    const origin = Vector3.TransformCoordinates(new Vector3(x, y, z), W);
    const hit = scene.pickWithRay(new Ray(origin, dir, 2), predicate);
    return hit?.hit ? Vector3.TransformCoordinates(hit.pickedPoint, inv).y : null;
  };
  const x = driver.eye.x;
  const startY = driver.eye.y + 0.1;
  const heightAt = (z) => cast(x, startY, z, down, isInterior);

  // Assento dianteiro (calibração): menor altura logo abaixo/à frente dos olhos do motorista.
  let front = Infinity;
  for (let z = driver.eye.z - 0.05; z <= driver.eye.z + 0.35; z += 0.05) front = Math.min(front, heightAt(z) ?? Infinity);

  let footwell = false;
  let cushion = Infinity;
  let backZ = null;
  if (Number.isFinite(front)) {
    for (let z = driver.eye.z - 0.25; z > -dims.length * 0.45; z -= 0.05) {
      const h = heightAt(z);
      if (h == null) continue;
      if (!footwell) {
        footwell = h < front - 0.12;
      } else if (cushion === Infinity || h <= cushion + 0.18) {
        if (h >= front - 0.12 && h <= front + 0.25) cushion = Math.min(cushion, h);
      } else {
        backZ = z; // o encosto traseiro começa aqui
        break;
      }
    }
  }
  const make = (side) => {
    const sx = side * Math.abs(x);
    if (backZ == null) return { eye: new Vector3(sx, driver.eye.y, driver.eye.z - 0.9), side, estimated: true };
    const eye = new Vector3(sx, driver.eye.y + (cushion - front), backZ + 0.13);
    const roof = cast(sx, eye.y - 0.3, eye.z, up, isCar);
    if (roof != null) eye.y = Math.min(eye.y, roof - 0.12); // cabeça abaixo do forro do teto
    return { eye, side };
  };
  return { left: make(-1), right: make(1) };
}

/**
 * VISTA INTERNA (desktop e celular): a câmera entra pela porta de um banco (motorista ou traseiro),
 * senta e permite olhar ao redor arrastando (mouse ou dedo). Usa uma câmera própria — a câmera
 * orbital do showroom não é alterada e volta exatamente à vista inicial na saída.
 *
 *  seats           [{ id, eye, side, door }] — eye no referencial do carro; door = { isOpen, set(open) }
 *  enter(id)       entra pela porta daquele banco (a porta abre/fecha junto)
 *  switchSeat(id)  muda de banco por dentro da cabine (entre os encostos)
 *  exit()          sai pela porta do banco atual; exitNow() volta na hora (ex.: antes de entrar em VR)
 */
export function createCabinView(scene, { mainCamera, canvas, parent, seats, dims, views, onChange }) {
  const cam = new ArcRotateCamera("cabin-camera", -Math.PI / 2, Math.PI / 2, 0.02, Vector3.Zero(), scene);
  cam.minZ = 0.02; // painel e volante ficam a poucos centímetros
  cam.maxZ = 250;
  cam.panningSensibility = 0;
  cam.inertia = 0.82;
  // Arrastar "puxa" a paisagem, como numa foto 360° (sinal negativo inverte o giro da órbita).
  cam.angularSensibilityX = -2200;
  cam.angularSensibilityY = -2200;
  cam.pinchToPanMaxDistance = 0;

  let state = "out"; // out | entering | in | moving | leaving
  let seat = seats[0];
  let door = seat.door;
  let doorWasOpen = false;
  // O voo é calculado no referencial do carro (prato) e convertido a cada quadro: se a plataforma
  // ainda estiver se alinhando, o trajeto acompanha o carro em vez de atravessá-lo.
  const toWorld = (v) => Vector3.TransformCoordinates(v, parent.getWorldMatrix());
  const toLocal = (v) => Vector3.TransformCoordinates(v, parent.getWorldMatrix().clone().invert());
  const FWD = new Vector3(0, 0, 1);
  // Ponto do lado de fora da porta do banco, na altura dos olhos (local).
  const outsideOf = (st) => st.eye.add(new Vector3(st.side * (dims.width / 2 + 0.95), 0.05, 0.1));
  const seatById = (id) => seats.find((x) => x.id === id) ?? seats[0];
  // Olhar inicial (local): motorista reto para o painel; banco de trás um pouco para o centro, para o
  // apoio de cabeça da frente não tampar a vista do painel.
  // No celular em pé (campo horizontal estreito), gira mais para o centro.
  const lookOf = (st) => {
    if (st.id === "driver") return FWD;
    const inward = canvas.clientWidth < canvas.clientHeight ? 0.42 : 0.22;
    return new Vector3(-st.side * inward, -0.04, 1).normalize();
  };

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

  /** Olhar ao redor: pivô nos olhos (raio de 2 cm), de frente para o painel. */
  function sitDown() {
    const eye = toWorld(seat.eye);
    const look = Vector3.TransformNormal(lookOf(seat), parent.getWorldMatrix()).normalize();
    cam.setTarget(eye);
    cam.setPosition(eye.subtract(look.scale(0.02)));
    setLimits(false);
    cam.attachControl(canvas, true);
  }

  async function enter(id) {
    if (state !== "out") return;
    seat = seatById(id);
    door = seat.door;
    state = "entering";
    onChange?.(state, seat.id);
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
      via: outsideOf(seat),
      to: seat.eye,
      lookFrom: toLocal(cam.target),
      lookTo: seat.eye.add(lookOf(seat).scale(0.6)),
      fovTo: cabinFov(),
      duration: 2300,
    });
    if (state !== "entering") return; // saída imediata durante a animação
    sitDown();
    door?.set(false); // fecha a porta: imersão dentro da cabine
    state = "in";
    onChange?.(state, seat.id);
  }

  /** Troca de banco por dentro: passa por cima do console, entre os encostos dianteiros. */
  async function switchSeat(id) {
    const next = seatById(id);
    if (state !== "in" || next === seat) return;
    state = "moving";
    onChange?.(state, next.id);
    cam.detachControl();
    const dir = cam.target.subtract(cam.position).normalize();
    const eye = cam.target.clone();
    setLimits(true);
    cam.setTarget(eye.add(dir.scale(0.6)));
    cam.setPosition(eye);
    const from = seat.eye;
    const via = new Vector3(0, Math.max(from.y, next.eye.y) + 0.08, (from.z + next.eye.z) / 2);
    seat = next;
    door = seat.door;
    await fly({ from, via, to: next.eye, lookFrom: toLocal(cam.target), lookTo: next.eye.add(lookOf(next).scale(0.6)), fovTo: cam.fov, duration: 1300 });
    if (state !== "moving") return;
    sitDown();
    state = "in";
    onChange?.(state, seat.id);
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
      via: outsideOf(seat),
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
    /** Banco atual (id). */
    get seat() {
      return seat.id;
    },
    enter,
    switchSeat,
    exit,
    exitNow() {
      if (state === "out") return;
      views.jumpTo("hero");
      finishExit();
    },
  };
}
