import { Color3, Quaternion, Tools, WebXRState } from "@babylonjs/core";
import { PALETTE, XR } from "../config.js";

/**
 * Verifica se há suporte a VR imersivo. O botão "Entrar em VR" só aparece se `supported`.
 * Nunca lança exceção: devolve um motivo legível para exibir na interface.
 */
export async function checkVRSupport() {
  if (!window.isSecureContext) {
    return { supported: false, reason: "WebXR exige HTTPS (ou localhost)." };
  }
  if (!("xr" in navigator)) {
    return { supported: false, reason: "Este navegador não oferece WebXR." };
  }
  try {
    const ok = await navigator.xr.isSessionSupported("immersive-vr");
    return ok ? { supported: true } : { supported: false, reason: "Nenhum headset de VR disponível neste dispositivo." };
  } catch (err) {
    return { supported: false, reason: `WebXR indisponível: ${err?.message || err}` };
  }
}

/**
 * Cria a experiência VR com o WebXR Experience Helper do Babylon:
 *  - controles do Meta Quest com raio de seleção (gatilho);
 *  - teleporte no thumbstick (para frente: mirar; soltar: ir);
 *  - snap turn de 45° no thumbstick (esquerda/direita) e passo para trás;
 *  - rastreamento de mãos habilitado como recurso opcional (fallback: controles).
 * A interface padrão do Babylon é desativada; o botão "Entrar em VR" é o do HUD.
 */
export async function createXRExperience(scene, { floorMeshes, isBlocker, spawn, lookAt, onEnter, onExit }) {
  const xr = await scene.createDefaultXRExperienceAsync({
    floorMeshes,
    disableDefaultUI: true,
    teleportationOptions: {
      blockerMeshesPredicate: isBlocker, // não teleporta "através" do carro ou da plataforma
      defaultTargetMeshOptions: {
        teleportationFillColor: PALETTE.blue,
        teleportationBorderColor: PALETTE.cyan,
        disableLighting: true,
      },
    },
  });
  if (!xr.baseExperience) throw new Error("Não foi possível inicializar o WebXR.");

  const teleport = xr.teleportation;
  if (teleport) {
    teleport.rotationEnabled = true;
    teleport.rotationAngle = Tools.ToRadians(XR.snapTurnDeg);
    teleport.backwardsMovementEnabled = true;
  }
  if (xr.pointerSelection) {
    xr.pointerSelection.laserPointerDefaultColor = Color3.FromHexString(PALETTE.blue);
    xr.pointerSelection.laserPointerPickedColor = Color3.FromHexString(PALETTE.cyan);
    xr.pointerSelection.selectionMeshDefaultColor = Color3.FromHexString(PALETTE.cyan);
  }

  const experience = xr.baseExperience;

  // Primeira pose: coloca o usuário no ponto de partida, olhando para o carro.
  // A altura (y) fica em 0 — o Babylon soma a altura real do usuário (local-floor).
  experience.onInitialXRPoseSetObservable.add((camera) => {
    camera.position.x = spawn.x;
    camera.position.z = spawn.z;
    const d = lookAt.subtract(spawn);
    Quaternion.FromEulerAnglesToRef(0, Math.atan2(d.x, d.z), 0, camera.rotationQuaternion);
  });

  experience.onStateChangedObservable.add((state) => {
    if (state === WebXRState.IN_XR) {
      const sm = experience.sessionManager;
      try {
        if (sm.isFixedFoveationSupported) sm.fixedFoveation = XR.fixedFoveation;
      } catch {
        /* foveação é opcional */
      }
      onEnter?.(api);
    } else if (state === WebXRState.NOT_IN_XR) {
      onExit?.(api);
    }
  });

  const api = {
    xr,
    async enter() {
      return experience.enterXRAsync("immersive-vr", "local-floor", xr.renderTarget);
    },
    async exit() {
      if (experience.state === WebXRState.IN_XR) await experience.exitXRAsync();
    },
    get inXR() {
      return experience.state === WebXRState.IN_XR;
    },
    get camera() {
      return experience.camera;
    },
    /** Leva o usuário de volta ao ponto de partida, de frente para o carro (só gira em torno de Y). */
    returnToSpawn() {
      const cam = experience.camera;
      cam.position.x = spawn.x;
      cam.position.z = spawn.z;
      const d = lookAt.subtract(spawn);
      const targetYaw = Math.atan2(d.x, d.z);
      const currentYaw = cam.rotationQuaternion.toEulerAngles().y;
      cam.rotationQuaternion.multiplyInPlace(Quaternion.FromEulerAngles(0, targetYaw - currentYaw, 0));
    },
  };
  return api;
}
