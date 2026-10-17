import { MeshBuilder, Vector3 } from "@babylonjs/core";
import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { PALETTE } from "../config.js";

const FONT = "'Segoe UI', Roboto, Arial, sans-serif";
const ILLUSTRATIVE_NOTE = "Representação ilustrativa — este componente não está modelado no arquivo 3D.";

/**
 * Painel educativo do componente selecionado: Nome, Função, Como funciona e Importância.
 *  - Desktop/celular: painel HTML lateral (folha inferior no celular), sem cobrir o centro da tela.
 *  - VR: painel holográfico 3D (Babylon GUI), ao lado da linha de visão até o componente.
 */
export function createComponentPanel(scene, { onClose }) {
  const desktop = createDesktopPanel(onClose);
  let vr = null; // criado só na primeira seleção em VR
  let openId = null;

  return {
    get openId() {
      return openId;
    },
    showDesktop(id, content, { illustrative = false } = {}) {
      openId = id;
      vr?.hide();
      desktop.show(content, illustrative);
    },
    showVR(id, content, { illustrative = false, camera, target }) {
      openId = id;
      desktop.hide();
      vr ??= createVRPanel(scene, onClose);
      vr.show(content, illustrative, camera, target);
    },
    hide() {
      openId = null;
      desktop.hide();
      vr?.hide();
    },
  };
}

// ----------------------------------------------------------------------------- desktop

function createDesktopPanel(onClose) {
  const $ = (id) => document.getElementById(id);
  const el = {
    root: $("componentPanel"),
    tag: $("cpTag"),
    title: $("cpTitle"),
    illustrative: $("cpIllustrative"),
    funcao: $("cpFuncao"),
    como: $("cpComo"),
    importancia: $("cpImportancia"),
    extraLabel: $("cpExtraLabel"),
    extra: $("cpExtra"),
    close: $("cpClose"),
  };
  el.close.addEventListener("click", () => onClose?.());
  el.illustrative.textContent = ILLUSTRATIVE_NOTE;

  return {
    show(c, illustrative) {
      el.root.style.setProperty("--accent", c.color);
      el.tag.textContent = c.tag;
      el.title.textContent = c.title;
      el.illustrative.hidden = !illustrative;
      el.funcao.textContent = c.funcao;
      el.como.textContent = c.comoFunciona;
      el.importancia.textContent = c.importancia;
      el.extraLabel.hidden = el.extra.hidden = !c.extra;
      if (c.extra) {
        el.extraLabel.textContent = c.extra.label;
        el.extra.textContent = c.extra.text;
      }
      el.root.hidden = false;
      // reinicia a animação de entrada
      el.root.classList.remove("is-entering");
      void el.root.offsetWidth;
      el.root.classList.add("is-entering");
    },
    hide() {
      el.root.hidden = true;
    },
  };
}

// ----------------------------------------------------------------------------- VR

function createVRPanel(scene, onClose) {
  const width = 0.7;
  const height = 0.6;
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
  const sections = ["Função", "Como funciona", "Importância", "extra"].map((label, i) => {
    const head = text(`cp-h${i}`, 26, "700");
    head.paddingTop = "16px";
    head.text = label;
    const body = text(`cp-b${i}`, 29, "400");
    body.lineSpacing = "4px";
    return { head, body };
  });

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
    show(c, illustrative, camera, target) {
      frame.color = c.color;
      tag.color = c.color;
      tag.text = c.tag.toUpperCase();
      title.text = c.title;
      note.text = illustrative ? ILLUSTRATIVE_NOTE : "";
      note.isVisible = illustrative;
      const values = [c.funcao, c.comoFunciona, c.importancia, c.extra?.text];
      sections.forEach((s, i) => {
        s.head.color = c.color;
        s.body.text = values[i] ?? "";
        s.head.isVisible = s.body.isVisible = !!values[i];
      });
      sections[3].head.text = c.extra?.label ?? "";

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
