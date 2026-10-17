import { MeshBuilder, Vector3 } from "../babylon.js";
import { PALETTE } from "../config.js";
import { ENERGY_MODES, NOTE_LABELS, SIMULATION_DISCLAIMER } from "../simulation/energyContent.js";
import { describePower, stateText } from "./energyPanel.js";
import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "./gui.js";

const FONT = "'Segoe UI', Roboto, Arial, sans-serif";
const f0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const f1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Painel de energia holográfico (VR). Carregado sob demanda pelo energyPanel.js. */
export function createEnergyPanelVR(scene, handlers) {
  const width = 0.8;
  const height = 0.64;
  const plane = MeshBuilder.CreatePlane("vr-energy-panel", { width, height }, scene);
  plane.setEnabled(false);
  const ui = AdvancedDynamicTexture.CreateForMesh(plane, 1024, Math.round((1024 * height) / width));

  const frame = new Rectangle("ep-frame");
  frame.thickness = 4;
  frame.cornerRadius = 34;
  frame.color = PALETTE.cyan;
  frame.background = "rgba(8, 17, 31, 0.93)";
  ui.addControl(frame);

  const stack = new StackPanel("ep-stack");
  stack.width = "950px";
  stack.paddingTop = "26px";
  stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  frame.addControl(stack);

  const text = (name, size, weight = "400", color = PALETTE.text, parent = stack) => {
    const t = new TextBlock(name, "");
    t.fontFamily = FONT;
    t.fontSize = size;
    t.fontWeight = weight;
    t.color = color;
    t.textWrapping = true;
    t.resizeToFit = true;
    t.width = "950px";
    t.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    parent.addControl(t);
    return t;
  };
  const row = (name, h) => {
    const r = new StackPanel(name);
    r.isVertical = false;
    r.height = h;
    r.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(r);
    return r;
  };
  const button = (parent, name, label, w, h, accent, size = 28) => {
    const b = Button.CreateSimpleButton(name, label);
    b.width = w;
    b.height = h;
    b.paddingRight = "12px";
    b.cornerRadius = 22;
    b.thickness = 3;
    b.color = accent;
    b.background = "rgba(0, 184, 255, 0.10)";
    b.fontFamily = FONT;
    b.fontSize = size;
    b.fontWeight = "600";
    if (b.textBlock) b.textBlock.color = PALETTE.text;
    b.onPointerEnterObservable.add(() => (b.alpha = 0.85));
    b.onPointerOutObservable.add(() => (b.alpha = 1));
    parent.addControl(b);
    return b;
  };

  const eyebrow = text("ep-eyebrow", 24, "700", PALETTE.cyan);
  eyebrow.text = "FLUXO DE ENERGIA · SIMULAÇÃO EDUCATIVA";

  const tabsRow = row("ep-tabs", "86px");
  tabsRow.paddingTop = "10px";
  const tabButtons = {
    accel: button(tabsRow, "ep-tab-accel", "Aceleração", "300px", "76px", PALETTE.cyan),
    regen: button(tabsRow, "ep-tab-regen", "Frenagem regen.", "300px", "76px", PALETTE.cyan),
    charge: button(tabsRow, "ep-tab-charge", "Recarga", "300px", "76px", PALETTE.cyan),
  };
  for (const [t, b] of Object.entries(tabButtons)) b.onPointerUpObservable.add(() => handlers.onTab?.(t));

  const title = text("ep-title", 36, "700");
  title.paddingTop = "10px";
  const body = text("ep-text", 25);
  body.lineSpacing = "3px";
  const chain = text("ep-chain", 25, "600", PALETTE.cyan);
  chain.paddingTop = "6px";

  const statsRow = row("ep-stats", "96px");
  statsRow.paddingTop = "12px";
  const stat = (name) => {
    const t = new TextBlock(name, "");
    t.fontFamily = FONT;
    t.fontSize = 34;
    t.fontWeight = "700";
    t.color = PALETTE.text;
    t.width = "316px";
    t.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    statsRow.addControl(t);
    return t;
  };
  const speed = stat("ep-speed");
  const soc = stat("ep-soc");
  const power = stat("ep-power");
  const state = text("ep-state", 27, "600", PALETTE.cyan);

  const controls = row("ep-controls", "116px");
  controls.paddingTop = "12px";
  const accelBtn = button(controls, "ep-accel", "Acelerar", "460px", "100px", PALETTE.cyan, 34);
  const brakeBtn = button(controls, "ep-brake", "Frear", "460px", "100px", PALETTE.orange, 34);
  const chargeRow = row("ep-charge", "116px");
  chargeRow.paddingTop = "12px";
  const acBtn = button(chargeRow, "ep-ac", "CA · bordo", "300px", "100px", PALETTE.cyan, 30);
  const dcBtn = button(chargeRow, "ep-dc", "CC · rápida", "300px", "100px", PALETTE.blue, 30);
  const goBtn = button(chargeRow, "ep-go", "Iniciar recarga", "320px", "100px", PALETTE.orange, 30);
  acBtn.onPointerUpObservable.add(() => handlers.onChargeType?.("ac"));
  dcBtn.onPointerUpObservable.add(() => handlers.onChargeType?.("dc"));
  goBtn.onPointerUpObservable.add(() => handlers.onChargeToggle?.());

  const hold = (b, name) => {
    b.onPointerDownObservable.add(() => handlers.onHold?.(name, true));
    b.onPointerUpObservable.add(() => handlers.onHold?.(name, false));
    b.onPointerOutObservable.add(() => handlers.onHold?.(name, false));
  };
  hold(accelBtn, "accel");
  hold(brakeBtn, "brake");

  const footer = text("ep-footer", 19, "400", "rgba(245, 247, 250, 0.6)");
  footer.paddingTop = "10px";
  footer.text = SIMULATION_DISCLAIMER;

  const close = Button.CreateSimpleButton("ep-close", "✕");
  close.width = "76px";
  close.height = "76px";
  close.cornerRadius = 38;
  close.thickness = 3;
  close.color = PALETTE.text;
  close.fontSize = 34;
  close.top = "18px";
  close.left = "-18px";
  close.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  close.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  close.onPointerUpObservable.add(() => handlers.onClose?.());
  frame.addControl(close);

  return {
    show() {
      plane.setEnabled(true);
    },
    hide() {
      plane.setEnabled(false);
    },
    /** À frente-esquerda do usuário, como um púlpito (o painel de controle fica à direita). */
    place(camera) {
      const eye = camera.globalPosition.clone();
      const fwd = camera.getDirection(Vector3.Forward());
      fwd.y = 0;
      if (fwd.lengthSquared() < 1e-4) fwd.set(0, 0, 1);
      fwd.normalize();
      const right = new Vector3(fwd.z, 0, -fwd.x);
      const pos = eye.add(fwd.scale(0.8)).add(right.scale(-0.5));
      pos.y = eye.y - 0.22;
      plane.position.copyFrom(pos);
      const face = pos.subtract(eye);
      plane.rotation.set(0.32, Math.atan2(face.x, face.z), 0);
    },
    setMode(tab, modeKey) {
      const m = ENERGY_MODES[modeKey];
      for (const [t, b] of Object.entries(tabButtons)) b.background = t === tab ? "rgba(0, 229, 255, 0.32)" : "rgba(0, 184, 255, 0.10)";
      title.text = m.title;
      body.text = m.text;
      chain.text = m.chain.map((s) => (s.note ? `${s.label} (${s.note})` : s.label)).join("  →  ");
      controls.isVisible = tab !== "charge";
      chargeRow.isVisible = tab === "charge";
      const type = modeKey === "charge-dc" ? "dc" : "ac";
      acBtn.background = type === "ac" ? "rgba(0, 229, 255, 0.32)" : "rgba(0, 184, 255, 0.10)";
      dcBtn.background = type === "dc" ? "rgba(0, 184, 255, 0.4)" : "rgba(0, 184, 255, 0.10)";
    },
    update(snap) {
      const pw = describePower(snap.powerKw, snap.state);
      speed.text = `${f0.format(snap.speedKmh)} km/h`;
      soc.text = `SOC ${f1.format(snap.soc)}%`;
      power.text = `${pw.value} kW`;
      const note = snap.note ? NOTE_LABELS[snap.note] ?? "" : "";
      state.text = `${stateText(snap)}${pw.hint ? ` · ${pw.hint}` : ""}${note ? ` — ${note}` : ""}`;
      if (goBtn.textBlock) goBtn.textBlock.text = snap.charging ? "Encerrar recarga" : "Iniciar recarga";
    },
  };
}
