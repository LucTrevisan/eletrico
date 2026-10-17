import { ENERGY_KINDS } from "../simulation/energyFlow.js";
import { ENERGY_MODES, NOTE_LABELS, SIMULATION_DISCLAIMER, STATE_LABELS } from "../simulation/energyContent.js";

const nf = (digits) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const f0 = nf(0);
const f1 = nf(1);
const f3 = nf(3);

/** Texto da potência da bateria: sinal, valor e o que ele significa. */
export function describePower(kw, state) {
  const abs = Math.abs(kw);
  if (state === "parado" || abs < 0.05) return { value: "0", hint: "" };
  const v = abs < 10 ? f1.format(abs) : f0.format(abs);
  if (kw > 0) return { value: `+${v}`, hint: state === "acelerando" ? "consumindo" : "sistemas auxiliares" };
  return { value: `−${v}`, hint: state === "recarregando" ? "recebendo da rede" : "recuperando" };
}

export function stateText(snap) {
  const base = STATE_LABELS[snap.state] ?? snap.state;
  return snap.state === "recarregando" ? `${base} (${snap.chargeType === "dc" ? "CC" : "CA"})` : base;
}

function sessionText(tab, snap) {
  if (tab === "regen") return `Energia recuperada nesta sessão: ${f3.format(snap.regenKwh)} kWh`;
  if (tab === "charge") return `Tempo acelerado durante a recarga: 1 s = 1 min · recebido: ${f1.format(snap.chargedKwh)} kWh`;
  return `Energia usada em tração nesta sessão: ${f3.format(snap.usedKwh)} kWh`;
}

/**
 * Painel "Fluxo de energia + Simulação".
 * handlers: onTab(tab), onHold(name, on), onChargeType(type), onChargeToggle(), onClose()
 */
export function createEnergyPanel(scene, handlers) {
  const desktop = createDesktopPanel(handlers);
  let vr = null;
  let vrPromise = null;
  let tab = "accel";
  let modeKey = "accel";

  return {
    showDesktop() {
      desktop.show();
    },
    hideDesktop() {
      desktop.hide();
    },
    async showVR(camera) {
      // Módulo VR (e a GUI do Babylon) só é baixado na primeira vez que o painel abre no headset.
      vrPromise ??= import("./energyPanelVR.js").then((m) => (vr = m.createEnergyPanelVR(scene, handlers)));
      await vrPromise;
      vr.setMode(tab, modeKey);
      vr.place(camera);
      vr.show();
    },
    hideVR() {
      vr?.hide();
    },
    setMode(nextTab, nextModeKey) {
      tab = nextTab;
      modeKey = nextModeKey;
      desktop.setMode(tab, modeKey);
      vr?.setMode(tab, modeKey);
    },
    update(snap) {
      desktop.update(snap, tab);
      vr?.update(snap, tab);
    },
  };
}

// ----------------------------------------------------------------------------- desktop

