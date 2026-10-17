import { URL_PARAMS } from "../config.js";

/**
 * Perfis de qualidade. O perfil é escolhido pelo tipo de dispositivo e pode ser
 * reduzido automaticamente se o FPS cair (ver `createAdaptiveQuality`).
 * Em VR, espelho e glow são sempre desligados (ver xr/xrExperience.js).
 */
const PRESETS = {
  high: {
    id: "high",
    label: "Alta",
    maxDevicePixelRatio: 2,
    mirror: true,
    mirrorSize: 1024,
    shadows: true,
    shadowMapSize: 2048,
    glow: true,
    glowBlur: 48,
    fillLight: true,
  },
  medium: {
    id: "medium",
    label: "Média",
    maxDevicePixelRatio: 1.5,
    mirror: false,
    mirrorSize: 512,
    shadows: false,
    shadowMapSize: 1024,
    glow: true,
    glowBlur: 24,
    fillLight: true,
  },
  low: {
    id: "low",
    label: "Leve",
    maxDevicePixelRatio: 1,
    mirror: false,
    mirrorSize: 512,
    shadows: false,
    shadowMapSize: 512,
    glow: false,
    glowBlur: 16,
    fillLight: false,
  },
};

export const QUALITY_ORDER = ["low", "medium", "high"];

export function isMetaQuestBrowser() {
  return /OculusBrowser|Quest/i.test(navigator.userAgent);
}

export function isMobileDevice() {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (coarse && Math.min(screen.width, screen.height) < 900);
}

/** Retorna uma cópia do perfil adequado ao dispositivo (ou forçado por ?q=). */
export function detectQuality() {
  const forced = URL_PARAMS.get("q");
  if (forced && PRESETS[forced]) return { ...PRESETS[forced], forced: true };
  if (isMetaQuestBrowser()) return { ...PRESETS.low };
  if (isMobileDevice()) return { ...PRESETS.medium };
  return { ...PRESETS.high };
}

export function getPreset(id) {
  return { ...PRESETS[id] };
}

/**
 * Mede o FPS por alguns segundos e rebaixa o perfil se ficar abaixo do limite.
 * `apply(preset)` recebe o novo perfil; quem chama decide o que desligar.
 */
export function createAdaptiveQuality(engine, current, apply) {
  let samples = [];
  let timer = null;
  let paused = false;

  const thresholds = { high: 45, medium: 30 };

  function sample() {
    if (paused || document.hidden) return;
    samples.push(engine.getFps());
    if (samples.length < 8) return;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    samples = [];
    const limit = thresholds[current.id];
    if (limit && avg < limit && !current.forced) {
      const next = QUALITY_ORDER[QUALITY_ORDER.indexOf(current.id) - 1];
      if (next) {
        current = getPreset(next);
        apply(current, avg);
      }
    }
  }

  return {
    start(delayMs = 2500) {
      setTimeout(() => {
        timer = setInterval(sample, 500);
      }, delayMs);
    },
    /** Pausa durante a sessão VR: o FPS do canvas 2D não representa o headset. */
    pause() {
      paused = true;
      samples = [];
    },
    resume() {
      paused = false;
    },
    stop() {
      clearInterval(timer);
    },
    get current() {
      return current;
    },
  };
}
