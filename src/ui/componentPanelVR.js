import { MeshBuilder, Vector3 } from "../babylon.js";
import { PALETTE } from "../config.js";
import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "./gui.js";

const FONT = "'Segoe UI', Roboto, Arial, sans-serif";

/** Painel educativo holográfico (VR). Carregado sob demanda pelo componentPanel.js. */
export function createComponentPanelVR(scene, { onClose, onAction, illustrativeNote }) {
  const width = 0.7;
  const height = 0.74; // espaço para a nota do veículo e os botões de ação
  const plane = MeshBuilder.CreatePlane("vr-component-panel", { width, height }, scene);
  plane.setEnabled(false);
  const res = 1024;
  const ui = AdvancedDynamicTexture.CreateForMesh(plane, res, Math.round((res * height) / width));

  const frame = new Rectangle("cp-frame");
  frame.thickness = 4;
  frame.cornerRadius = 34;
  frame.background = "rgba(8, 17, 31, 0.93)";
  ui.addControl(frame);

  const stack = new StackPanel("cp-stack");
  stack.width = "940px";
  stack.paddingTop = "34px";
  stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  frame.addControl(stack);

  const text = (name, size, weight = "400", color = PALETTE.text) => {
    const t = new TextBlock(name, "");
    t.fontFamily = FONT;
    t.fontSize = size;
    t.fontWeight = weight;
    t.color = color;
    t.textWrapping = true;
    t.resizeToFit = true;
    t.width = "940px";
    t.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(t);
    return t;
  };

  const tag = text("cp-tag", 26, "700");
  const title = text("cp-title", 50, "700");
  title.paddingBottom = "6px";
  const note = text("cp-note", 24, "600", PALETTE.orange);
  const sections = ["Função", "Como funciona", "Importância", "extra", "modelo"].map((label, i) => {
    const head = text(`cp-h${i}`, 26, "700");
    head.paddingTop = "16px";
    head.text = label;
    const body = text(`cp-b${i}`, 29, "400");
    body.lineSpacing = "4px";
    return { head, body };
  });

  // Botões de ação do componente (ex.: abrir/fechar portas).
  const actionsRow = new StackPanel("cp-actions");
  actionsRow.isVertical = false;
  actionsRow.height = "120px";
  actionsRow.paddingTop = "20px";
  actionsRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  stack.addControl(actionsRow);
  function setActions(actions = []) {
    for (const c of [...actionsRow.children]) actionsRow.removeControl(c);
    actionsRow.isVisible = actions.length > 0;
    for (const a of actions) {
      const b = Button.CreateSimpleButton(`cp-action-${a.id}`, a.label);
      b.width = "380px";
      b.height = "96px";
      b.paddingRight = "16px";
      b.cornerRadius = 24;
      b.thickness = 3;
      b.color = PALETTE.cyan;
      b.background = "rgba(0, 184, 255, 0.14)";
      b.fontFamily = FONT;
      b.fontSize = 32;
      b.fontWeight = "600";
      if (b.textBlock) b.textBlock.color = PALETTE.text;
      b.onPointerUpObservable.add(() => onAction?.(a.id));
      actionsRow.addControl(b);
    }
  }

  const close = Button.CreateSimpleButton("cp-close", "✕");
  close.width = "84px";
  close.height = "84px";
  close.cornerRadius = 42;
  close.thickness = 3;
  close.color = PALETTE.text;
  close.background = "rgba(245, 247, 250, 0.08)";
  close.fontSize = 38;
  close.top = "22px";
  close.left = "-22px";
  close.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  close.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  close.onPointerEnterObservable.add(() => (close.background = "rgba(255, 159, 67, 0.3)"));
  close.onPointerOutObservable.add(() => (close.background = "rgba(245, 247, 250, 0.08)"));
  close.onPointerUpObservable.add(() => onClose?.());
  frame.addControl(close);

  return {
    setActions,
    show(c, illustrative, camera, target, actions = []) {
      setActions(actions);
      frame.color = c.color;
      tag.color = c.color;
      tag.text = c.tag.toUpperCase();
      title.text = c.title;
      note.text = illustrative ? illustrativeNote : "";
      note.isVisible = illustrative;
      const values = [c.funcao, c.comoFunciona, c.importancia, c.extra?.text, c.modelNote?.text];
      sections.forEach((s, i) => {
        s.head.color = c.color;
        s.body.text = values[i] ?? "";
        s.head.isVisible = s.body.isVisible = !!values[i];
      });
      sections[3].head.text = c.extra?.label ?? "";
      sections[4].head.text = c.modelNote?.label ?? "";

      // Entre o usuário e o componente, deslocado para a direita da linha de visão.
      const eye = camera.globalPosition.clone();
      const toTarget = target.subtract(eye);
      toTarget.y = 0;
      const dist = toTarget.length();
      const dir = dist > 1e-3 ? toTarget.scale(1 / dist) : camera.getDirection(Vector3.Forward());
      dir.y = 0;
      dir.normalize();
      const right = new Vector3(dir.z, 0, -dir.x);
      const pos = eye.add(dir.scale(Math.min(0.85, Math.max(0.55, dist * 0.45)))).add(right.scale(0.45));
      pos.y = eye.y - 0.08;
      plane.position.copyFrom(pos);
      const face = pos.subtract(eye);
      plane.rotation.set(0.08, Math.atan2(face.x, face.z), 0);
      plane.setEnabled(true);
    },
    hide() {
      plane.setEnabled(false);
    },
  };
}
