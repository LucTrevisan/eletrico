const ILLUSTRATIVE_NOTE = "Representação ilustrativa — este componente não está modelado no arquivo 3D.";

/**
 * Painel educativo do componente selecionado: Nome, Função, Como funciona e Importância.
 *  - Desktop/celular: painel HTML lateral (folha inferior retrátil no celular).
 *  - VR: painel holográfico 3D (Babylon GUI), ao lado da linha de visão até o componente.
 * `actions` (opcional): botões de ação do componente, ex.: [{ id: "doors", label: "Abrir portas" }].
 * `collapsed` (celular): abre a folha recolhida — só o nome; a alça expande os detalhes.
 */
export function createComponentPanel(scene, { onClose, onAction }) {
  const desktop = createDesktopPanel(onClose, onAction);
  let vrPromise = null; // módulo VR (e a GUI do Babylon) só é baixado na primeira seleção em VR
  let vr = null;
  let openId = null;

  return {
    get openId() {
      return openId;
    },
    showDesktop(id, content, { illustrative = false, actions = [], collapsed = false } = {}) {
      openId = id;
      vr?.hide();
      desktop.show(content, illustrative, actions, collapsed);
    },
    async showVR(id, content, { illustrative = false, actions = [], camera, target }) {
      openId = id;
      desktop.hide();
      vrPromise ??= import("./componentPanelVR.js").then(
        (m) => (vr = m.createComponentPanelVR(scene, { onClose, onAction, illustrativeNote: ILLUSTRATIVE_NOTE })),
      );
      await vrPromise;
      if (openId === id) vr.show(content, illustrative, camera, target, actions);
    },
    /** Atualiza o texto dos botões de ação sem reabrir o painel (ex.: "Abrir" ↔ "Fechar"). */
    setActions(actions) {
      desktop.setActions(actions);
      vr?.setActions(actions);
    },
    hide() {
      openId = null;
      desktop.hide();
      vr?.hide();
    },
  };
}

// ----------------------------------------------------------------------------- desktop

function createDesktopPanel(onClose, onAction) {
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
    modelLabel: $("cpModelLabel"),
    model: $("cpModel"),
    actions: $("cpActions"),
    close: $("cpClose"),
  };
  el.close.addEventListener("click", () => onClose?.());
  el.illustrative.textContent = ILLUSTRATIVE_NOTE;

  function setActions(actions) {
    el.actions.innerHTML = "";
    el.actions.hidden = !actions.length;
    for (const a of actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn";
      b.textContent = a.label;
      b.addEventListener("click", () => onAction?.(a.id));
      el.actions.append(b);
    }
  }

  return {
    setActions,
    show(c, illustrative, actions, collapsed = false) {
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
      // Nota específica do veículo exibido (config: notes).
      el.modelLabel.hidden = el.model.hidden = !c.modelNote;
      if (c.modelNote) {
        el.modelLabel.textContent = c.modelNote.label;
        el.model.textContent = c.modelNote.text;
      }
      setActions(actions);
      el.root.hidden = false;
      el.root.classList.toggle("is-collapsed", collapsed); // padrão: nova seleção abre expandida
      el.root.querySelector(".sheet-handle")?.setAttribute("aria-expanded", String(!collapsed));
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
