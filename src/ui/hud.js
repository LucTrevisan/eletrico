/**
 * HUD em HTML para desktop e celular (não aparece dentro do headset — em VR o
 * equivalente é o painel 3D de ui/vrMenu.js).
 * Só manipula o DOM; quem decide o que cada botão faz é o main.js via `bind()`.
 */
const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    hud: $("hud"),
    loader: $("loader"),
    progress: $("progress"),
    progressBar: $("progressBar"),
    loaderStatus: $("loaderStatus"),
    loaderActions: $("loaderActions"),
    retryButton: $("retryButton"),
    continueButton: $("continueButton"),
    vrStatus: $("vrStatus"),
    vrButton: $("vrButton"),
    vehicleCard: $("vehicleCard"),
    vehicleName: $("vehicleName"),
    vehicleBadge: $("vehicleBadge"),
    vehicleDims: $("vehicleDims"),
    toast: $("toast"),
    turntableButton: $("turntableButton"),
    turntableLabel: $("turntableLabel"),
    helpButton: $("helpButton"),
    helpPanel: $("helpPanel"),
    helpClose: $("helpClose"),
    hint: $("hint"),
    contextLost: $("contextLost"),
    canvas: $("renderCanvas"),
    xrayButton: $("xrayButton"),
    energyButton: $("energyButton"),
    explodeButton: $("explodeButton"),
    explodeLabel: $("explodeLabel"),
    tooltip: $("tooltip"),
    uiToggle: $("uiToggle"),
    vehicleToggle: $("vehicleToggle"),
    vehicleCredit: $("vehicleCredit"),
    viewsToggle: $("viewsToggle"),
    toolbar: document.querySelector(".toolbar"),
    toolbarHide: $("toolbarHide"),
    toolbarRestore: $("toolbarRestore"),
    componentPanel: $("componentPanel"),
    energyPanel: $("energyPanel"),
    cabinEnter: $("cabinEnter"),
    arButton: $("arButton"),
    arBar: $("arBar"),
    arStatus: $("arStatus"),
    arScale: $("arScale"),
    cabinBar: $("cabinBar"),
    cabinExit: $("cabinExit"),
  };
  const viewButtons = [...document.querySelectorAll("[data-view]")];
  const isNarrow = () => window.matchMedia("(max-width: 720px)").matches;
  // Celular em pé ou deitado (mesmas faixas do CSS): legendas sob demanda, gavetas etc.
  const compactQuery = window.matchMedia("(max-width: 720px), (max-height: 520px)");
  let handlers = {};
  let toastTimer = null;

  // ------------------------------------------------------------ eventos
  for (const b of viewButtons)
    b.addEventListener("click", () => {
      handlers.onView?.(b.dataset.view);
      setViewsOpen(false); // no celular, o menu de vistas fecha após a escolha
    });
  el.turntableButton.addEventListener("click", () => handlers.onToggleTurntable?.());
  el.xrayButton.addEventListener("click", () => handlers.onToggleXRay?.());
  el.energyButton.addEventListener("click", () => handlers.onToggleEnergy?.());
  el.explodeButton.addEventListener("click", () => handlers.onToggleExplode?.());

  // ------------------------------------------------------------ interface retrátil
  // Ocultar tudo (olho): só o modelo 3D, o botão do olho e o de VR continuam na tela.
  let uiHidden = false;
  function setUiHidden(hidden) {
    uiHidden = hidden;
    document.body.classList.toggle("ui-hidden", hidden);
    el.uiToggle.setAttribute("aria-pressed", String(hidden));
    el.uiToggle.title = hidden ? "Mostrar interface (I)" : "Ocultar interface (I)";
  }
  el.uiToggle.addEventListener("click", () => setUiHidden(!uiHidden));

  // Cartão do veículo: recolhe para mostrar só o nome (recolhido por padrão no celular).
  const setCardCollapsed = (collapsed) => {
    el.vehicleCard.classList.toggle("is-collapsed", collapsed);
    el.vehicleToggle.setAttribute("aria-expanded", String(!collapsed));
  };
  el.vehicleToggle.addEventListener("click", () => setCardCollapsed(!el.vehicleCard.classList.contains("is-collapsed")));
  if (isNarrow()) setCardCollapsed(true);

  // Celular: vistas num menu compacto e barra de ferramentas recolhível.
  function setViewsOpen(open) {
    el.toolbar.classList.toggle("views-open", open);
    el.viewsToggle.setAttribute("aria-expanded", String(open));
  }
  el.viewsToggle.addEventListener("click", () => setViewsOpen(!el.toolbar.classList.contains("views-open")));
  const setToolbarHidden = (hidden) => {
    document.body.classList.toggle("toolbar-hidden", hidden);
    el.toolbarRestore.hidden = !hidden;
    setViewsOpen(false);
  };
  el.toolbarHide.addEventListener("click", () => setToolbarHidden(true));
  el.toolbarRestore.addEventListener("click", () => setToolbarHidden(false));

  // Folhas (painel educativo e de energia): alça recolhe/expande; arrastar para baixo/cima também.
  for (const sheet of [el.componentPanel, el.energyPanel]) {
    const handle = sheet.querySelector(".sheet-handle");
    const toggle = (collapsed = !sheet.classList.contains("is-collapsed")) => {
      sheet.classList.toggle("is-collapsed", collapsed);
      handle.setAttribute("aria-expanded", String(!collapsed));
    };
    let startY = null;
    let dragged = false;
    handle.addEventListener("click", () => {
      if (dragged) dragged = false; // o gesto de arrastar já decidiu
      else toggle();
    });
    handle.addEventListener("pointerdown", (e) => {
      startY = e.clientY;
      dragged = false;
    });
    window.addEventListener("pointerup", (e) => {
      if (startY === null) return;
      const dy = e.clientY - startY;
      startY = null;
      if (Math.abs(dy) > 36) {
        dragged = true;
        toggle(dy > 0);
      }
    });
  }
  el.vrButton.addEventListener("click", () => handlers.onEnterVR?.());
  el.helpButton.addEventListener("click", () => setHelp(el.helpPanel.hidden));
  el.helpClose.addEventListener("click", () => setHelp(false));
  el.retryButton.addEventListener("click", () => window.location.reload());

  // Vista interna (dentro do carro): só a saída fica na tela; os atalhos esperam a volta (exceto Esc).
  let inCabin = false;
  el.cabinEnter.addEventListener("click", () => handlers.onEnterCabin?.());
  // Realidade aumentada: botão de entrada e barra do celular (sobreposição HTML sobre a câmera).
  el.arButton.addEventListener("click", () => handlers.onEnterAR?.());
  // Os painéis da RA se apoiam na barra: a altura dela (1 ou 2 linhas de texto) vira variável CSS.
  new ResizeObserver(() => document.body.style.setProperty("--ar-bar-h", `${el.arBar.offsetHeight}px`)).observe(el.arBar);
  for (const b of el.arBar.querySelectorAll("[data-ar]")) b.addEventListener("click", () => handlers.onARAction?.(b.dataset.ar));
  el.cabinExit.addEventListener("click", () => handlers.onExitCabin?.());
  const seatGroup = el.cabinBar.querySelector(".cabin-seats");
  const seatButtons = [...el.cabinBar.querySelectorAll("[data-seat]")];
  for (const b of seatButtons) b.addEventListener("click", () => handlers.onCabinSeat?.(b.dataset.seat));

  const viewKeys = { 0: "hero", 1: "front", 2: "side", 3: "rear", 4: "top" };
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (inCabin) {
      if (e.key === "Escape") handlers.onExitCabin?.();
      return;
    }
    if (viewKeys[e.key]) handlers.onView?.(viewKeys[e.key]);
    else if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      handlers.onToggleTurntable?.();
    } else if (e.key === "h" || e.key === "H") setHelp(el.helpPanel.hidden);
    else if (e.key === "x" || e.key === "X") handlers.onToggleXRay?.();
    else if (e.key === "e" || e.key === "E") handlers.onToggleEnergy?.();
    else if (e.key === "v" || e.key === "V") handlers.onToggleExplode?.();
    else if (e.key === "p" || e.key === "P") handlers.onToggleDoors?.();
    else if (e.key === "i" || e.key === "I") setUiHidden(!uiHidden);
    else if (e.key === "Escape") {
      setHelp(false);
      handlers.onEscape?.();
    }
  });

  // A dica some após a primeira interação com o canvas (ou depois de 12 s).
  const dismissHint = () => el.hint.classList.add("is-hidden");
  el.canvas.addEventListener("pointerdown", dismissHint, { once: true });
  setTimeout(dismissHint, 12000);
  if (window.matchMedia?.("(pointer: coarse)").matches) {
    el.hint.textContent = "Arraste para girar · Faça pinça para aproximar";
  }

  function setHelp(open) {
    el.helpPanel.hidden = !open;
    el.helpButton.setAttribute("aria-expanded", String(open));
  }

  // ------------------------------------------------------------ API
  return {
    bind(h) {
      handlers = h;
    },

    setProgress(fraction) {
      if (fraction == null) {
        el.progress.classList.add("is-indeterminate");
        return;
      }
      el.progress.classList.remove("is-indeterminate");
      const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
      el.progressBar.style.width = `${pct}%`;
      el.progress.setAttribute("aria-valuenow", String(pct));
    },

    setLoaderStatus(text) {
      el.loaderStatus.textContent = text;
    },

    /** Mostra o erro no cartão de carregamento, com opção de seguir sem o modelo. */
    showLoadError(message, { onContinue } = {}) {
      el.loader.classList.add("has-error");
      el.loaderStatus.textContent = message;
      el.loaderActions.hidden = false;
      el.continueButton.onclick = () => onContinue?.();
    },

    showFatal(err) {
      el.loader.hidden = false;
      el.loader.classList.add("has-error");
      el.loaderStatus.textContent = `Não foi possível iniciar a experiência: ${err?.message || err}`;
      el.loaderActions.hidden = false;
      el.continueButton.hidden = true;
    },

    hideLoader() {
      el.hud.hidden = false;
      el.loader.classList.add("is-leaving");
      setTimeout(() => (el.loader.hidden = true), 650);
    },

    /** checking | available | unavailable | in-xr | error */
    setVR(state, reason = "") {
      const labels = {
        checking: "Verificando VR…",
        available: "VR disponível",
        unavailable: "Modo 3D",
        "in-xr": "Em VR",
        error: "VR indisponível",
      };
      el.vrStatus.dataset.state = state;
      el.vrStatus.textContent = labels[state] ?? state;
      el.vrStatus.title = reason;
      el.vrStatus.hidden = state === "available";
      el.vrButton.hidden = state !== "available";
    },

    setVehicle(info) {
      if (!info) return;
      el.vehicleCard.hidden = false;
      el.vehicleName.textContent = info.label;
      el.vehicleBadge.textContent = info.badge ?? (info.provisional ? "Modelo provisório" : "Modelo 3D");
      el.vehicleBadge.dataset.kind = info.provisional ? "provisional" : "final";
      const fmt = (v) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
      el.vehicleDims.innerHTML = "";
      for (const [label, value] of [
        ["Comprimento", info.dims.length],
        ["Largura", info.dims.width],
        ["Altura", info.dims.height],
      ]) {
        const wrap = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = label;
        dd.textContent = fmt(value);
        wrap.append(dt, dd);
        el.vehicleDims.append(wrap);
      }
    },

    setActiveView(name) {
      for (const b of viewButtons) b.setAttribute("aria-pressed", String(b.dataset.view === name));
    },

    setXRay(on) {
      el.xrayButton.setAttribute("aria-pressed", String(on));
    },

    setExplode(on) {
      el.explodeButton.setAttribute("aria-pressed", String(on));
      el.explodeLabel.textContent = on ? "Montar" : "Explodir";
    },

    setCredit(text) {
      el.vehicleCredit.textContent = text ?? "";
      el.vehicleCredit.hidden = !text;
    },

    /** Botão "Entrar em RA" (só com suporte a immersive-ar). */
    setARAvailable(on) {
      el.arButton.hidden = !on;
    },
    /** Sessão de RA: `overlay` = celular (barra HTML sobre a câmera). */
    setAR(active, { overlay = false } = {}) {
      document.body.classList.toggle("in-ar", active && overlay);
      el.arBar.hidden = !(active && overlay);
    },
    /** Durante qualquer sessão (VR ou RA) o botão de RA some, como o de VR. */
    setXRSession(on) {
      if (on) {
        el.arButton.dataset.wasVisible = String(!el.arButton.hidden);
        el.arButton.hidden = true;
      } else if (el.arButton.dataset.wasVisible === "true") el.arButton.hidden = false;
    },
    setARStatus(text) {
      if (el.arStatus.textContent !== text) el.arStatus.textContent = text;
    },
    /** Estado dos botões da barra de RA. */
    setARState({ xray, energy, explode, scale }) {
      const set = (k, v) => el.arBar.querySelector(`[data-ar="${k}"]`)?.setAttribute("aria-pressed", String(!!v));
      if (xray !== undefined) set("xray", xray);
      if (energy !== undefined) set("energy", energy);
      if (explode !== undefined) set("explode", explode);
      if (scale !== undefined) el.arScale.textContent = scale === 1 ? "Maquete 1:4" : "Tamanho real";
    },

    /** Botão "Entrar no carro" (aparece com uma porta aberta). */
    setCabinAvailable(on) {
      if (el.cabinEnter.hidden === !on) return;
      el.cabinEnter.hidden = !on;
      if (on) dismissHint(); // ocupam o mesmo lugar, acima da barra
    },
    /**
     * state: "out" | "entering" | "in" | "moving" | "leaving".
     * seat: banco atual (id); rear: há banco de trás (mostra os botões Motorista / Banco de trás).
     */
    setCabin(state, { seat = null, rear = false } = {}) {
      inCabin = state !== "out";
      document.body.classList.toggle("in-cabin", inCabin);
      el.cabinBar.hidden = state !== "in" && state !== "moving";
      seatGroup.hidden = !rear;
      const kind = seat && seat !== "driver" ? "rear" : "driver";
      for (const b of seatButtons) {
        b.setAttribute("aria-pressed", String(b.dataset.seat === kind));
        b.disabled = state !== "in"; // durante a troca de banco
      }
      el.cabinExit.disabled = state !== "in";
      if (inCabin) {
        el.cabinEnter.hidden = true;
        el.tooltip.hidden = true;
      }
    },

    /** Layout de celular (em pé ou deitado). */
    isCompactLayout: () => compactQuery.matches,
    /** Celular em pé (gavetas inferiores). */
    isNarrowLayout: isNarrow,

    /**
     * Área da tela ocupada pelos painéis (px), para a câmera centralizar o carro no espaço livre.
     * Desktop: painéis laterais. Celular: folhas inferiores.
     */
    getInsets() {
      const insets = { left: 0, right: 0, bottom: 0 };
      if (uiHidden) return insets;
      const visible = (n) => n && !n.hidden && n.offsetParent !== null;
      if (isNarrow()) {
        for (const sheet of [el.componentPanel, el.energyPanel]) {
          if (visible(sheet)) insets.bottom = Math.max(insets.bottom, window.innerHeight - sheet.getBoundingClientRect().top);
        }
      } else {
        if (visible(el.energyPanel)) insets.left = el.energyPanel.getBoundingClientRect().right + 8;
        if (visible(el.componentPanel)) insets.right = window.innerWidth - el.componentPanel.getBoundingClientRect().left + 8;
      }
      return insets;
    },

    setEnergy(on) {
      el.energyButton.setAttribute("aria-pressed", String(on));
    },

    /** Dica que acompanha o mouse sobre uma peça. */
    showTooltip(text, x, y) {
      el.tooltip.textContent = text;
      el.tooltip.hidden = false;
      el.tooltip.style.transform = `translate(${Math.round(x + 16)}px, ${Math.round(y + 18)}px)`;
    },

    hideTooltip() {
      el.tooltip.hidden = true;
    },

    closeHelp() {
      setHelp(false);
    },

    setTurntable(on) {
      el.turntableButton.setAttribute("aria-pressed", String(on));
      el.turntableLabel.textContent = on ? "Girando" : "Girar";
    },

    toast(message, ms = 3200) {
      el.toast.textContent = message;
      el.toast.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove("is-visible"), ms);
    },

    setContextLost(lost) {
      el.contextLost.hidden = !lost;
    },
  };
}
