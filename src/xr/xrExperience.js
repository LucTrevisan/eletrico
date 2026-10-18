// Carregado sob demanda (main.js), só quando o navegador informa suporte a VR: o código do WebXR
// (teleporte, controles, mãos) não pesa na abertura em PCs e celulares sem headset.
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
import { UtilityLayerRenderer } from "@babylonjs/core/Rendering/utilityLayerRenderer.js";
import { Color3, MeshBuilder, Quaternion, StandardMaterial, Tools } from "../babylon.js";
import { PALETTE, XR } from "../config.js";

/**
 * Cria a experiência VR com o WebXR Experience Helper do Babylon:
 *  - controles do Meta Quest com raio de seleção (gatilho);
 *  - teleporte no thumbstick (para frente: mirar; soltar: ir);
 *  - snap turn de 45° no thumbstick (esquerda/direita) e passo para trás;
 *  - rastreamento de mãos habilitado como recurso opcional (fallback: controles).
 * A interface padrão do Babylon é desativada; o botão "Entrar em VR" é o do HUD.
 */
export async function createXRExperience(scene, { floorMeshes, isBlocker, spawn, lookAt, onEnter, onExit }) {
  const xr = await WebXRDefaultExperience.CreateAsync(scene, {
    floorMeshes,
    disableDefaultUI: true,
    teleportationOptions: {
      blockerMeshesPredicate: isBlocker, // não teleporta "através" do carro ou da plataforma
      // Mãos (sem thumbstick): pinça longa apontando o piso. O atraso inicial evita que uma
      // pinça rápida de seleção dispare o teleporte.
      timeToTeleport: 1400,
      timeToTeleportStart: 250,
      defaultTargetMeshOptions: {
        teleportationFillColor: PALETTE.blue,
        teleportationBorderColor: PALETTE.cyan,
        disableLighting: true,
      },
    },
    // Raio nas duas mãos/controles: sem isso o Babylon ativa um de cada vez, e o primeiro gatilho
    // da outra mão só a "ativa" — o clique se perde.
    pointerSelectionOptions: { enablePointerSelectionOnAllControllers: true },
    // Mãos: articulações como instâncias de uma única esfera (um draw call). A malha padrão do
    // Babylon baixaria 2 GLBs + um NodeMaterial de assets.babylonjs.com a cada sessão.
    handSupportOptions: {
      handMeshes: { disableDefaultMeshes: true },
      jointMeshes: { sourceMesh: createJointMesh(scene) },
    },
    // Esfera de toque (interação próxima): material simples em vez do NodeMaterial baixado do
    // servidor de snippets do Babylon (rede + compilação a cada controle conectado).
    nearInteractionOptions: { motionControllerOrbMaterial: createOrbMaterial() },
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

  let mode = "vr";
  const api = {
    xr,
    async enter() {
      mode = "vr";
      return experience.enterXRAsync("immersive-vr", "local-floor", xr.renderTarget);
    },
    /** Realidade aumentada (passthrough/câmera). Os recursos de RA são ligados antes por xr/arMode.js. */
    async enterAR(sessionInit = {}) {
      mode = "ar";
      try {
        return await experience.enterXRAsync("immersive-ar", "local-floor", xr.renderTarget, sessionInit);
      } catch (err) {
        mode = "vr";
        throw err;
      }
    },
    /** Sessão atual (ou a última) é de realidade aumentada. */
    get isAR() {
      return mode === "ar";
    },
    /** Celular em RA: a interface HTML fica sobre a imagem da câmera (WebXR DOM Overlay). */
    get domOverlay() {
      return mode === "ar" && !!experience.sessionManager.session?.domOverlayState;
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
    /**
     * Põe a cabeça do usuário em `position` (inclusive a altura), olhando na direção `dir` — só gira
     * em torno de Y. Usado para sentar no banco do motorista e para sair do carro.
     */
    placeAt(position, dir) {
      const cam = experience.camera;
      cam.position.copyFrom(position);
      const targetYaw = Math.atan2(dir.x, dir.z);
      const currentYaw = cam.rotationQuaternion.toEulerAngles().y;
      cam.rotationQuaternion.multiplyInPlace(Quaternion.FromEulerAngles(0, targetYaw - currentYaw, 0));
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

/** Esfera-base das articulações das mãos (instanciada 25× por mão pelo Babylon). */
function createJointMesh(scene) {
  const mesh = MeshBuilder.CreateIcoSphere("xr-hand-joint", { radius: 0.5, subdivisions: 2 }, scene);
  const mat = new StandardMaterial("mat-xr-hand-joint", scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.FromHexString(PALETTE.cyan).scale(0.85);
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.isVisible = false;
  return mesh;
}

/** Material da esfera de toque; vive na camada utilitária, onde o Babylon cria essa esfera. */
function createOrbMaterial() {
  const mat = new StandardMaterial("mat-xr-touch-orb", UtilityLayerRenderer.DefaultUtilityLayer.utilityLayerScene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.FromHexString(PALETTE.cyan);
  mat.alpha = 0.55;
  return mat;
}
