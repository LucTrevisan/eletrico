/**
 * SIMULAÇÃO EDUCATIVA do trem de força (sem dependência de Babylon — testável isoladamente).
 *
 * Modelo longitudinal simples: força de tração limitada por aderência e potência,
 * resistências de rolamento e aerodinâmica, regeneração limitada por potência,
 * velocidade e estado de carga, e recarga CA/CC (CC com redução de potência perto
 * da carga completa). Os números vêm de SIMULATION (config.js) e são demonstrativos.
 *
 * Convenção de potência da BATERIA: positiva = consumindo; negativa = recebendo energia.
 *
 * Estados: "parado" | "acelerando" | "movimento" | "regenerando" | "recarregando"
 */
const G = 9.81;
const AIR = 1.2;

export function createVehicleSimulation(params) {
  const p = { ...params };
  const s = {
    speed: 0, // m/s
    soc: p.initialSoc, // %
    powerKw: 0,
    state: "parado",
    chargeType: "ac", // "ac" | "dc"
    charging: false,
    note: null, // aviso curto para a interface
    regenKwh: 0, // energia recuperada na sessão
    usedKwh: 0, // energia consumida em tração na sessão
    chargedKwh: 0,
  };
  const input = { accel: false, brake: false };

  const kwhToSoc = (kwh) => (kwh / p.batteryKwh) * 100;

  function dcChargeKw(soc) {
    // Pico até 50%, redução gradual até ~20% do pico em 95%, depois quase nada.
    if (soc < 50) return p.dcKw;
    if (soc < 95) return p.dcKw * (1 - ((soc - 50) / 45) * 0.8);
    return p.dcKw * 0.2 * Math.max(0, (100 - soc) / 5);
  }
  function acChargeKw(soc) {
    return soc < 98 ? p.acKw : p.acKw * Math.max(0, (100 - soc) / 2);
  }

  function step(dtReal) {
    const dt = Math.min(dtReal, 0.1);
    s.note = null;

    // ------------------------------------------------------------ recarga
    if (s.charging) {
      s.speed = 0;
      const kw = s.chargeType === "dc" ? dcChargeKw(s.soc) : acChargeKw(s.soc);
      const kwh = (kw * dt * p.chargeTimeScale) / 3600;
      s.soc = Math.min(100, s.soc + kwhToSoc(kwh));
      s.chargedKwh += kwh;
      s.powerKw = -kw;
      s.state = "recarregando";
      if (s.chargeType === "dc" && s.soc >= 50 && s.soc < 99.9) s.note = "potencia-reduzida-perto-do-fim";
      if (s.soc >= 99.95) {
        s.soc = 100;
        s.charging = false;
        s.powerKw = 0;
        s.state = "parado";
        s.note = "bateria-cheia";
      }
      return snapshot();
    }

    // ------------------------------------------------------------ condução
    const v = s.speed;
    const resist = p.rollingCoef * p.massKg * G * (v > 0.05 ? 1 : 0) + 0.5 * AIR * p.dragAreaM2 * v * v;
    let tractionForce = 0;
    let batteryKw = p.auxKw;
    let regenKw = 0;
    let state = v > 0.05 ? "movimento" : "parado";

    if (input.accel && s.soc > 0) {
      const lowSoc = s.soc < p.lowSoc;
      const maxKw = p.maxPowerKw * (lowSoc ? 0.3 : 1);
      if (lowSoc) s.note = "carga-baixa";
      const wheelKw = maxKw * p.driveEfficiency;
      tractionForce = Math.min(p.massKg * p.maxAccel, (wheelKw * 1000) / Math.max(v, 1));
      if (v * 3.6 >= p.maxSpeedKmh) tractionForce = Math.min(tractionForce, resist);
      batteryKw += (tractionForce * Math.max(v, 0.5)) / 1000 / p.driveEfficiency;
      state = "acelerando";
    } else if (input.brake && v > 0.05) {
      const brakeForce = p.massKg * p.brakeDecel;
      const kmh = v * 3.6;
      // Regeneração: limitada pela potência máxima, desaparece em baixa velocidade
      // e é reduzida com a bateria quase cheia. O freio a disco cobre o restante.
      const speedFactor = Math.min(1, Math.max(0, (kmh - p.regenMinKmh) / 12));
      const socFactor = s.soc <= p.regenSocLimit ? 1 : Math.max(0, (100 - s.soc) / (100 - p.regenSocLimit));
      regenKw = Math.min((brakeForce * v * p.regenEfficiency) / 1000, p.maxRegenKw) * speedFactor * socFactor;
      tractionForce = -brakeForce;
      batteryKw -= regenKw;
      state = regenKw > 0.5 ? "regenerando" : "movimento";
      if (socFactor < 1) s.note = "regeneracao-limitada-bateria-cheia";
      else if (speedFactor < 1) s.note = "freio-a-disco-completa";
      else if (regenKw >= p.maxRegenKw - 0.5) s.note = "freio-a-disco-complementa";
    }

    const accel = (tractionForce - resist) / p.massKg;
    s.speed = Math.max(0, Math.min(p.maxSpeedKmh / 3.6, v + accel * dt));
    if (s.speed < 0.05 && !input.accel) s.speed = 0;
    if (s.speed === 0 && state !== "acelerando") state = "parado";

    const kwh = (batteryKw * dt) / 3600;
    s.soc = Math.max(0, Math.min(100, s.soc - kwhToSoc(kwh)));
    if (regenKw > 0) s.regenKwh += (regenKw * dt) / 3600;
    if (state === "acelerando") s.usedKwh += (Math.max(0, batteryKw) * dt) / 3600;
    s.powerKw = state === "parado" ? 0 : batteryKw;
    s.state = state;
    if (s.soc <= 0) s.note = "bateria-vazia";
    return snapshot();
  }

  function snapshot() {
    return {
      speedKmh: s.speed * 3.6,
      soc: s.soc,
      powerKw: s.powerKw,
      state: s.state,
      charging: s.charging,
      chargeType: s.chargeType,
      note: s.note,
      regenKwh: s.regenKwh,
      usedKwh: s.usedKwh,
      chargedKwh: s.chargedKwh,
      /** 0–1, para a intensidade da animação do fluxo de energia. */
      intensity:
        s.state === "acelerando"
          ? Math.min(1, Math.max(0.15, s.powerKw / p.maxPowerKw))
          : s.state === "regenerando"
            ? Math.min(1, Math.max(0.15, -s.powerKw / p.maxRegenKw))
            : s.state === "recarregando"
              ? Math.min(1, Math.max(0.3, -s.powerKw / p.dcKw))
              : 0,
    };
  }

  return {
    step,
    snapshot,
    params: p,
    setInput(name, on) {
      input[name] = !!on;
      if (on && s.charging) s.charging = false; // pedal encerra a recarga
    },
    releaseInputs() {
      input.accel = input.brake = false;
    },
    /** Inicia a recarga; só é permitido com o veículo parado (prevenção de erros). */
    startCharging(type = s.chargeType) {
      if (s.speed > 0.05) return { ok: false, reason: "em-movimento" };
      if (s.soc >= 99.95) return { ok: false, reason: "bateria-cheia" };
      s.chargeType = type;
      s.charging = true;
      input.accel = input.brake = false;
      return { ok: true };
    },
    stopCharging() {
      s.charging = false;
      s.state = "parado";
      s.powerKw = 0;
    },
    setChargeType(type) {
      s.chargeType = type;
    },
    /** Demonstração: coloca o veículo em uma velocidade (ex.: para treinar a frenagem). */
    setSpeedKmh(kmh) {
      s.charging = false;
      s.speed = Math.max(0, kmh / 3.6);
      s.state = s.speed > 0 ? "movimento" : "parado";
    },
    reset() {
      Object.assign(s, { speed: 0, soc: p.initialSoc, powerKw: 0, state: "parado", charging: false, regenKwh: 0, usedKwh: 0, chargedKwh: 0 });
    },
  };
}
