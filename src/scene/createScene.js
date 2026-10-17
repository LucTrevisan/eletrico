import {
  ArcRotateCamera,
  Color3,
  Color4,
  CubeTexture,
  Engine,
  ImageProcessingConfiguration,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { PALETTE, SHOWROOM } from "../config.js";
import { easeInOutCubic, tween } from "./presentation.js";

/**
 * Cria o motor WebGL. A resolução interna é limitada pelo perfil de qualidade
 * (um celular com DPR 3 renderizaria 9× mais pixels sem ganho visível).
 */
export function createEngine(canvas, quality, { onContextLost, onContextRestored } = {}) {
  const engine = new Engine(
    canvas,
    true,
    {
      stencil: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    },
    false,
  );
  applyResolution(engine, quality);

  // Perda de contexto WebGL (comum em GPUs móveis e no Quest ao trocar de app):
  // o Babylon recria os recursos sozinho; aqui só informamos o usuário.
  engine.onContextLostObservable.add(() => onContextLost?.());
  engine.onContextRestoredObservable.add(() => onContextRestored?.());

  window.addEventListener("resize", () => engine.resize());
  return engine;
}

export function applyResolution(engine, quality) {
  const dpr = Math.min(window.devicePixelRatio || 1, quality.maxDevicePixelRatio);
  engine.setHardwareScalingLevel(1 / dpr);
}

export function createScene(engine) {
  const scene = new Scene(engine);
  const bg = Color3.FromHexString(PALETTE.background);
  scene.clearColor = new Color4(bg.r, bg.g, bg.b, 1);

  // Neblina na cor do fundo: o piso "some" no escuro, sem bordas visíveis.
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.03;
  scene.fogColor = bg.clone();

  // Tone mapping neutro (Khronos PBR Neutral) preserva as cores originais do modelo.
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  ip.exposure = 1.05;
  ip.contrast = 1.12;

  // Mapa de ambiente de estúdio servido localmente (sem dependência de CDN):
  // é ele que gera os reflexos realistas nos materiais PBR do carro.
  const env = CubeTexture.CreateFromPrefilteredData(SHOWROOM.environmentTexture, scene);
  env.name = "studio-environment";
  scene.environmentTexture = env;
  scene.environmentIntensity = SHOWROOM.environmentIntensity;

  return scene;
}

/** Câmera orbital do modo desktop/móvel, limitada para nunca "perder" o carro. */
export function createCamera(scene, canvas) {
  const camera = new ArcRotateCamera("desktop-camera", Math.PI / 2 + 0.6, 1.22, 8, new Vector3(0, 0.9, 0), scene);
  camera.attachControl(canvas, true);
  camera.minZ = 0.05;
  camera.maxZ = 250;
  camera.fov = 0.8;

  camera.inertia = 0.88;
  camera.angularSensibilityX = 2600;
  camera.angularSensibilityY = 2600;
  camera.wheelDeltaPercentage = 0.012;
  camera.useNaturalPinchZoom = true;

  // Sem pan: evita que o carro saia do enquadramento (prevenção de erros).
  camera.panningSensibility = 0;

  camera.lowerBetaLimit = 0.12;
  camera.upperBetaLimit = 1.47; // nunca abaixo do piso
  camera.lowerRadiusLimit = 3;
  camera.upperRadiusLimit = 16;
  return camera;
}

/**
 * Vistas predefinidas (reconhecimento em vez de memorização).
 * Convenção da cena: frente do carro em +Z, lado do motorista (esquerdo) em -X.
 * `fit(d)` diz o que precisa caber na tela: largura (h) e altura (v) aparentes, e a
 * profundidade entre o centro e a face mais próxima da câmera.
 */
const VIEWS = {
  hero: {
    label: "Vista inicial",
    alpha: Math.PI / 2 + 0.62,
    beta: 1.2,
    fit: (d) => ({ h: Math.hypot(d.length, d.width) * 0.92, v: d.height * 1.4, depth: Math.hypot(d.length, d.width) * 0.25 }),
  },
  front: { label: "Frente", alpha: Math.PI / 2, beta: 1.3, fit: (d) => ({ h: d.width, v: d.height, depth: d.length / 2 }) },
  side: { label: "Lateral", alpha: Math.PI, beta: 1.38, fit: (d) => ({ h: d.length, v: d.height, depth: d.width / 2 }) },
  rear: { label: "Traseira", alpha: -Math.PI / 2, beta: 1.3, fit: (d) => ({ h: d.width, v: d.height, depth: d.length / 2 }) },
  top: { label: "Superior", alpha: Math.PI / 2, beta: 0.14, fit: (d) => ({ h: d.width, v: d.length, depth: d.height * 0.7 }) },
};

export function createViewController(scene, camera, dims, floorOffset) {
  // Alvo um pouco abaixo do centro do carro: sobra espaço para a barra de ferramentas inferior.
  const target = new Vector3(0, floorOffset + dims.height * 0.34, 0);
  camera.setTarget(target.clone());
  camera.lowerRadiusLimit = Math.max(2.4, dims.length * 0.55);
  camera.upperRadiusLimit = Math.max(14, dims.length * 3.4);

  let active = null;
  let current = "hero";

  /** Distância para que o carro caiba no quadro naquela vista (inclui celular em retrato). */
  function fitRadius(view) {
    const engine = scene.getEngine();
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    const tanV = Math.tan(camera.fov / 2);
    const tanH = tanV * aspect;
    const { h, v, depth } = view.fit(dims);
    // ~20% da altura da tela fica sob o cabeçalho e a barra de ferramentas.
    const byH = ((h / 2) * 1.45) / tanH + depth;
    const byV = ((v / 2) * 1.35) / (tanV * 0.8) + depth;
    return Math.min(camera.upperRadiusLimit, Math.max(camera.lowerRadiusLimit + 0.4, byH, byV));
  }

  function nearestAlpha(from, to) {
    let a = from;
    while (a - to > Math.PI) a -= Math.PI * 2;
    while (to - a > Math.PI) a += Math.PI * 2;
    return a;
  }

  function cancel() {
    active?.cancel();
    active = null;
  }

  function flyTo(name, { duration = 1400 } = {}) {
    const view = VIEWS[name];
    if (!view) return Promise.resolve();
    cancel();
    current = name;
    const from = {
      alpha: nearestAlpha(camera.alpha, view.alpha),
      beta: camera.beta,
      radius: camera.radius,
      tx: camera.target.x,
      ty: camera.target.y,
      tz: camera.target.z,
    };
    const to = { alpha: view.alpha, beta: view.beta, radius: fitRadius(view) };
    camera.alpha = from.alpha;
    return new Promise((resolve) => {
      active = tween(scene, {
        duration,
        ease: easeInOutCubic,
        onUpdate: (t) => {
          camera.alpha = from.alpha + (to.alpha - from.alpha) * t;
          camera.beta = from.beta + (to.beta - from.beta) * t;
          camera.radius = from.radius + (to.radius - from.radius) * t;
          camera.target.set(
            from.tx + (target.x - from.tx) * t,
            from.ty + (target.y - from.ty) * t,
            from.tz + (target.z - from.tz) * t,
          );
        },
        onComplete: resolve,
      });
    });
  }

  /** Aproxima a câmera de um ponto (coordenadas de mundo) mantendo o ângulo atual. */
  function focusOn(point, size, { duration = 1100 } = {}) {
    cancel();
    current = null;
    const from = { radius: camera.radius, tx: camera.target.x, ty: camera.target.y, tz: camera.target.z };
    const toRadius = Math.min(camera.upperRadiusLimit, Math.max(camera.lowerRadiusLimit, size * 1.35 + 1.9));
    return new Promise((resolve) => {
      active = tween(scene, {
        duration,
        ease: easeInOutCubic,
        onUpdate: (t) => {
          camera.radius = from.radius + (toRadius - from.radius) * t;
          camera.target.set(
            from.tx + (point.x - from.tx) * t,
            from.ty + (point.y - from.ty) * t,
            from.tz + (point.z - from.tz) * t,
          );
        },
        onComplete: resolve,
      });
    });
  }

  function jumpTo(name) {
    const view = VIEWS[name];
    cancel();
    current = name;
    camera.setTarget(target.clone());
    camera.alpha = view.alpha;
    camera.beta = view.beta;
    camera.radius = fitRadius(view);
  }

  // Qualquer interação do usuário interrompe a animação de câmera (controle e liberdade).
  const canvas = scene.getEngine().getRenderingCanvas();
  for (const type of ["pointerdown", "wheel", "touchstart"]) {
    canvas.addEventListener(type, cancel, { passive: true });
  }

  return {
    views: VIEWS,
    target,
    flyTo,
    focusOn,
    jumpTo,
    cancel,
    fitRadius: (name) => fitRadius(VIEWS[name]),
    get current() {
      return current;
    },
  };
}
