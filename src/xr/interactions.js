import { Color3, DynamicTexture, Mesh, MeshBuilder, PointerEventTypes, StandardMaterial, Vector3 } from "../babylon.js";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager.js";
import { WebXRHandJoint } from "@babylonjs/core/XR/features/WebXRHandTracking.js";
import { PALETTE } from "../config.js";

/**
 * Interações específicas de VR.
 *
 * Controles (Meta Quest Touch): botões B / Y trazem o painel de controle para perto.
 * Mãos (hand tracking, quando disponível):
 *   - pinça rápida = selecionar (raio) · tocar com o indicador = selecionar (componentes internos e legendas);
 *   - pinça longa apontando o piso = teleporte (configurado em xrExperience.js);
 *   - olhar para o pulso esquerdo mostra um botão "MENU" (pinça ou toque) que traz o painel de controle.
 * Sem hand tracking, tudo continua funcionando com os controles (fallback automático).
 */
const SUMMON_BUTTONS = ["b-button", "y-button"];

export function setupXRInteractions(xrApi, { onSummonMenu, onInputModeChange }) {
  const { xr } = xrApi;
  const scene = xr.baseExperience.camera.getScene();

  // ------------------------------------------------------------ controles
  const sources = new Map(); // uniqueId → "hands" | "controllers"
  const reportMode = () => {
    const kinds = new Set(sources.values());
    onInputModeChange?.(kinds.has("hands") && !kinds.has("controllers") ? "hands" : "controllers");
  };
  xr.input.onControllerAddedObservable.add((controller) => {
    sources.set(controller.uniqueId, controller.inputSource.hand ? "hands" : "controllers");
    reportMode();
    controller.onMotionControllerInitObservable.add((motionController) => {
      for (const id of SUMMON_BUTTONS) {
        const component = motionController.getComponent(id);
        component?.onButtonStateChangedObservable.add((c) => {
          if (c.changes.pressed?.current) onSummonMenu?.();
        });
      }
    });
  });
  xr.input.onControllerRemovedObservable.add((controller) => {
    sources.delete(controller.uniqueId);
    reportMode();
  });

  // ------------------------------------------------------------ mãos: menu de pulso
  const hands = xr.baseExperience.featuresManager.getEnabledFeature(WebXRFeatureName.HAND_TRACKING);
  if (!hands) return;
  const button = createWristButton(scene);
  let leftHand = null;
  hands.onHandAddedObservable.add((hand) => {
    if (hand.xrController.inputSource.handedness === "left") leftHand = hand;
  });
  hands.onHandRemovedObservable.add((hand) => {
    if (hand === leftHand) {
      leftHand = null;
      button.setEnabled(false);
    }
  });

  const toHead = new Vector3();
  scene.onBeforeRenderObservable.add(() => {
    if (!leftHand || !xrApi.inXR) return;
    const wrist = leftHand.getJointMesh(WebXRHandJoint.WRIST);
    const head = xr.baseExperience.camera.globalPosition;
    if (!wrist) return;
    const w = wrist.getAbsolutePosition();
    head.subtractToRef(w, toHead);
    // "Olhar para o pulso": mão levantada e próxima do rosto.
    const visible = toHead.length() < 0.62 && w.y > head.y - 0.48;
    button.setEnabled(visible);
    if (visible) {
      toHead.normalize();
      button.position.copyFrom(w).addInPlace(toHead.scale(0.05)).addInPlace(new Vector3(0, 0.06, 0));
    }
  });
  scene.onPointerObservable.add((pi) => {
    if (pi.type === PointerEventTypes.POINTERTAP && pi.pickInfo?.pickedMesh === button) onSummonMenu?.();
  });
}

function createWristButton(scene) {
  const tex = new DynamicTexture("tex-wrist-menu", { width: 256, height: 128 }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = "rgba(8, 17, 31, 0.92)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(6, 6, 244, 116, 58);
  else ctx.rect(6, 6, 244, 116);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = PALETTE.cyan;
  ctx.stroke();
  ctx.fillStyle = PALETTE.cyan;
  ctx.font = "700 52px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("MENU", 128, 68);
  tex.update();
  const mat = new StandardMaterial("mat-wrist-menu", scene);
  mat.disableLighting = true;
  mat.diffuseColor = Color3.Black();
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.fogEnabled = false;
  const plane = MeshBuilder.CreatePlane("wrist-menu", { width: 0.09, height: 0.045 }, scene);
  plane.material = mat;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.renderingGroupId = 1;
  plane.isNearPickable = true; // toque com o indicador da outra mão
  plane.metadata = { evxr: { wristMenu: true } };
  plane.setEnabled(false);
  return plane;
}
