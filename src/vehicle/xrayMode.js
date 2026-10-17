import { Color3 } from "../babylon.js";
import { PALETTE } from "../config.js";
import { easeInOutCubic, tween } from "../scene/presentation.js";

/**
 * RAIO X: a carroceria fica semitransparente e os componentes internos aparecem,
 * com bateria em azul, motor em ciano e inversor em laranja, mais legendas com linhas.
 * A transição é contínua (fator k de 0 a 1) e pode ser revertida a qualquer momento.
 */

/** Opacidade final (fração da original) das peças que "somem" no raio X. */
const GHOST = { carroceria: 0.2, portas: 0.2, vidros: 0.12, interior: 0.3, chassi: 0.4 };
/** Tom holográfico das peças translúcidas: mantém a silhueta legível contra o fundo escuro. */
const GHOST_TINT = { color: PALETTE.cyan, k: 0.1 };

/** Destaques pedidos: bateria azul, motor ciano, inversor laranja. */
const HIGHLIGHT = {
  bateria: { color: PALETTE.blue, k: 0.7 },
  motor: { color: PALETTE.cyan, k: 0.7 },
  inversor: { color: PALETTE.orange, k: 0.75 },
};
/** Demais componentes internos: brilho leve, só para leitura dentro da carroceria escura. */
const SOFT = { color: "#FFFFFF", k: 0.06 };

const lin = (hex) => Color3.FromHexString(hex).toLinearSpace();

export function createXRayMode(scene, { meshes, states, internal, labels, schematics, onChange }) {
  const highlight = Object.fromEntries(Object.entries(HIGHLIGHT).map(([id, h]) => [id, { color: lin(h.color), k: h.k }]));
  const soft = { color: lin(SOFT.color), k: SOFT.k };
  const ghostTint = { color: lin(GHOST_TINT.color), k: GHOST_TINT.k };
  const internalSet = new Set(internal);
  let on = false;
  let k = 0;
  let active = null;

  function apply(value) {
    k = value;
    for (const mesh of meshes) {
      const id = mesh.metadata?.evxr?.component;
      if (GHOST[id] != null) states.setFade(mesh, 1 + (GHOST[id] - 1) * k);
      const h = highlight[id] ?? (internalSet.has(id) ? soft : GHOST[id] != null ? ghostTint : null);
      if (h) states.setTint(mesh, "xray", h.color, h.k * k);
    }
    labels?.setVisibility(k);
    schematics?.setVisibility(k);
  }

  function set(next, { duration = 950 } = {}) {
    next = !!next;
    if (next === on) return;
    on = next;
    active?.cancel();
    // Com o raio X ligado, o clique atravessa a carroceria e alcança os componentes internos.
    for (const mesh of meshes) {
      const id = mesh.metadata?.evxr?.component;
      if (GHOST[id] != null && id !== "vidros") mesh.isPickable = !on;
    }
    const from = k;
    const to = on ? 1 : 0;
    active = tween(scene, {
      duration: Math.max(60, duration * Math.abs(to - from)),
      ease: easeInOutCubic,
      onUpdate: (t) => apply(from + (to - from) * t),
    });
    onChange?.(on);
  }

  return {
    set,
    toggle: () => set(!on),
    get on() {
      return on;
    },
  };
}