function createDesktopPanel(handlers) {
  const $ = (id) => document.getElementById(id);
  const el = {
    root: $("energyPanel"),
    tabs: [...document.querySelectorAll("#energyPanel [data-tab]")],
    title: $("epTitle"),
    text: $("epText"),
    chain: $("epChain"),
    speed: $("simSpeed"),
    soc: $("simSoc"),
    socBar: $("simSocBar"),
    power: $("simPower"),
    powerHint: $("simPowerHint"),
    state: $("simState"),
    note: $("simNote"),
    drive: $("epDrive"),
    charge: $("epCharge"),
    chargeTypes: [...document.querySelectorAll("#energyPanel [data-charge]")],
    chargeButton: $("btnCharge"),
    session: $("epSession"),
    disclaimer: $("epDisclaimer"),
    accel: $("btnAccel"),
    brake: $("btnBrake"),
  };
  el.disclaimer.textContent = SIMULATION_DISCLAIMER;
  $("epClose").addEventListener("click", () => handlers.onClose?.());
  // No celular o painel abre compacto (para não cobrir o carro); "Explicação" expande os textos.
  const more = $("epMore");
  more.addEventListener("click", () => {
    const open = !el.root.classList.contains("is-expanded");
    el.root.classList.toggle("is-expanded", open);
    more.setAttribute("aria-expanded", String(open));
    more.textContent = open ? "Recolher" : "Explicação";
  });
  for (const b of el.tabs) b.addEventListener("click", () => handlers.onTab?.(b.dataset.tab));
  for (const b of el.chargeTypes) b.addEventListener("click", () => handlers.onChargeType?.(b.dataset.charge));
  el.chargeButton.addEventListener("click", () => handlers.onChargeToggle?.());

  const held = { accel: false, brake: false };
  const setHold = (name, on) => {
    if (held[name] === on) return;
    held[name] = on;
    (name === "accel" ? el.accel : el.brake).setAttribute("aria-pressed", String(on));
    // Celular: enquanto pressionado, a gaveta encolhe para o carro e as rodas ficarem à vista (CSS).
    document.body.classList.toggle("energy-holding", held.accel || held.brake);
    handlers.onHold?.(name, on);
  };
  const bindHold = (btn, name) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      setHold(name, true);
    });
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) btn.addEventListener(t, () => setHold(name, false));
    btn.addEventListener("contextmenu", (e) => e.preventDefault()); // toque longo no celular
    btn.addEventListener("keydown", (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        setHold(name, true);
      }
    });
    btn.addEventListener("keyup", (e) => {
      if (e.key === " " || e.key === "Enter") setHold(name, false);
    });
  };
  bindHold(el.accel, "accel");
  bindHold(el.brake, "brake");

  // Teclado: W acelera, S freia, enquanto o painel estiver aberto (as setas giram a câmera).
  const keyMap = { w: "accel", W: "accel", s: "brake", S: "brake" };
  window.addEventListener("keydown", (e) => {
    if (el.root.hidden || e.repeat || !keyMap[e.key] || e.target.closest?.("input, textarea")) return;
    setHold(keyMap[e.key], true);
  });
  window.addEventListener("keyup", (e) => {
    if (keyMap[e.key]) setHold(keyMap[e.key], false);
  });
  window.addEventListener("blur", () => {
    setHold("accel", false);
    setHold("brake", false);
  });

  return {
    show() {
      el.root.hidden = false;
      document.body.classList.add("energy-open");
    },
    hide() {
      el.root.hidden = true;
      document.body.classList.remove("energy-open");
      setHold("accel", false);
      setHold("brake", false);
    },
    setMode(tab, modeKey) {
      const m = ENERGY_MODES[modeKey];
      for (const b of el.tabs) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
      el.title.textContent = m.title;
      el.text.textContent = m.text;
      el.chain.innerHTML = "";
      for (const step of m.chain) {
        const li = document.createElement("li");
        li.style.setProperty("--c", ENERGY_KINDS[step.kind].color);
        const b = document.createElement("b");
        b.textContent = step.label;
        li.append(b);
        if (step.note) {
          const small = document.createElement("small");
          small.textContent = step.note;
          li.append(small);
        }
        el.chain.append(li);
      }
      el.drive.hidden = tab === "charge";
      el.charge.hidden = tab !== "charge";
      const type = modeKey === "charge-dc" ? "dc" : "ac";
      for (const b of el.chargeTypes) b.setAttribute("aria-pressed", String(b.dataset.charge === type));
    },
    update(snap, tab) {
      el.speed.textContent = f0.format(snap.speedKmh);
      el.soc.textContent = f1.format(snap.soc);
      el.socBar.style.width = `${snap.soc.toFixed(1)}%`;
      el.socBar.dataset.level = snap.soc < 15 ? "low" : snap.charging ? "charging" : "ok";
      const pw = describePower(snap.powerKw, snap.state);
      el.power.textContent = pw.value;
      el.powerHint.textContent = pw.hint;
      el.state.textContent = stateText(snap);
      el.state.dataset.state = snap.state;
      el.note.textContent = snap.note ? NOTE_LABELS[snap.note] ?? "" : "";
      el.chargeButton.textContent = snap.charging ? "Encerrar recarga" : "Iniciar recarga";
      el.chargeButton.setAttribute("aria-pressed", String(snap.charging));
      for (const b of el.chargeTypes) b.disabled = snap.charging;
      el.session.textContent = sessionText(tab, snap);
    },
  };
}
