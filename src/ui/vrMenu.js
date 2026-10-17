import { MeshBuilder, Vector3 } from "@babylonjs/core";
import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { APP, PALETTE } from "../config.js";

const FONT = "'Segoe UI', Roboto, Arial, sans-serif";
const IDLE_BG = "rgba(0, 184, 255, 0.10)";
const ACTIVE_BG = "rgba(0, 229, 255, 0.32)";

/**
 * Painel de controle 3D para dentro do headset. O HUD em HTML não aparece em VR,
 * então os mesmos comandos são oferecidos aqui, num painel no espaço (Babylon GUI),
 * acionado pelo raio do controle (gatilho).
 * Fica baixo e à direita do ponto de partida, para não cobrir o carro.
 */
export function createVRMenu(scene, { onToggleXRay, onToggleEnergy, onToggleTurntable, onReturnToSpawn, onExitVR }) {
  // ~0,64 m a 0,75 m de distância ≈ 45° do campo de visão: legível sem dominar a cena.
  const width = 0.64;
  const height = 0.36;
  const plane = MeshBuilder.CreatePlane("vr-menu", { width, height }, scene);
  plane.setEnabled(false);

  const ui = AdvancedDynamicTexture.CreateForMesh(plane, 1024, Math.round((1024 * height) / width));

  const frame = new Rectangle("vr-menu-frame");
  frame.thickness = 4;
  frame.cornerRadius = 36;
  frame.color = PALETTE.cyan;
  frame.background = "rgba(8, 17, 31, 0.9)";
  ui.addControl(frame);

  const stack = new StackPanel("vr-menu-stack");
  stack.paddingTop = "30px";
  stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  frame.addControl(stack);

  const title = new TextBlock("vr-menu-title", APP.name.toUpperCase());
  title.color = PALETTE.cyan;
  title.fontFamily = FONT;
  title.fontWeight = "700";
  title.fontSize = 44;
  title.height = "62px";
  stack.addControl(title);

  const status = new TextBlock("vr-menu-status", "");
  status.color = PALETTE.text;
  status.alpha = 0.75;
  status.fontFamily = FONT;
  status.fontSize = 28;
  status.height = "48px";
  stack.addControl(status);

  const row = new StackPanel("vr-menu-row");
  row.isVertical = false;
  row.height = "180px";
  row.paddingTop = "14px";
  stack.addControl(row);

  const makeButton = (name, label, accent, onClick) => {
    const b = Button.CreateSimpleButton(name, label);
    b.width = "190px";
    b.height = "150px";
    b.paddingLeft = "8px";
    b.paddingRight = "8px";
    b.cornerRadius = 26;
    b.thickness = 3;
    b.color = accent;
    b.background = IDLE_BG;
    b.fontFamily = FONT;
    b.fontSize = 28;
    b.fontWeight = "600";
    if (b.textBlock) {
      b.textBlock.color = PALETTE.text;
      b.textBlock.textWrapping = true;
    }
    b.onPointerEnterObservable.add(() => (b.background = "rgba(0, 229, 255, 0.28)"));
    b.onPointerOutObservable.add(() => (b.background = b.metadata?.active ? ACTIVE_BG : IDLE_BG));
    b.onPointerUpObservable.add(() => onClick());
    row.addControl(b);
    return b;
  };

  const xrayButton = makeButton("vr-btn-xray", "RAIO X", PALETTE.cyan, () => onToggleXRay?.());
  const energyButton = makeButton("vr-btn-energy", "Energia", PALETTE.blue, () => onToggleEnergy?.());
  const turntableButton = makeButton("vr-btn-turntable", "Girar plataforma", PALETTE.cyan, () => onToggleTurntable?.());
  makeButton("vr-btn-spawn", "Voltar ao início", PALETTE.blue, () => onReturnToSpawn?.());
  makeButton("vr-btn-exit", "Sair do VR", PALETTE.orange, () => onExitVR?.());

  const hint = new TextBlock(
    "vr-menu-hint",
    "Thumbstick: para frente = teleporte · para os lados = girar 45°\nGatilho numa peça: informações · B ou Y: trazer este painel",
  );
  hint.color = PALETTE.text;
  hint.alpha = 0.6;
  hint.fontFamily = FONT;
  hint.fontSize = 25;
  hint.lineSpacing = "6px";
  hint.textWrapping = true;
  hint.width = "92%";
  hint.height = "92px";
  hint.paddingTop = "16px";
  stack.addControl(hint);

  /** Posiciona o painel como um púlpito, de frente para `viewer`. */
  function placeFacing(position, viewer) {
    plane.position.copyFrom(position);
    const dir = position.subtract(viewer);
    plane.rotation.set(0.5, Math.atan2(dir.x, dir.z), 0); // topo inclinado para longe do usuário
  }

  return {
    mesh: plane,
    show() {
      plane.setEnabled(true);
    },
    hide() {
      plane.setEnabled(false);
    },
    /** Posição padrão: à frente-direita do ponto de partida, na altura da cintura. */
    placeNearSpawn(spawn, lookAt) {
      const fwd = lookAt.subtract(spawn);
      fwd.y = 0;
      fwd.normalize();
      const right = new Vector3(fwd.z, 0, -fwd.x);
      const pos = spawn.add(fwd.scale(0.75)).add(right.scale(0.36));
      pos.y = 1.05;
      placeFacing(pos, new Vector3(spawn.x, 1.6, spawn.z));
    },
    /** Traz o painel para ~0,7 m à frente da câmera (botões B/Y). */
    summon(camera) {
      const eye = camera.globalPosition.clone();
      const fwd = camera.getDirection(Vector3.Forward());
      fwd.y = 0;
      if (fwd.lengthSquared() < 1e-4) fwd.set(0, 0, 1);
      fwd.normalize();
      const pos = eye.add(fwd.scale(0.7));
      pos.y = eye.y - 0.35;
      placeFacing(pos, eye);
      plane.setEnabled(true);
    },
    setXRayState(on) {
      xrayButton.metadata = { active: on };
      xrayButton.background = on ? ACTIVE_BG : IDLE_BG;
      if (xrayButton.textBlock) xrayButton.textBlock.text = on ? "RAIO X: ligado" : "RAIO X";
    },
    setEnergyState(on) {
      energyButton.metadata = { active: on };
      energyButton.background = on ? ACTIVE_BG : IDLE_BG;
      if (energyButton.textBlock) energyButton.textBlock.text = on ? "Energia: ligado" : "Energia";
    },
    setTurntableState(on) {
      status.text = on ? "Plataforma girando" : "Plataforma parada";
      if (turntableButton.textBlock) turntableButton.textBlock.text = on ? "Parar plataforma" : "Girar plataforma";
    },
  };
}
