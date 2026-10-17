import {
  Color3,
  Constants,
  DynamicTexture,
  GlowLayer,
  Matrix,
  MeshBuilder,
  MirrorTexture,
  PBRMaterial,
  Plane,
  StandardMaterial,
  Texture,
  Tools,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { APP, INSTITUTION, PALETTE, SHOWROOM, XR } from "../config.js";
import { easeInOutCubic, tween } from "./presentation.js";

const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const hex = (h) => Color3.FromHexString(h);

/**
 * Showroom futurista construído só com primitivas + texturas desenhadas em canvas
 * (nenhum arquivo externo além do mapa de ambiente). Tudo é dimensionado a partir
 * das medidas do carro, então se adapta ao modelo definitivo sem ajustes.
 *
 * Grupos emissivos (para a animação de abertura): floor, platform, pillars, halo, title.
 */
export function createShowroom(scene, quality, { dims, turntable, vehicle, spawnAlpha }) {
  const H = SHOWROOM.platformHeight;
  const R = Math.max(3, Math.hypot(dims.length, dims.width) / 2 + SHOWROOM.platformMargin);

  const emissiveSetters = { floor: [], platform: [], pillars: [], halo: [], title: [] };
  const glowMeshes = [];
  const mirrorMeshes = [];
  const blockers = new Set();

  const emissiveMaterial = (name, color, group, scale = 1) => {
    const mat = new StandardMaterial(name, scene);
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    const base = hex(color).scale(scale);
    mat.emissiveColor = base.clone();
    emissiveSetters[group].push((k) => mat.emissiveColor.copyFrom(base.scale(k)));
    return mat;
  };

  // ---------------------------------------------------------------- piso
  const floor = MeshBuilder.CreateGround("showroom-floor", { width: SHOWROOM.floorSize, height: SHOWROOM.floorSize }, scene);
  const floorMat = new PBRMaterial("mat-floor", scene);
  floorMat.albedoColor = hex("#070d18").toLinearSpace();
  floorMat.metallic = 0;
  floorMat.roughness = 0.36; // reflexo sutil do ambiente em ângulos rasantes
  floorMat.environmentIntensity = 0.55;
  const grid = createGridTexture(scene);
  grid.uScale = grid.vScale = SHOWROOM.floorSize / 2; // células de 2 m
  floorMat.emissiveTexture = grid;
  const floorGlow = hex(PALETTE.blue).toLinearSpace().scale(0.55);
  floorMat.emissiveColor = floorGlow.clone();
  emissiveSetters.floor.push((k) => floorMat.emissiveColor.copyFrom(floorGlow.scale(k)));
  floor.material = floorMat;

  // ---------------------------------------------------------------- plataforma
  const base = MeshBuilder.CreateCylinder(
    "platform-base",
    { height: H, diameterTop: R * 2, diameterBottom: R * 2 + 0.1, tessellation: 128 },
    scene,
  );
  base.position.y = H / 2;
  const baseMat = new PBRMaterial("mat-platform-base", scene);
  baseMat.albedoColor = hex("#0b1422").toLinearSpace();
  baseMat.metallic = 0.8;
  baseMat.roughness = 0.3;
  base.material = baseMat;
  blockers.add(base);

  // Tampo que gira junto com o carro (o mostrador graduado evidencia a rotação).
  const top = MeshBuilder.CreateDisc("platform-top", { radius: R - 0.03, tessellation: 128 }, scene);
  top.rotation.x = Math.PI / 2;
  top.parent = turntable;
  top.position.y = 0.0015;
  const topMat = new StandardMaterial("mat-platform-top", scene);
  topMat.diffuseColor = hex("#0a1322");
  topMat.specularColor = new Color3(0.32, 0.38, 0.45);
  topMat.specularPower = 96;
  const dial = createDialTexture(scene);
  topMat.emissiveTexture = dial;
  emissiveSetters.platform.push((k) => (dial.level = 0.9 * k));
  top.material = topMat;

  let mirror = null;
  if (quality.mirror) {
    mirror = new MirrorTexture("mirror-platform", quality.mirrorSize, scene, true);
    mirror.mirrorPlane = new Plane(0, -1, 0, H + 0.0015);
    mirror.level = 0.34;
    mirror.adaptiveBlurKernel = 20;
    topMat.reflectionTexture = mirror;
  }

  // Sombra de contato suave (funciona em todos os perfis, inclusive no Quest).
  const contact = MeshBuilder.CreateGround(
    "contact-shadow",
    { width: dims.width + 0.9, height: dims.length + 0.9 },
    scene,
  );
  contact.parent = turntable;
  contact.position.y = 0.004;
  const contactMat = new StandardMaterial("mat-contact-shadow", scene);
  contactMat.disableLighting = true;
  contactMat.diffuseColor = Color3.Black();
  contactMat.specularColor = Color3.Black();
  contactMat.opacityTexture = createContactShadowTexture(scene, dims);
  contactMat.fogEnabled = false;
  contact.material = contactMat;

  // Anéis de LED.
  const ledTop = MeshBuilder.CreateTorus("platform-led-top", { diameter: R * 2 - 0.014, thickness: 0.024, tessellation: 96 }, scene);
  ledTop.position.y = H + 0.004;
  ledTop.material = emissiveMaterial("mat-led-cyan", PALETTE.cyan, "platform");
  const ledBase = MeshBuilder.CreateTorus("platform-led-base", { diameter: R * 2 + 0.17, thickness: 0.035, tessellation: 96 }, scene);
  ledBase.position.y = 0.016;
  ledBase.material = emissiveMaterial("mat-led-blue", PALETTE.blue, "platform");
  glowMeshes.push(ledTop, ledBase);
  mirrorMeshes.push(ledTop);

  // Luz "derramada" no piso ao redor da plataforma (gradiente aditivo, 1 draw call).
  const spillSize = (R + 3.4) * 2;
  const spill = MeshBuilder.CreateGround("platform-spill", { width: spillSize, height: spillSize }, scene);
  spill.position.y = 0.003;
  spill.isPickable = false;
  const spillMat = new StandardMaterial("mat-platform-spill", scene);
  spillMat.disableLighting = true;
  spillMat.diffuseColor = Color3.Black();
  spillMat.specularColor = Color3.Black();
  const spillTex = createSpillTexture(scene, R / (R + 3.4));
  spillMat.emissiveTexture = spillTex;
  spillMat.opacityTexture = spillTex;
  spillMat.alphaMode = Constants.ALPHA_ADD;
  spillMat.fogEnabled = false;
  spill.material = spillMat;
  emissiveSetters.platform.push((k) => (spillTex.level = k));

  // ---------------------------------------------------------------- halo no teto
  const halo = MeshBuilder.CreateTorus("ceiling-halo", { diameter: R * 2.1, thickness: 0.085, tessellation: 96 }, scene);
  halo.position.y = 4.4;
  halo.material = emissiveMaterial("mat-halo", "#c9f6ff", "halo", 0.95);
  const haloInner = MeshBuilder.CreateTorus("ceiling-halo-inner", { diameter: R * 1.66, thickness: 0.028, tessellation: 96 }, scene);
  haloInner.position.y = 4.42;
  haloInner.material = emissiveMaterial("mat-halo-inner", PALETTE.cyan, "halo");
  glowMeshes.push(halo, haloInner);
  mirrorMeshes.push(halo, haloInner);

  // ---------------------------------------------------------------- pilares de luz (thin instances = 1 draw call)
  const pillars = MeshBuilder.CreateBox("light-pillars", { width: 0.07, depth: 0.07, height: 3.4 }, scene);
  pillars.material = emissiveMaterial("mat-pillars", PALETTE.blue, "pillars", 0.9);
  const pillarCount = 18;
  const pillarRadius = R + 8.5;
  for (let i = 0; i < pillarCount; i++) {
    const a = (i / pillarCount) * Math.PI * 2;
    pillars.thinInstanceAdd(Matrix.Translation(Math.cos(a) * pillarRadius, 1.7, Math.sin(a) * pillarRadius), i === pillarCount - 1);
  }
  pillars.thinInstanceRefreshBoundingInfo();
  pillars.isPickable = false;
  glowMeshes.push(pillars);
  mirrorMeshes.push(pillars);

  // ---------------------------------------------------------------- título holográfico (atrás do carro)
  const titleWidth = 6.2;
  const title = MeshBuilder.CreatePlane("holo-title", { width: titleWidth, height: titleWidth * (384 / 2048) }, scene);
  title.position = new Vector3(0, H + 1.95, -(R + 5.6));
  title.rotation.y = Math.PI; // face visível voltada para +Z (frente do carro)
  const titleMat = new StandardMaterial("mat-holo-title", scene);
  titleMat.disableLighting = true;
  titleMat.diffuseColor = Color3.Black();
  titleMat.specularColor = Color3.Black();
  const titleTex = createTitleTexture(scene);
  titleMat.emissiveTexture = titleTex;
  titleMat.opacityTexture = titleTex;
  titleMat.alphaMode = Constants.ALPHA_ADD;
  titleMat.fogEnabled = false;
  title.material = titleMat;
  title.isPickable = false;
  emissiveSetters.title.push((k) => (titleTex.level = k));

  // ---------------------------------------------------------------- anel de varredura (abertura)
  const scanDiameter = dims.length + 0.55;
  // Toro unitário escalado em elipse que "abraça" o carro (y também escala, para manter o tubo visível).
  const scan = MeshBuilder.CreateTorus("scan-ring", { diameter: 1, thickness: 0.028 / scanDiameter, tessellation: 96 }, scene);
  scan.scaling.set(dims.width + 0.55, scanDiameter, scanDiameter);
  scan.parent = turntable;
  const scanMat = new StandardMaterial("mat-scan", scene);
  scanMat.disableLighting = true;
  scanMat.emissiveColor = hex(PALETTE.cyan);
  scanMat.diffuseColor = Color3.Black();
  scanMat.alpha = 0;
  scan.material = scanMat;
  scan.isPickable = false;
  scan.setEnabled(false);
  glowMeshes.push(scan);

  function playScan({ delay = 0 } = {}) {
    scan.setEnabled(true);
    return tween(scene, {
      duration: 2300,
      delay,
      ease: easeInOutCubic,
      onUpdate: (t) => {
        scan.position.y = 0.02 + t * (dims.height + 0.12);
        scanMat.alpha = Math.sin(Math.PI * t) * 0.95;
      },
      onComplete: () => scan.setEnabled(false),
    });
  }

  // ---------------------------------------------------------------- ponto de partida e placa
  const spawnRadius = R + XR.spawnClearance;
  const spawn = new Vector3(Math.cos(spawnAlpha) * spawnRadius, 0, Math.sin(spawnAlpha) * spawnRadius);
  const lookAt = new Vector3(0, H + dims.height * 0.45, 0);

  // Placa à esquerda de quem chega pelo ponto de partida (o painel de controle fica à direita).
  // Só aparece em VR: no desktop o cartão do HUD mostra as mesmas informações.
  const plaqueAlpha = spawnAlpha - 0.34;
  const plaqueRadius = R + 0.55;
  const plaquePos = new Vector3(Math.cos(plaqueAlpha) * plaqueRadius, 0, Math.sin(plaqueAlpha) * plaqueRadius);
  const plaque = createInfoPlaque(scene, plaquePos, spawn);
  plaque.root.setEnabled(false);
  for (const m of plaque.meshes) blockers.add(m);

  // Totem da escola: do outro lado da plataforma, na diagonal oposta ao ponto de partida —
  // aparece acima do capô na vista inicial e ao fundo para quem chega em VR.
  const totemAlpha = spawnAlpha - 2.5;
  const totemRadius = R + 3;
  const totemPos = new Vector3(Math.cos(totemAlpha) * totemRadius, 0, Math.sin(totemAlpha) * totemRadius);
  const totem = createInstitutionTotem(scene, totemPos, spawn);
  for (const m of totem.solid) blockers.add(m);
  glowMeshes.push(...totem.leds);
  mirrorMeshes.push(...totem.solid, ...totem.leds);
  emissiveSetters.title.push(totem.setLevel);

  // ---------------------------------------------------------------- carro: espelho, glow dos LEDs
  if (vehicle) {
    mirrorMeshes.push(...vehicle.meshes);
    for (const m of vehicle.meshes) {
      const e = m.material?.emissiveColor;
      if (e && e.r + e.g + e.b > 0.6) glowMeshes.push(m); // faróis, lanternas
    }
    plaque.setInfo(vehicle.info);
  }
  if (mirror) mirror.renderList.push(...mirrorMeshes);

  let glow = null;
  if (quality.glow) {
    glow = new GlowLayer("glow", scene, { mainTextureRatio: 0.5, blurKernelSize: quality.glowBlur });
    glow.intensity = 0.75;
    for (const m of glowMeshes) glow.addIncludedOnlyMesh(m);
  }

  for (const m of [spill, contact, ledBase, ledTop, halo, haloInner, base]) m.isPickable = m === base;

  const turntableController = createTurntableController(scene, turntable, SHOWROOM.turntableDegPerSecond);

  return {
    radius: R,
    floor,
    platformTop: top,
    teleportFloors: [floor, top],
    isTeleportBlocker: (mesh) => blockers.has(mesh),
    spawn,
    lookAt,
    plaque,
    turntable: turntableController,
    playScan,
    setEmissiveLevel(group, k) {
      const groups = group === "all" ? Object.keys(emissiveSetters) : [group];
      for (const g of groups) for (const set of emissiveSetters[g]) set(k);
    },
    setMirrorEnabled(on) {
      if (mirror) topMat.reflectionTexture = on ? mirror : null;
    },
    setGlowEnabled(on) {
      if (glow) glow.isEnabled = on;
    },
    /** Inclui malhas emissivas criadas depois (ex.: partículas do fluxo de energia) no brilho. */
    addGlow(meshes) {
      if (glow) for (const m of meshes) glow.addIncludedOnlyMesh(m);
    },
    get hasMirror() {
      return !!mirror;
    },
    get hasGlow() {
      return !!glow;
    },
  };
}

/** Giro da plataforma com aceleração/desaceleração suaves. */
function createTurntableController(scene, node, degPerSecond) {
  const max = Tools.ToRadians(degPerSecond);
  let target = 0;
  let speed = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
    speed += (target - speed) * Math.min(1, dt * 2.2);
    if (Math.abs(speed) > 1e-5) node.rotation.y += speed * dt;
  });
  return {
    set(on) {
      target = on ? max : 0;
    },
    get spinning() {
      return target !== 0;
    },
    /** Para imediatamente, sem desaceleração (antes de alinhar o prato para uma vista). */
    halt() {
      target = 0;
      speed = 0;
    },
  };
}

