import { Color3, PointerEventTypes } from "@babylonjs/core";
import { PALETTE } from "../config.js";
import { isSelectableComponent } from "./components.js";
import { getContent } from "./componentContent.js";

/**
 * Seleção de componentes por clique, toque ou gatilho do controle VR.
 * O WebXR do Babylon converte o gatilho em eventos de ponteiro, então o mesmo
 * POINTERTAP atende mouse, tela de toque e Meta Quest.
 *
 * Hover (só com mouse): brilho ciano leve no componente + dica com o nome.
 * Seleção: brilho pulsante na cor do componente.
 */
export function createSelection(scene, { meshesByComponent, states, onSelect, onHover }) {
  let selected = null;
  let hovered = null;
  const white = new Color3(1, 1, 1);
  const hoverColor = Color3.FromHexString(PALETTE.cyan).toLinearSpace();
  const colorOf = (id) => Color3.FromHexString(getContent(id).color).toLinearSpace();

  const componentOf = (mesh) => {
    const e = mesh?.metadata?.evxr;
    if (!e) return null;
    const id = e.labelFor ?? (e.vehicle ? e.component : null);
    return isSelectableComponent(id) ? id : null;
  };

  const setChannel = (id, channel, color, k) => {
    for (const m of meshesByComponent.get(id) ?? []) states.setTint(m, channel, color, k);
  };

  // Por desempenho, o Babylon só testa no movimento do mouse as malhas que pedem isso.
  for (const meshes of meshesByComponent.values()) for (const m of meshes) m.enablePointerMoveEvents = true;

  scene.onPointerObservable.add((pi) => {
    if (pi.type === PointerEventTypes.POINTERTAP) {
      const id = componentOf(pi.pickInfo?.pickedMesh);
      if (id) onSelect?.(id);
    } else if (pi.type === PointerEventTypes.POINTERMOVE && pi.event?.pointerType === "mouse") {
      // Durante o arraste da câmera não há hover.
      const id = pi.event.buttons ? null : componentOf(pi.pickInfo?.pickedMesh);
      if (id !== hovered) {
        if (hovered) setChannel(hovered, "hover", hoverColor, 0);
        hovered = id;
        if (hovered) setChannel(hovered, "hover", hoverColor, 0.045);
      }
      onHover?.(hovered, pi.event.clientX, pi.event.clientY);
    }
  });

  // Pulso do componente selecionado (só as malhas dele são atualizadas).
  let pulseColor = white;
  scene.onBeforeRenderObservable.add(() => {
    if (!selected) return;
    const k = 0.2 + 0.16 * Math.sin(performance.now() / 260);
    setChannel(selected, "select", pulseColor, k);
  });

  return {
    get selected() {
      return selected;
    },
    setSelected(id) {
      if (selected) setChannel(selected, "select", white, 0);
      selected = id;
      if (id) pulseColor = colorOf(id);
    },
    clearHover() {
      if (hovered) setChannel(hovered, "hover", white, 0);
      hovered = null;
      onHover?.(null);
    },
  };
}
