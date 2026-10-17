const ILLUSTRATIVE_NOTE = "Representação ilustrativa — este componente não está modelado no arquivo 3D.";

/**
 * Painel educativo do componente selecionado: Nome, Função, Como funciona e Importância.
 *  - Desktop/celular: painel HTML lateral (folha inferior no celular), sem cobrir o centro da tela.
 *  - VR: painel holográfico 3D (Babylon GUI), ao lado da linha de visão até o componente.
 */
export function createComponentPanel(scene, { onClose }) {
  const desktop = createDesktopPanel(onClose);
  let vrPromise = null; // módulo VR (e a GUI do Babylon) só é baixado na primeira seleção em VR
  let vr = null;
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
    async showVR(id, content, { illustrative = false, camera, target }) {
      openId = id;
      desktop.hide();
      vrPromise ??= import("./componentPanelVR.js").then((m) => (vr = m.createComponentPanelVR(scene, onClose, ILLUSTRATIVE_NOTE)));
      await vrPromise;
      if (openId === id) vr.show(content, illustrative, camera, target);
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
      document.body.classList.add("cp-open");
      // reinicia a animação de entrada
      el.root.classList.remove("is-entering");
      void el.root.offsetWidth;
      el.root.classList.add("is-entering");
    },
    hide() {
      el.root.hidden = true;
      document.body.classList.remove("cp-open");
    },
  };
}