// ======================================================================= placa de informações

function createInfoPlaque(scene, position, facingFrom) {
  const root = new TransformNode("info-plaque", scene);
  root.position.copyFrom(position);
  const dir = position.subtract(facingFrom);
  root.rotation.y = Math.atan2(dir.x, dir.z);

  const standMat = new PBRMaterial("mat-plaque-stand", scene);
  standMat.albedoColor = hex("#0d1828").toLinearSpace();
  standMat.metallic = 0.85;
  standMat.roughness = 0.3;

  const foot = MeshBuilder.CreateCylinder("plaque-foot", { diameter: 0.42, height: 0.03, tessellation: 48 }, scene);
  foot.position.y = 0.015;
  const pole = MeshBuilder.CreateCylinder("plaque-pole", { diameter: 0.05, height: 1.1, tessellation: 24 }, scene);
  pole.position.y = 0.57;
  for (const m of [foot, pole]) {
    m.material = standMat;
    m.parent = root;
  }

  const W = 0.9;
  const Hh = W * (600 / 1024);
  const panel = MeshBuilder.CreatePlane("plaque-panel", { width: W, height: Hh }, scene);
  panel.parent = root;
  panel.position.y = 1.42;
  panel.rotation.x = 0.22; // levemente inclinada, como um púlpito
  const tex = new DynamicTexture("tex-plaque", { width: 1024, height: 600 }, scene, true);
  tex.hasAlpha = true;
  const mat = new StandardMaterial("mat-plaque", scene);
  mat.disableLighting = true;
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.fogEnabled = false;
  panel.material = mat;

  function setInfo(info) {
    drawPlaque(tex, info);
  }
  setInfo(null);

  return { root, meshes: [foot, pole, panel], setInfo };
}

