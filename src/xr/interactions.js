/**
 * Interações específicas de VR.
 *
 * Etapa 1: botões B / Y dos controles do Quest trazem o painel de controle para
 * a frente do usuário (útil depois de se teleportar para longe dele).
 * Etapa 4: seleção de componentes por raio/pinça e interações de hand tracking.
 */
const SUMMON_BUTTONS = ["b-button", "y-button"];

export function setupXRInteractions(xrApi, { onSummonMenu }) {
  const { xr } = xrApi;
  xr.input.onControllerAddedObservable.add((controller) => {
    controller.onMotionControllerInitObservable.add((motionController) => {
      for (const id of SUMMON_BUTTONS) {
        const component = motionController.getComponent(id);
        component?.onButtonStateChangedObservable.add((c) => {
          if (c.changes.pressed?.current) onSummonMenu?.(controller);
        });
      }
    });
  });
}
