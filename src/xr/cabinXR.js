import { MeshBuilder, Vector3 } from "../babylon.js";
import { PALETTE } from "../config.js";
import { AdvancedDynamicTexture, Button } from "../ui/gui.js";

const FONT = "'Segoe UI', Roboto, Arial, sans-serif";

/**
 * VR — ENTRAR NO CARRO. Com a porta do motorista aberta, um botão holográfico aparece ao lado
 * dela; o gatilho (ou a pinça) põe o usuário sentado no banco do motorista, com os olhos na
 * altura de quem dirige e de frente para o painel. A porta fecha (imersão) e, lá dentro, o botão
 * "Sair do carro" — perto da coluna da porta — leva de volta para fora, já em pé.
 *
 * Enquanto sentado: a plataforma não gira, o raio atravessa o carro (o painel 3D chamado com
 * B/Y e o botão de saída ficam sempre clicáveis e desenhados por cima) e o teleporte continua
 * bloqueado pela carroceria — sai-se pelo botão ou por "Voltar ao início".
 * Carregado sob demanda, só em dispositivos com VR.
 */
export function createCabinXR(scene, { xrApi, parent, seat, dims, door, raycastBlockers, menuMesh, onSeatedChange }) {
  const world = (v) => Vector3.TransformCoordinates(v, parent.getWorldMatrix());
  const forward = () => Vector3.TransformNormal(new Vector3(0, 0, 1), parent.getWorldMatrix()).normalize();

  const enterBtn = makeButton(scene, "vr-cabin-enter", "Entrar no carro", 0.42, 0.13, () => enter());
  const exitBtn = makeButton(scene, "vr-cabin-exit", "Sair do carro", 0.3, 0.1, () => exit());
  exitBtn.renderingGroupId = 1; // dentro da cabine pode encostar no acabamento da porta

  let seated = false;
  let headHeight = 1.6; // altura real da cabeça do usuário (em pé ou sentado na cadeira)
  let pickable = null;
  let menuGroup = 0;

  /** Encara `viewer` (a face visível do plano é a −Z local). */
  const face = (mesh, position, viewer) => {
    mesh.position.copyFrom(position);
    const dir = position.subtract(viewer);
    mesh.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
  };

  // O botão de entrada acompanha a porta: aparece só com ela aberta, ao lado dela, na altura do peito.
  scene.onBeforeRenderObservable.add(() => {
    // Altura real da cabeça, lida dentro do quadro XR (fora dele o WebXR recusa o acesso ao pose).
    if (xrApi.inXR && !seated) {
      try {
        headHeight = xrApi.camera.realWorldHeight || headHeight;
      } catch {
        /* quadro indisponível: mantém a última leitura */
      }
    }
    const want = xrApi.inXR && !seated && !!door?.isOpen;
    if (want) {
      const at = world(new Vector3(seat.side * (dims.width / 2 + 0.55), 1.15, seat.eye.z + 0.15));
      const viewer = world(new Vector3(seat.side * (dims.width / 2 + 1.6), 1.5, seat.eye.z));
      face(enterBtn, at, viewer);
    }
    if (enterBtn.isEnabled() !== want) enterBtn.setEnabled(want);
  });

  function setSeated(on) {
    seated = on;
    exitBtn.setEnabled(on);
    if (on) {
      // O raio atravessa o carro: nada da cabine fica entre o controle e o painel/botão de saída.
      const blockers = raycastBlockers();
      pickable = new Map(blockers.map((m) => [m, m.isPickable]));
      for (const m of blockers) m.isPickable = false;
      menuGroup = menuMesh?.renderingGroupId ?? 0;
      if (menuMesh) menuMesh.renderingGroupId = 1;
    } else {
      for (const [m, p] of pickable ?? []) m.isPickable = p;
      pickable = null;
      if (menuMesh) menuMesh.renderingGroupId = menuGroup;
    }
    onSeatedChange?.(on);
  }

  function enter() {
    if (seated || !xrApi.inXR) return;
    const eye = world(seat.eye);
    const fwd = forward();
    xrApi.placeAt(eye, fwd);
    // Saída à esquerda-frente do motorista (lado da porta), voltada para os olhos.
    const exitAt = world(seat.eye.add(new Vector3(seat.side * 0.3, -0.12, 0.42)));
    face(exitBtn, exitAt, eye);
    setSeated(true);
    door?.set(false);
  }

  function exit() {
    if (!seated) return;
    door?.set(true);
    // Ao lado da porta, sobre o tampo da plataforma (y = 0 local), com a altura real da cabeça.
    const outside = world(new Vector3(seat.side * (dims.width / 2 + 1.1), 0, seat.eye.z));
    outside.y += headHeight;
    const toCar = world(new Vector3(0, 0, 0)).subtract(outside);
    toCar.y = 0;
    setSeated(false);
    xrApi.placeAt(outside, toCar.normalize());
  }

  return {
    get seated() {
      return seated;
    },
    enter,
    exit,
    /** Sai do modo sentado sem mover o usuário de lugar (ex.: "Voltar ao início", sair do VR). */
    reset() {
      if (!seated) return;
      setSeated(false);
      if (xrApi.inXR) xrApi.camera.position.y = headHeight; // fora do carro, no piso do showroom
    },
  };
}

function makeButton(scene, name, label, width, height, onClick) {
  const plane = MeshBuilder.CreatePlane(name, { width, height }, scene);
  plane.setEnabled(false);
  const ui = AdvancedDynamicTexture.CreateForMesh(plane, 512, Math.round((512 * height) / width));
  const b = Button.CreateSimpleButton(`${name}-btn`, label);
  b.cornerRadius = 40;
  b.thickness = 4;
  b.color = PALETTE.cyan;
  b.background = "rgba(8, 17, 31, 0.88)";
  b.fontFamily = FONT;
  b.fontSize = 46;
  b.fontWeight = "700";
  if (b.textBlock) b.textBlock.color = PALETTE.text;
  b.onPointerEnterObservable.add(() => (b.background = "rgba(0, 229, 255, 0.3)"));
  b.onPointerOutObservable.add(() => (b.background = "rgba(8, 17, 31, 0.88)"));
  b.onPointerUpObservable.add(() => onClick());
  ui.addControl(b);
  return plane;
}