function drawPlaque(tex, info) {
  const ctx = tex.getContext();
  const { width: w, height: h } = tex.getSize();
  ctx.clearRect(0, 0, w, h);

  roundRect(ctx, 6, 6, w - 12, h - 12, 34);
  ctx.fillStyle = "rgba(8, 17, 31, 0.86)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0, 229, 255, 0.85)";
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PALETTE.cyan;
  ctx.font = `600 30px ${FONT}`;
  setSpacing(ctx, "6px");
  ctx.fillText("VEÍCULO EM EXPOSIÇÃO", 60, 96);
  setSpacing(ctx, "0px");

  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 84px ${FONT}`;
  ctx.fillText(info?.label ?? "Carregando…", 56, 196);

  if (info) {
    const pill = info.provisional ? "MODELO PROVISÓRIO" : "MODELO DEFINITIVO";
    const color = info.provisional ? PALETTE.orange : PALETTE.cyan;
    ctx.font = `700 26px ${FONT}`;
    setSpacing(ctx, "3px");
    const pw = ctx.measureText(pill).width + 44;
    roundRect(ctx, 60, 226, pw, 50, 25);
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(pill, 82, 261);
    setSpacing(ctx, "0px");

    const fmt = (v) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
    const cols = [
      ["COMPRIMENTO", fmt(info.dims.length)],
      ["LARGURA", fmt(info.dims.width)],
      ["ALTURA", fmt(info.dims.height)],
    ];
    ctx.strokeStyle = "rgba(0, 184, 255, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 322);
    ctx.lineTo(w - 60, 322);
    ctx.stroke();
    cols.forEach(([k, v], i) => {
      const x = 60 + i * 310;
      ctx.fillStyle = "rgba(245, 247, 250, 0.62)";
      ctx.font = `600 26px ${FONT}`;
      setSpacing(ctx, "3px");
      ctx.fillText(k, x, 382);
      setSpacing(ctx, "0px");
      ctx.fillStyle = PALETTE.text;
      ctx.font = `600 64px ${FONT}`;
      ctx.fillText(v, x, 456);
    });
    ctx.fillStyle = "rgba(245, 247, 250, 0.5)";
    ctx.font = `400 24px ${FONT}`;
    ctx.fillText("Medidas extraídas do modelo 3D carregado.", 60, 506);
  }
  ctx.fillStyle = "rgba(0, 229, 255, 0.8)";
  ctx.font = `600 24px ${FONT}`;
  setSpacing(ctx, "2px");
  ctx.fillText(`${INSTITUTION.eyebrow} ${INSTITUTION.schoolName}`.toUpperCase(), 60, 556);
  setSpacing(ctx, "0px");
  tex.update();
}

// ======================================================================= totem da escola

/**
 * Totem retroiluminado com a identificação da escola. A face frontal olha para o
 * ponto de partida; a traseira repete o conteúdo (visível ao dar a volta em VR).
 */
function createInstitutionTotem(scene, position, facingFrom) {
  const root = new TransformNode("institution-totem", scene);
  root.position.copyFrom(position);
  const dir = position.subtract(facingFrom);
  root.rotation.y = Math.atan2(dir.x, dir.z);

  const W = 1.2;
  const H = 2.8;
  const D = 0.16;

  const bodyMat = new PBRMaterial("mat-totem-body", scene);
  bodyMat.albedoColor = hex("#0b1422").toLinearSpace();
  bodyMat.metallic = 0.8;
  bodyMat.roughness = 0.3;
  const body = MeshBuilder.CreateBox("totem-body", { width: W + 0.1, height: H, depth: D }, scene);
  body.position.y = H / 2;
  body.parent = root;
  body.material = bodyMat;
  body.isPickable = false;

  const faceH = H - 0.12;
  const texW = 768;
  const texH = Math.round((texW * faceH) / W);
  const tex = new DynamicTexture("tex-totem", { width: texW, height: texH }, scene, true);
  tex.anisotropicFilteringLevel = 8;
  drawTotem(tex, null);
  // Arte oficial opcional: public/textures/senai-logo.png substitui o logotipo desenhado.
  const logo = new Image();
  logo.onload = () => drawTotem(tex, logo);
  logo.src = INSTITUTION.logoUrl;

  const faceMat = new StandardMaterial("mat-totem-face", scene);
  faceMat.disableLighting = true;
  faceMat.diffuseColor = Color3.Black();
  faceMat.specularColor = Color3.Black();
  faceMat.emissiveTexture = tex;
  faceMat.fogEnabled = false;

  const front = MeshBuilder.CreatePlane("totem-face", { width: W, height: faceH }, scene);
  front.parent = root;
  front.position.set(0, H / 2, -D / 2 - 0.003);
  const back = MeshBuilder.CreatePlane("totem-face-back", { width: W, height: faceH }, scene);
  back.parent = root;
  back.position.set(0, H / 2, D / 2 + 0.003);
  back.rotation.y = Math.PI;
  for (const m of [front, back]) {
    m.material = faceMat;
    m.isPickable = false;
  }

  const ledMat = new StandardMaterial("mat-totem-led", scene);
  ledMat.disableLighting = true;
  ledMat.emissiveColor = hex(PALETTE.cyan);
  const ledBase = hex(PALETTE.cyan);
  const leds = [-1, 1].map((side) => {
    const led = MeshBuilder.CreateBox(`totem-led-${side}`, { width: 0.022, height: H - 0.2, depth: D + 0.02 }, scene);
    led.parent = root;
    led.position.set(side * (W / 2 + 0.06), H / 2, 0);
    led.material = ledMat;
    led.isPickable = false;
    return led;
  });

  return {
    root,
    solid: [body, front, back],
    leds,
    setLevel(k) {
      tex.level = 0.15 + 0.85 * k;
      ledMat.emissiveColor.copyFrom(ledBase.scale(k));
    },
  };
}

function drawTotem(tex, logoImage) {
  const ctx = tex.getContext();
  const { width: w, height: h } = tex.getSize();

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#10233a");
  bg.addColorStop(0.55, "#0a1626");
  bg.addColorStop(1, "#08111f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  // Logotipo
  const lx = 64;
  const ly = 96;
  const lw = w - 128;
  const lh = Math.round(lw / 4.3);
  if (logoImage) {
    const s = Math.min(lw / logoImage.width, lh / logoImage.height);
    const dw = logoImage.width * s;
    const dh = logoImage.height * s;
    ctx.drawImage(logoImage, lx + (lw - dw) / 2, ly + (lh - dh) / 2, dw, dh);
  } else {
    drawSenaiLogo(ctx, lx, ly, lw, lh);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PALETTE.cyan;
  ctx.font = `700 38px ${FONT}`;
  setSpacing(ctx, "9px");
  ctx.fillText(INSTITUTION.eyebrow.toUpperCase(), w / 2, ly + lh + 110);
  setSpacing(ctx, "0px");

  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 76px ${FONT}`;
  const words = INSTITUTION.schoolName.split(" ");
  const lines = words.length > 2 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : [INSTITUTION.schoolName];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, ly + lh + 210 + i * 92, w - 110));

  const afterName = ly + lh + 210 + (lines.length - 1) * 92;
  ctx.fillStyle = "rgba(0, 229, 255, 0.75)";
  ctx.fillRect(w / 2 - 110, afterName + 52, 220, 4);

  ctx.fillStyle = PALETTE.cyan;
  ctx.font = `700 42px ${FONT}`;
  setSpacing(ctx, "7px");
  ctx.fillText(APP.name.toUpperCase(), w / 2, afterName + 140, w - 110);
  setSpacing(ctx, "0px");
  ctx.fillStyle = "rgba(245, 247, 250, 0.72)";
  ctx.font = `400 36px ${FONT}`;
  ctx.fillText("Laboratório Virtual de", w / 2, afterName + 196);
  ctx.fillText("Veículos Elétricos", w / 2, afterName + 242);

  // Parte inferior: linhas finas que remetem às faixas do logotipo.
  ctx.strokeStyle = "rgba(0, 184, 255, 0.12)";
  ctx.lineWidth = 2;
  for (let y = afterName + 340; y < h - 60; y += 34) {
    ctx.beginPath();
    ctx.moveTo(64, y);
    ctx.lineTo(w - 64, y);
    ctx.stroke();
  }
  tex.update();
}

