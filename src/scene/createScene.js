import {
  ArcRotateCamera,
  Color3,
  Color4,
  CubeTexture,
  Engine,
  ImageProcessingConfiguration,
  Scene,
  Vector3,
} from "../babylon.js";
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

/** Altura aproximada do cabeçalho do HUD (px), descontada da área livre. */
const HEADER_PX = 64;

export function createViewController(scene, camera, dims, floorOffset) {
  // Alvo um pouco abaixo do centro do carro: sobra espaço para a barra de ferramentas inferior.
  const target = new Vector3(0, floorOffset + dims.height * 0.34, 0);
  camera.setTarget(target.clone());
  camera.lowerRadiusLimit = Math.max(2.4, dims.length * 0.55);
  camera.upperRadiusLimit = Math.max(14, dims.length * 3.4);

  let active = null;
  let current = "hero";

  /**
   * Distância para que o carro caiba no quadro naquela vista (inclui celular em retrato).
   * `free`: mede só a área livre — sem painéis, gavetas e cabeçalho — com a margem `margin`
   * (no celular, faz o carro ocupar o espaço acima da gaveta em vez de ficar pequeno no topo).
   */
  function fitRadius(view, { free = false, margin = 1.08 } = {}) {
    const engine = scene.getEngine();
    const tanV = Math.tan(camera.fov / 2);
    const { h, v, depth } = view.fit(dims);
    let byH;
    let byV;
    if (free) {
      const H = canvas.clientHeight || 1;
      const fw = Math.max(1, canvas.clientWidth - insets.left - insets.right) / H;
      const fh = Math.max(1, H - insets.bottom - HEADER_PX) / H;
      // Piso de distância: muito perto, a perspectiva distorce e a frente do carro sai do quadro.
      byH = Math.max(dims.length * 1.5, ((h / 2) * margin) / (tanV * fw) + depth);
      byV = ((v / 2) * margin) / (tanV * fh) + depth;
    } else {
      const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
      // ~20% da altura da tela fica sob o cabeçalho e a barra de ferramentas.
      byH = ((h / 2) * 1.45) / (tanV * aspect) + depth;
      byV = ((v / 2) * 1.35) / (tanV * 0.8) + depth;
    }
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

  function flyTo(name, { duration = 1400, radiusScale = 1 } = {}) {
    const view = VIEWS[name];
    if (!view) return Promise.resolve();
    current = name;
    return animateTo(view, target, { duration, radiusScale });
  }

  /**
   * Enquadra uma caixa (coordenadas de mundo) a partir do ângulo `alpha`, ex.: carro + carregador
   * externo no modo Recarga. Aproximação pela caixa envolvente projetada no plano da câmera.
   */
  function frameBox(min, max, { alpha, beta = 1.22, duration = 1400, free = false, margin, depth = 0.3 } = {}) {
    const sx = max.x - min.x;
    const sz = max.z - min.z;
    const s = Math.abs(Math.sin(alpha));
    const c = Math.abs(Math.cos(alpha));
    // `depth`: fração da profundidade somada à distância (a caixa superestima a silhueta do carro).
    const view = { alpha, beta, fit: () => ({ h: sx * s + sz * c, v: (max.y - min.y) * 1.15, depth: (sx * c + sz * s) * depth }) };
    current = null;
    return animateTo(view, Vector3.Center(min, max), { duration, fit: { free, margin } });
  }

  function animateTo(view, goal, { duration, radiusScale = 1, fit }) {
    cancel();
    const from = {
      alpha: nearestAlpha(camera.alpha, view.alpha),
      beta: camera.beta,
      radius: camera.radius,
      tx: camera.target.x,
      ty: camera.target.y,
      tz: camera.target.z,
    };
    const to = { alpha: view.alpha, beta: view.beta, radius: Math.min(camera.upperRadiusLimit, fitRadius(view, fit) * radiusScale) };
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
            from.tx + (goal.x - from.tx) * t,
            from.ty + (goal.y - from.ty) * t,
            from.tz + (goal.z - from.tz) * t,
          );
        },
        onComplete: resolve,
      });
    });
  }

  /**
   * Aproxima a câmera de um ponto (coordenadas de mundo) mantendo o ângulo horizontal atual.
   * `maxBeta` limita a inclinação (ex.: peças sob o assoalho são vistas de cima, sem as rodas na frente).
   */
  function focusOn(point, size, { duration = 1100, maxBeta = null } = {}) {
    cancel();
    current = null;
    const from = { radius: camera.radius, beta: camera.beta, tx: camera.target.x, ty: camera.target.y, tz: camera.target.z };
    const toBeta = maxBeta == null ? from.beta : Math.min(from.beta, maxBeta);
    // A distância considera só a área livre da tela (sem painéis e gavetas): no celular em pé ou no
    // tablet com o painel ocupando metade da largura, a câmera se afasta e o carro continua em contexto.
    const h = canvas.clientHeight || 1;
    const freeW = Math.max(1, canvas.clientWidth - insets.left - insets.right) / h;
    const freeH = Math.max(1, h - insets.bottom) / h;
    const fit = Math.min(2.4, 1 / Math.min(1, freeW, freeH));
    const toRadius = Math.min(camera.upperRadiusLimit, Math.max(camera.lowerRadiusLimit, size * 1.35 + 2.4) * fit);
    return new Promise((resolve) => {
      active = tween(scene, {
        duration,
        ease: easeInOutCubic,
        onUpdate: (t) => {
          camera.radius = from.radius + (toRadius - from.radius) * t;
          camera.beta = from.beta + (toBeta - from.beta) * t;
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

  /**
   * Painéis abertos "ocupam" bordas da tela; o carro é deslocado para o centro da área livre
   * (targetScreenOffset muda só a matriz de vista — sem custo extra de renderização).
   * insets em px CSS: { left, right, bottom }.
   */
  const insets = { left: 0, right: 0, bottom: 0 };
  const offsetGoal = { x: 0, y: 0 };
  scene.onBeforeRenderObservable.add(() => {
    if (scene.activeCamera !== camera) return;
    const h = canvas.clientHeight || 1;
    const worldPerPx = (2 * camera.radius * Math.tan(camera.fov / 2)) / h;
    offsetGoal.x = ((insets.left - insets.right) / 2) * worldPerPx;
    offsetGoal.y = (insets.bottom / 2) * worldPerPx;
    const o = camera.targetScreenOffset;
    const k = Math.min(1, scene.getEngine().getDeltaTime() / 180);
    if (Math.abs(o.x - offsetGoal.x) > 1e-4 || Math.abs(o.y - offsetGoal.y) > 1e-4) {
      o.x += (offsetGoal.x - o.x) * k;
      o.y += (offsetGoal.y - o.y) * k;
    }
  });

  return {
    views: VIEWS,
    target,
    flyTo,
    frameBox,
    focusOn,
    jumpTo,
    cancel,
    setScreenInsets(next) {
      insets.left = next.left ?? 0;
      insets.right = next.right ?? 0;
      insets.bottom = next.bottom ?? 0;
    },
    fitRadius: (name) => fitRadius(VIEWS[name]),
    get current() {
      return current;
    },
  };
}
