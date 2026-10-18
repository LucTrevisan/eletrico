// Carregado sob demanda (main.js), só em navegadores com suporte a "immersive-ar".
import { Color3, Color4, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from "../babylon.js";
import { PALETTE } from "../config.js";
import { AdvancedDynamicTexture, Button } from "../ui/gui.js";

/** Escala da maquete (1:4 ≈ 1,2 m de comprimento: cabe no chão da sala ou numa mesa grande). */
export const AR_MODEL_SCALE = 0.25;
/** Direção (local do carro) de quem olha a vista inicial: frente-esquerda, como no showroom. */
const HERO_DIR = new Vector3(-0.58, 0, 0.81).normalize();
const FALLBACK_MS = 2500;

/**
 * REALIDADE AUMENTADA — o carro no ambiente real (Quest com passthrough, celular Android com ARCore).
 *
 *  1. Ao entrar, o showroom some (fica só o carro e a sombra de contato) e um retículo com a pegada
 *     do carro acompanha o chão detectado (hit-test). Sem detecção (Quest sem mapeamento da sala),
 *     o retículo vai para o piso (y = 0 do "local-floor") à frente do usuário.
 *  2. Um toque na tela (celular), gatilho ou pinça (Quest) posiciona o carro, de frente-esquerda
 *     para o usuário — o mesmo ângulo da vista inicial. Depois é só andar ao redor dele.
 *  3. Raio X, energia, vista explodida, portas e seleção de peças funcionam como no VR; "Reposicionar"
 *     volta ao passo 1 e "Maquete" alterna entre tamanho real e 1:4.
 *
 * O prato giratório (TransformNode pai do carro, das peças ilustrativas, do fluxo de energia e das
 * legendas 3D) é que é posicionado: tudo acompanha sem tocar no código de cada recurso.
 * Hit-test e DOM Overlay são pedidos só na abertura da sessão de RA (recursos opcionais: sem eles a
 * sessão abre mesmo assim) — a sessão VR continua exatamente como antes. O hit-test é lido direto da
 * API WebXR, com tratamento de erro. O teleporte não é usado em RA (anda-se de verdade).
 */
export function createARMode(scene, { xrApi, turntable, dims, hiddenMeshes, overlayRoot, vrMenu, onPlacedChange, onScaleChange, onStatus }) {
  const xr = xrApi.xr;
  const sessionManager = xr.baseExperience.sessionManager;

  let active = false;
  let placing = false;
  let placed = false;
  let scale = 1;
  let hitSource = null;
  let lastHitAt = 0;
  let enteredAt = 0;
  let saved = null;
  let onSelect = null;
  let placedFrame = -1; // o mesmo toque/gatilho que posiciona não deve "clicar" no carro ao ser solto
  const reticle = createReticle(scene, dims);
  const scaleButton = vrMenu ? createScaleButton(scene, vrMenu.mesh, () => setScale(scale === 1 ? AR_MODEL_SCALE : 1)) : null;

  // ---------------------------------------------------------------- recursos só da RA
  // Teleporte fora da RA: o Babylon não o reconecta nesta sessão (volta ao normal na próxima VR).
  const setTeleportBlocked = (on) => xr.teleportation && (xr.teleportation.disableAutoAttach = on);

  /** Hit-test a partir do centro da visão (celular: centro da tela; Quest: direção do olhar). */
  async function startHitTest() {
    const session = sessionManager.session;
    if (!session?.requestHitTestSource) return;
    try {
      const viewer = await session.requestReferenceSpace("viewer");
      hitSource = await session.requestHitTestSource({ space: viewer });
    } catch (err) {
      hitSource = null; // sem detecção de superfícies: o retículo usa o piso à frente do usuário
      console.info("[EV XR] RA sem hit-test:", err?.message || err);
    }
  }

  sessionManager.onXRFrameObservable.add((frame) => {
    if (!active || !placing || !hitSource) return;
    const results = frame.getHitTestResults(hitSource);
    const pose = results.length && results[0].getPose(sessionManager.referenceSpace);
    if (!pose) return;
    const p = pose.transform.position;
    // WebXR é destro; a cena do Babylon é canhota (z invertido).
    reticle.root.position.set(p.x, p.y, scene.useRightHandedSystem ? p.z : -p.z);
    reticle.root.setEnabled(true);
    if (!lastHitAt) onStatus?.(xrApi.domOverlay ? "Toque na tela para posicionar o carro." : "Aperte o gatilho (ou faça a pinça) para posicionar o carro.");
    lastHitAt = performance.now();
  });

  // Toques nos botões da sobreposição não viram "select" na cena (não posicionam o carro sem querer).
  overlayRoot.addEventListener("beforexrselect", (e) => {
    if (active && e.target?.closest?.("button, .sheet, .ar-bar, .toast")) e.preventDefault();
  });

  // ---------------------------------------------------------------- retículo
  scene.onBeforeRenderObservable.add(() => {
    if (!active || !placing) return;
    const now = performance.now();
    // Sem resultado do hit-test por um tempo (headset sem mapeamento): piso à frente do usuário.
    if (now - lastHitAt > FALLBACK_MS && now - enteredAt > FALLBACK_MS && !xrApi.domOverlay) {
      const cam = xrApi.camera;
      const fwd = cam.getDirection(Vector3.Forward());
      fwd.y = 0;
      if (fwd.lengthSquared() < 1e-4) fwd.set(0, 0, 1);
      fwd.normalize();
      const dist = scale === 1 ? Math.max(2.6, dims.length * 0.62) : 1.2;
      reticle.root.position.set(cam.position.x + fwd.x * dist, 0, cam.position.z + fwd.z * dist);
      if (!reticle.root.isEnabled()) onStatus?.("Aperte o gatilho (ou faça a pinça) para posicionar o carro.");
      reticle.root.setEnabled(true);
    }
    if (reticle.root.isEnabled()) faceUser(reticle.root);
  });

  /** Gira o nó para que o carro mostre a frente-esquerda a quem está no ponto de vista atual. */
  function faceUser(node) {
    const cam = xrApi.camera.position;
    const d = new Vector3(cam.x - node.position.x, 0, cam.z - node.position.z);
    if (d.lengthSquared() < 1e-4) return;
    node.rotation.y = Math.atan2(d.x, d.z) - Math.atan2(HERO_DIR.x, HERO_DIR.z);
  }

  // ---------------------------------------------------------------- posicionar
  function startPlacing() {
    placing = true;
    placed = false;
    turntable.setEnabled(false);
    reticle.root.setEnabled(false);
    reticle.setScale(scale);
    lastHitAt = 0;
    onPlacedChange?.(false);
    onStatus?.(xrApi.domOverlay ? "Aponte a câmera para o chão e mova o celular devagar…" : "Olhe para o chão onde o carro vai ficar…");
  }

  function place() {
    if (!placing || !reticle.root.isEnabled()) return;
    placing = false;
    placed = true;
    turntable.position.copyFrom(reticle.root.position);
    turntable.rotation.y = reticle.root.rotation.y;
    turntable.scaling.setAll(scale);
    turntable.setEnabled(true);
    reticle.root.setEnabled(false);
    placedFrame = scene.getFrameId();
    onPlacedChange?.(true, turntable.rotation.y);
    onStatus?.("Ande ao redor do carro · toque numa peça para saber mais.");
  }

  function setScale(k) {
    scale = k;
    reticle.setScale(k);
    if (placed) turntable.scaling.setAll(k);
    scaleButton?.setLabel(k === 1 ? "Ver como maquete (1:4)" : "Ver em tamanho real");
    onScaleChange?.(k);
  }

  // ---------------------------------------------------------------- sessão
  function onEnter() {
    active = true;
    enteredAt = performance.now();
    saved = {
      clear: scene.clearColor.clone(),
      fog: scene.fogEnabled,
      position: turntable.position.clone(),
      rotationY: turntable.rotation.y,
      enabled: hiddenMeshes.map((m) => [m, m.isEnabled(false)]), // só o próprio estado (sem os pais)
    };
    // A imagem real aparece por trás: fundo transparente, sem neblina do showroom.
    scene.clearColor = new Color4(0, 0, 0, 0);
    scene.fogEnabled = false;
    for (const m of hiddenMeshes) m.setEnabled(false);
    startHitTest();
    onSelect = (e) => {
      if (!placing) return;
      // Gatilho apontado para o painel 3D aciona o botão, não posiciona o carro.
      const ctrl = xr.input.controllers.find((c) => c.inputSource === e.inputSource);
      const under = ctrl && xr.pointerSelection?.getMeshUnderPointer(ctrl.uniqueId);
      if (under && (under === vrMenu?.mesh || under === scaleButton?.mesh)) return;
      place();
    };
    sessionManager.session?.addEventListener("select", onSelect);
    if (vrMenu) {
      if (xrApi.domOverlay) vrMenu.hide();
      else vrMenu.setARMode(true);
    }
    scaleButton?.setEnabled(!xrApi.domOverlay);
    setScale(scale);
    startPlacing();
  }

  function onExit() {
    if (!active) return;
    active = false;
    placing = false;
    placed = false;
    sessionManager.session?.removeEventListener("select", onSelect);
    reticle.root.setEnabled(false);
    scaleButton?.setEnabled(false);
    vrMenu?.setARMode(false);
    scene.clearColor = saved.clear;
    scene.fogEnabled = saved.fog;
    for (const [m, on] of saved.enabled) m.setEnabled(on);
    turntable.position.copyFrom(saved.position);
    turntable.rotation.y = 0; // o showroom volta alinhado (o giro da plataforma recomeça daqui)
    turntable.scaling.setAll(1);
    turntable.setEnabled(true);
    hitSource?.cancel?.();
    hitSource = null;
    setTeleportBlocked(false);
    onPlacedChange?.(false);
  }

  return {
    /** Liga os recursos de RA e abre a sessão. */
    async enter() {
      setTeleportBlocked(true);
      try {
        // Opcionais: sem suporte, a sessão abre mesmo assim (Quest não tem DOM Overlay).
        await xrApi.enterAR({ optionalFeatures: ["hit-test", "dom-overlay"], domOverlay: { root: overlayRoot } });
      } catch (err) {
        setTeleportBlocked(false);
        throw err;
      }
    },
    onEnter,
    onExit,
    reposition: () => active && startPlacing(),
    /** true (uma vez) para o clique que vem do mesmo toque que posicionou o carro. */
    consumePlacementTap() {
      if (placedFrame < 0) return false;
      // O "soltar" do mesmo toque chega em poucos quadros (contados, não medidos em tempo).
      const recent = scene.getFrameId() - placedFrame <= 4;
      placedFrame = -1;
      return recent;
    },
    toggleScale: () => setScale(scale === 1 ? AR_MODEL_SCALE : 1),
    get active() {
      return active;
    },
    get placed() {
      return placed;
    },
    get scale() {
      return scale;
    },
  };
}

/** Retículo: anel no chão + pegada do carro (retângulo do tamanho dele) + seta da frente. */
function createReticle(scene, dims) {
  const root = new TransformNode("ar-reticle", scene);
  const mat = new StandardMaterial("mat-ar-reticle", scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.FromHexString(PALETTE.cyan);
  const ring = MeshBuilder.CreateTorus("ar-reticle-ring", { diameter: 0.36, thickness: 0.02, tessellation: 40 }, scene);
  ring.material = mat;
  ring.parent = root;
  const w = dims.width / 2;
  const l = dims.length / 2;
  const footprint = MeshBuilder.CreateLines(
    "ar-reticle-footprint",
    { points: [new Vector3(-w, 0.005, -l), new Vector3(w, 0.005, -l), new Vector3(w, 0.005, l), new Vector3(-w, 0.005, l), new Vector3(-w, 0.005, -l)] },
    scene,
  );
  footprint.color = Color3.FromHexString(PALETTE.cyan);
  footprint.parent = root;
  const arrow = MeshBuilder.CreateLines(
    "ar-reticle-front",
    { points: [new Vector3(-w * 0.5, 0.005, l * 0.72), new Vector3(0, 0.005, l * 0.95), new Vector3(w * 0.5, 0.005, l * 0.72)] },
    scene,
  );
  arrow.color = Color3.FromHexString(PALETTE.orange);
  arrow.parent = root;
  // Pegada e seta seguem a escala do carro; o anel fica com o mesmo tamanho (alvo do toque).
  const scaled = new TransformNode("ar-reticle-scaled", scene);
  scaled.parent = root;
  footprint.parent = scaled;
  arrow.parent = scaled;
  for (const m of [ring, footprint, arrow]) m.isPickable = false;
  root.setEnabled(false);
  return { root, setScale: (k) => scaled.scaling.setAll(k) };
}

/** Quest (sem sobreposição HTML): botão 3D logo abaixo do painel de controle para alternar a escala. */
function createScaleButton(scene, menuMesh, onClick) {
  const width = 0.42;
  const height = 0.075;
  const plane = MeshBuilder.CreatePlane("vr-ar-scale", { width, height }, scene);
  plane.parent = menuMesh;
  const menuH = menuMesh.getBoundingInfo().boundingBox.extendSize.y * 2;
  plane.position.set(0, -menuH / 2 - height / 2 - 0.02, 0);
  plane.setEnabled(false);
  const ui = AdvancedDynamicTexture.CreateForMesh(plane, 640, Math.round((640 * height) / width));
  const b = Button.CreateSimpleButton("vr-ar-scale-btn", "Ver como maquete (1:4)");
  b.cornerRadius = 30;
  b.thickness = 3;
  b.color = PALETTE.orange;
  b.background = "rgba(8, 17, 31, 0.88)";
  b.fontFamily = "'Segoe UI', Roboto, Arial, sans-serif";
  b.fontSize = 44;
  b.fontWeight = "600";
  if (b.textBlock) b.textBlock.color = PALETTE.text;
  b.onPointerEnterObservable.add(() => (b.background = "rgba(255, 159, 67, 0.25)"));
  b.onPointerOutObservable.add(() => (b.background = "rgba(8, 17, 31, 0.88)"));
  b.onPointerUpObservable.add(() => onClick());
  ui.addControl(b);
  return {
    mesh: plane,
    setEnabled: (on) => plane.setEnabled(on),
    setLabel: (t) => b.textBlock && (b.textBlock.text = t),
  };
}