/** Logotipo SENAI desenhado (fundo vermelho, letras brancas em itálico e faixas laterais). */
function drawSenaiLogo(ctx, x, y, w, h) {
  ctx.fillStyle = "#E30613";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#FFFFFF";
  const stripes = 6;
  const stripeH = h * 0.05;
  const top = y + h * 0.14;
  const step = (h * 0.72 - stripeH) / (stripes - 1);
  for (let i = 0; i < stripes; i++) {
    const sy = top + i * step;
    ctx.fillRect(x + w * 0.025, sy, w * 0.085, stripeH);
    ctx.fillRect(x + w * 0.89, sy, w * 0.085, stripeH);
  }
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `italic 900 ${Math.round(h * 0.8)}px 'Arial Black', 'Segoe UI', Arial, sans-serif`;
  ctx.fillText("SENAI", x + w / 2, y + h * 0.53, w * 0.74);
  ctx.restore();
}

// ======================================================================= texturas procedurais

function createGridTexture(scene) {
  const size = 512;
  const tex = new DynamicTexture("tex-floor-grid", { width: size, height: size }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const p = (i * size) / 4;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, size, size);
  // marcas em cruz nos vértices da grade
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (const [x, y] of [[0, 0], [size, 0], [0, size], [size, size]]) {
    ctx.fillRect(x - 18, y - 2, 36, 4);
    ctx.fillRect(x - 2, y - 18, 4, 36);
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

function createDialTexture(scene) {
  const size = 1024;
  const c = size / 2;
  const tex = new DynamicTexture("tex-platform-dial", { width: size, height: size }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const ring = (r, width, alpha, dash) => {
    ctx.beginPath();
    ctx.setLineDash(dash || []);
    ctx.arc(c, c, r * c, 0, Math.PI * 2);
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
    ctx.stroke();
  };
  ring(0.985, 3, 0.55);
  ring(0.9, 2, 0.28);
  ring(0.64, 2, 0.16, [10, 14]);
  ring(0.3, 1.5, 0.1);
  ctx.setLineDash([]);
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const major = i % 10 === 0;
    const r0 = major ? 0.905 : 0.935;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0 * c, c + Math.sin(a) * r0 * c);
    ctx.lineTo(c + Math.cos(a) * 0.975 * c, c + Math.sin(a) * 0.975 * c);
    ctx.lineWidth = major ? 4 : 2;
    ctx.strokeStyle = `rgba(0, 229, 255, ${major ? 0.7 : 0.32})`;
    ctx.stroke();
  }
  tex.update();
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

function createSpillTexture(scene, innerRatio) {
  const size = 512;
  const tex = new DynamicTexture("tex-platform-spill", { width: size, height: size }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, innerRatio * c * 0.98, c, c, c);
  g.addColorStop(0, "rgba(0, 200, 255, 0.55)");
  g.addColorStop(0.12, "rgba(0, 184, 255, 0.22)");
  g.addColorStop(0.45, "rgba(0, 150, 255, 0.06)");
  g.addColorStop(1, "rgba(0, 120, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.update();
  return tex;
}

function createContactShadowTexture(scene, dims) {
  const w = 256;
  const h = Math.round(256 * ((dims.length + 0.9) / (dims.width + 0.9)));
  const tex = new DynamicTexture("tex-contact-shadow", { width: w, height: h }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  // Desenha o retângulo fora do canvas e deixa só a "sombra" borrada dentro (funciona em todos os navegadores).
  const inset = w * 0.2;
  ctx.shadowColor = "rgba(0, 0, 0, 0.92)";
  ctx.shadowBlur = w * 0.13;
  ctx.shadowOffsetX = w * 3;
  ctx.fillStyle = "#000";
  roundRect(ctx, inset - w * 3, inset, w - inset * 2, h - inset * 2, w * 0.18);
  ctx.fill();
  tex.update();
  return tex;
}

function createTitleTexture(scene) {
  const w = 2048;
  const h = 384;
  const tex = new DynamicTexture("tex-holo-title", { width: w, height: h }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const grad = ctx.createLinearGradient(w * 0.15, 0, w * 0.85, 0);
  grad.addColorStop(0, PALETTE.blue);
  grad.addColorStop(0.5, PALETTE.cyan);
  grad.addColorStop(1, PALETTE.blue);
  ctx.font = `700 150px ${FONT}`;
  setSpacing(ctx, "26px");
  ctx.shadowColor = "rgba(0, 229, 255, 0.8)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = grad;
  ctx.fillText(APP.name.toUpperCase(), w / 2, 190);

  ctx.shadowBlur = 0;
  ctx.font = `500 50px ${FONT}`;
  setSpacing(ctx, "14px");
  ctx.fillStyle = "rgba(245, 247, 250, 0.82)";
  ctx.fillText(APP.subtitle.toUpperCase(), w / 2, 300);
  setSpacing(ctx, "0px");

  ctx.fillStyle = "rgba(0, 229, 255, 0.7)";
  ctx.fillRect(w / 2 - 260, 236, 520, 3);
  tex.update();
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** `letterSpacing` do canvas (Chromium/Quest); ignorado com segurança onde não existe. */
function setSpacing(ctx, value) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = value;
}
