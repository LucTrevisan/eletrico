/**
 * EV Experience XR — ponto de entrada.
 *   Etapa 1: showroom, carro, câmera, luzes e VR.
 *   Etapa 2: raio X, identificação de componentes e painéis educativos.
 *   Etapa 3: fluxo de energia (aceleração, regeneração, recarga CA/CC) e simulação.
 *
 * A inicialização é dividida em seções independentes, cada uma com seu próprio
 * tratamento de erro, para que uma falha (ex.: WebXR indisponível) nunca impeça
 * a visualização 3D:
 *   A)  motor, cena, câmera e luzes — o render loop começa imediatamente
 *   B)  carregamento do veículo
 *   C)  showroom, vistas e HUD
 *   C2) componentes: raio X, legendas, seleção e painéis
 *   C3) fluxo de energia e simulação
 *   D)  WebXR (somente se houver suporte)
 */
import "./styles/main.css";
import { SceneInstrumentation, TransformNode, Vector3 } from "@babylonjs/core";
import { SHOWROOM, SIMULATION, URL_PARAMS, VEHICLE, VEHICLE_MODELS } from "./config.js";
import { applyResolution, createCamera, createEngine, createScene, createViewController } from "./scene/createScene.js";
import { createShowroom } from "./scene/environment.js";
import { createLighting } from "./scene/lighting.js";
import { playIntro, tween } from "./scene/presentation.js";
import { createAdaptiveQuality, detectQuality, getPreset } from "./scene/quality.js";
import { loadVehicle, orientVehicle, resolveModel } from "./vehicle/loadVehicle.js";
import {
  INTERNAL_COMPONENTS,
  computeComponentLayout,
  organizeVehicle,
  summarizeComponents,
} from "./vehicle/components.js";
import { getContent } from "./vehicle/componentContent.js";
import { createMaterialStates } from "./vehicle/materialStates.js";
import { createSchematics } from "./vehicle/schematics.js";
import { createSelection } from "./vehicle/selection.js";
import { createXRayMode } from "./vehicle/xrayMode.js";
import { createComponentCallouts } from "./ui/componentCallouts.js";
import { createComponentLabels } from "./ui/componentLabels.js";
import { createComponentPanel } from "./ui/componentPanel.js";
import { checkVRSupport, createXRExperience } from "./xr/xrExperience.js";
import { setupXRInteractions } from "./xr/interactions.js";
import { createHud } from "./ui/hud.js";
import { createVRMenu } from "./ui/vrMenu.js";
import { createEnergyPanel } from "./ui/energyPanel.js";
import { createEnergyFlow } from "./simulation/energyFlow.js";
import { ENERGY_MODES } from "./simulation/energyContent.js";
import { createVehicleSimulation } from "./simulation/vehicleSimulation.js";

const hud = createHud();

// Erros nunca ficam silenciosos: aparecem na tela, não só no console.
window.addEventListener("error", (e) => {
  console.error(e.error || e.message);
  hud.toast(`Erro: ${e.message}`, 6000);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  hud.toast(`Erro: ${e.reason?.message || e.reason}`, 6000);
});

boot().catch((err) => {
  console.error(err);
  hud.showFatal(err);
});

async function boot() {
  const canvas = document.getElementById("renderCanvas");
  let quality = detectQuality();

  // ------------------------------------------------------------------ A) cena
  const engine = createEngine(canvas, quality, {
    onContextLost: () => hud.setContextLost(true),
    onContextRestored: () => hud.setContextLost(false),
  });
  const scene = createScene(engine);
  const camera = createCamera(scene, canvas);
  const lighting = createLighting(scene, quality);
  const turntable = new TransformNode("turntable", scene);
  turntable.position.y = SHOWROOM.platformHeight;
  engine.runRenderLoop(() => scene.render());

  // ------------------------------------------------------------------ B) veículo
  let vehicle = null;
  try {
    hud.setLoaderStatus("Localizando o modelo 3D…");
    const model = await resolveModel(VEHICLE_MODELS);
    hud.setLoaderStatus(`Carregando ${model.label}${model.provisional ? " (modelo provisório)" : ""}…`);
    vehicle = await loadVehicle(scene, model, { parent: turntable, onProgress: (f) => hud.setProgress(f) });
    hud.setProgress(1);
    hud.setLoaderStatus("Preparando materiais e iluminação…");
    organizeVehicle(vehicle, VEHICLE);
    logVehicle(vehicle);
  } catch (err) {
    console.error("[EV XR] Falha ao carregar o veículo:", err);
    vehicle = null;
    await new Promise((resolve) =>
      hud.showLoadError(`Não foi possível carregar o modelo 3D. ${err?.message || err}`, { onContinue: resolve }),
    );
  }

  // ------------------------------------------------------------------ C) showroom, vistas e HUD
  const dims = vehicle?.dims ?? { length: VEHICLE.referenceLength, width: 1.86, height: 1.7 };
  const views = createViewController(scene, camera, dims, SHOWROOM.platformHeight);
  const showroom = createShowroom(scene, quality, { dims, turntable, vehicle, spawnAlpha: views.views.hero.alpha });
  if (vehicle) lighting.attachVehicle(vehicle.meshes, [showroom.platformTop, showroom.floor]);
  hud.setVehicle(vehicle?.info);

  let xrApi = null;
  let vrMenu = null;
  let userTookControl = false; // escolheu vista/giro durante a abertura: não sobrescrever

  function setTurntable(on) {
    showroom.turntable.set(on);
    hud.setTurntable(on);
    vrMenu?.setTurntableState(on);
  }

  /** Para o prato e o devolve suavemente à orientação original (frente para +Z). */
  function alignTurntable(duration = 1100) {
    showroom.turntable.halt();
    const from = turntable.rotation.y;
    const to = Math.round(from / (Math.PI * 2)) * Math.PI * 2;
    if (Math.abs(to - from) < 1e-3) return;
    tween(scene, { duration, onUpdate: (t) => (turntable.rotation.y = from + (to - from) * t) });
  }

  // ------------------------------------------------------------------ C2) componentes (Etapa 2)
  let xray = null;
  let selection = null;
  let labels = null;
  const panel = createComponentPanel(scene, { onClose: () => clearSelection() });
  const componentItems = {}; // id → { meshes, center (local do prato), size, illustrative }

  if (vehicle) {
    try {
      // ?ilustrativo: esconde os componentes internos reais para testar as representações ilustrativas.
      if (URL_PARAMS.has("ilustrativo")) {
        for (const m of vehicle.meshes) if (INTERNAL_COMPONENTS.includes(m.metadata.evxr.component)) m.setEnabled(false);
      }
      const states = createMaterialStates(vehicle.meshes.filter((m) => m.isEnabled()));
      const { components, axles } = computeComponentLayout(vehicle, turntable);
      const missing = INTERNAL_COMPONENTS.filter((id) => !components[id]);
      const schematics = createSchematics(scene, {
        parent: turntable,
        dims,
        axles,
        missing,
        drivetrain: vehicle.model.drivetrain,
      });
      Object.assign(componentItems, components, schematics.items);
      if (missing.length) console.info(`[EV XR] Ausentes no modelo (exibidos como ilustrativos): ${missing.join(", ")}`);

      const labelItems = INTERNAL_COMPONENTS.filter((id) => componentItems[id]).map((id) => ({
        id,
        center: componentItems[id].center,
        short: getContent(id).short,
        color: getContent(id).color,
        illustrative: componentItems[id].illustrative,
      }));
      // Legendas: em tela no desktop/celular, 3D dentro do headset.
      const labels3d = createComponentLabels(scene, {
        items: labelItems,
        parent: turntable,
        roofY: dims.height,
        halfLength: dims.length / 2,
      });
      const callouts = createComponentCallouts(scene, {
        items: labelItems,
        parent: turntable,
        carBounds: {
          min: new Vector3(-dims.width / 2, 0, -dims.length / 2),
          max: new Vector3(dims.width / 2, dims.height, dims.length / 2),
        },
        onSelect: (id) => selectComponent(id),
      });
      let labelLevel = 0;
      labels = {
        setVisibility(k) {
          labelLevel = k;
          const inXR = !!xrApi?.inXR;
          labels3d.setVisibility(inXR ? k : 0);
          callouts.setVisibility(inXR ? 0 : k);
        },
        setActive(id) {
          labels3d.setActive(id);
          callouts.setActive(id);
        },
        setFilter(ids) {
          labels3d.setFilter(ids);
          callouts.setFilter(ids);
        },
        setText(id, value) {
          labels3d.setText(id, value);
          callouts.setText(id, value);
        },
        refresh() {
          this.setVisibility(labelLevel);
        },
      };
      xray = createXRayMode(scene, {
        meshes: vehicle.meshes,
        states,
        internal: INTERNAL_COMPONENTS,
        labels,
        schematics,
        onChange: (on) => {
          hud.setXRay(on);
          vrMenu?.setXRayState(on);
        },
      });
      selection = createSelection(scene, {
        meshesByComponent: new Map(Object.values(componentItems).map((c) => [c.id, c.meshes])),
        states,
        onSelect: (id) => selectComponent(id),
        onHover: (id, x, y) => {
          canvas.style.cursor = id ? "pointer" : "";
          if (id) hud.showTooltip(getContent(id).title, x, y);
          else hud.hideTooltip();
        },
      });
    } catch (err) {
      console.error("[EV XR] Falha ao preparar os componentes:", err);
      hud.toast("Raio X e painéis indisponíveis neste modelo (veja o console).", 6000);
    }
  }

  /** Seleciona um componente: destaca, abre o painel e aproxima a câmera (desktop). */
  function selectComponent(id) {
    const item = componentItems[id];
    if (!item || !selection) return;
    userTookControl = true;
    const content = getContent(id);
    // Componentes internos só ficam visíveis com o raio X.
    if (INTERNAL_COMPONENTS.includes(id) && !xray.on) xray.set(true);
    showroom.turntable.halt();
    setTurntable(false);
    selection.setSelected(id);
    labels?.setActive(id);
    const world = Vector3.TransformCoordinates(item.center, turntable.getWorldMatrix());
    if (xrApi?.inXR) {
      panel.showVR(id, content, { illustrative: item.illustrative, camera: xrApi.camera, target: world });
      return;
    }
    hud.closeHelp();
    panel.showDesktop(id, content, { illustrative: item.illustrative });
    const size = Math.max(item.size.x, item.size.y, item.size.z);
    // Peças do tamanho do carro (carroceria, portas, rodas) não pedem aproximação.
    if (size < Math.min(2.6, dims.length * 0.55)) {
      hud.setActiveView(null);
      views.focusOn(world, size);
    }
  }

  function clearSelection() {
    selection?.setSelected(null);
    labels?.setActive(null);
    panel.hide();
  }

  function toggleXRay() {
    if (!xray) return hud.toast("Raio X indisponível: nenhum modelo 3D carregado.");
    userTookControl = true;
    xray.toggle();
  }

  // ------------------------------------------------------------------ C3) fluxo de energia e simulação (Etapa 3)
  const sim = createVehicleSimulation(SIMULATION);
  let flow = null;
  if (vehicle && componentItems.bateria) {
    try {
      flow = createEnergyFlow(scene, {
        parent: turntable,
        items: componentItems,
        dims,
        platformRadius: showroom.radius,
        floorY: -SHOWROOM.platformHeight,
        spawnLocal: showroom.spawn.subtract(turntable.position),
        addGlow: (meshes) => showroom.addGlow(meshes),
      });
    } catch (err) {
      console.error("[EV XR] Falha ao preparar o fluxo de energia:", err);
    }
  }

  const energy = { on: false, tab: "accel", chargeType: "ac", xrayBefore: false, lastUi: 0 };
  const energyModeKey = () => (energy.tab === "charge" ? `charge-${energy.chargeType}` : energy.tab);

  const energyPanel = createEnergyPanel(scene, {
    onTab: (tab) => setEnergyTab(tab, { user: true }),
    onHold(name, on) {
      if (!energy.on) return;
      if (on && name === "accel") setEnergyTab("accel");
      if (on && name === "brake" && sim.snapshot().speedKmh > 1) setEnergyTab("regen");
      sim.setInput(name, on);
    },
    onChargeType(type) {
      if (sim.snapshot().charging) return;
      energy.chargeType = type;
      sim.setChargeType(type);
      applyEnergyMode();
      energyPanel.update(sim.snapshot());
    },
    onChargeToggle() {
      if (sim.snapshot().charging) sim.stopCharging();
      else {
        const r = sim.startCharging(energy.chargeType);
        if (!r.ok) hud.toast(r.reason === "bateria-cheia" ? "A bateria já está carregada." : "Pare o veículo para recarregar.");
      }
      energyPanel.update(sim.snapshot()); // retorno imediato (sem esperar o próximo ciclo da interface)
    },
    onClose: () => setEnergy(false),
  });

  /** Troca o modo exibido. Pela aba (user), prepara a demonstração: 80 km/h para frear, parado para recarregar. */
  function setEnergyTab(tab, { user = false } = {}) {
    if (tab === energy.tab && !user) return;
    energy.tab = tab;
    if (user) {
      const snap = sim.snapshot();
      if (tab === "regen" && snap.speedKmh < 20) {
        sim.setSpeedKmh(80);
        hud.toast("Demonstração: veículo a 80 km/h. Segure “Frear” para regenerar energia.");
      }
      if (tab === "charge" && snap.speedKmh > 0.5) {
        sim.setSpeedKmh(0);
        hud.toast("Veículo estacionado para a recarga.");
      }
    }
    if (tab !== "charge" && sim.snapshot().charging) sim.stopCharging();
    applyEnergyMode();
  }

  function applyEnergyMode() {
    const key = energyModeKey();
    const mode = ENERGY_MODES[key];
    flow?.setMode(key);
    labels?.setFilter(mode.labels);
    for (const id of INTERNAL_COMPONENTS) labels?.setText(id, mode.rename[id] ?? null);
    energyPanel.setMode(energy.tab, key);
  }

  function setEnergy(on) {
    if (on === energy.on) return;
    if (on && !flow) return hud.toast("Fluxo de energia indisponível: nenhum modelo 3D carregado.");
    energy.on = on;
    userTookControl = true;
    if (on) {
      energy.xrayBefore = !!xray?.on;
      xray?.set(true); // o fluxo passa por dentro do carro
      clearSelection();
      setTurntable(false);
      alignTurntable(); // carregador externo alinhado com a porta de recarga
      applyEnergyMode();
      energyPanel.update(sim.snapshot());
      if (xrApi?.inXR) energyPanel.showVR(xrApi.camera);
      else energyPanel.showDesktop();
    } else {
      sim.releaseInputs();
      sim.stopCharging();
      flow?.setMode(null);
      flow?.setFlow(0);
      flow?.setWheelSpeed(0);
      labels?.setFilter(null);
      for (const id of INTERNAL_COMPONENTS) labels?.setText(id, null);
      if (!energy.xrayBefore) xray?.set(false);
      energyPanel.hideDesktop();
      energyPanel.hideVR();
    }
    hud.setEnergy(on);
    vrMenu?.setEnergyState(on);
  }

  scene.onBeforeRenderObservable.add(() => {
    if (!energy.on) return;
    const snap = sim.step(scene.getEngine().getDeltaTime() / 1000);
    // O modo exibido acompanha o que o veículo está fazendo (coerência entre simulação e fluxo).
    if (snap.state === "acelerando" && energy.tab !== "accel") setEnergyTab("accel");
    else if (snap.state === "regenerando" && energy.tab !== "regen") setEnergyTab("regen");
    const flowing =
      (snap.state === "acelerando" && energy.tab === "accel") ||
      (snap.state === "regenerando" && energy.tab === "regen") ||
      (snap.state === "recarregando" && energy.tab === "charge");
    flow?.setFlow(flowing ? snap.intensity : 0);
    flow?.setWheelSpeed(snap.speedKmh);
    const now = performance.now();
    if (now - energy.lastUi > 100) {
      energy.lastUi = now;
      energyPanel.update(snap);
    }
  });

  function toggleTurntable() {
    if (energy.on) return hud.toast("A plataforma fica parada durante o fluxo de energia.");
    userTookControl = true;
    setTurntable(!showroom.turntable.spinning);
  }

  hud.bind({
    onView(name) {
      if (xrApi?.inXR) return;
      userTookControl = true;
      if (showroom.turntable.spinning) hud.toast("Plataforma parada para mostrar a vista selecionada.");
      setTurntable(false);
      alignTurntable();
      hud.setActiveView(name);
      views.flyTo(name);
    },
    onToggleTurntable: toggleTurntable,
    onToggleXRay: toggleXRay,
    onToggleEnergy: () => setEnergy(!energy.on),
    onSelectComponent: (id) => selectComponent(id),
    onEscape: () => (panel.openId ? clearSelection() : energy.on && setEnergy(false)),
    onEnterVR: () => enterVR(),
  });
  // Ao arrastar/zoom manual, nenhuma vista predefinida fica marcada como ativa.
  for (const type of ["pointerdown", "wheel"]) {
    canvas.addEventListener(type, () => hud.setActiveView(null), { passive: true });
  }

  // Compila os shaders antes de revelar a cena (evita engasgo na abertura).
  await Promise.race([scene.whenReadyAsync(), new Promise((r) => setTimeout(r, 8000))]);
  hud.hideLoader();
  playIntro(scene, { camera, views, lighting, showroom, skip: URL_PARAMS.has("nointro") }).then(() => {
    if (userTookControl || xrApi?.inXR) return;
    hud.setActiveView("hero");
    setTurntable(true);
  });

  const adaptive = createAdaptiveQuality(engine, quality, (preset, fps) => {
    quality = preset;
    applyResolution(engine, preset);
    showroom.setMirrorEnabled(preset.mirror);
    showroom.setGlowEnabled(preset.glow);
    lighting.setShadowsEnabled(preset.shadows);
    hud.toast(`Qualidade ajustada para “${preset.label}” para manter a fluidez (${Math.round(fps)} fps).`, 4500);
  });
  adaptive.start(6500);

  // ------------------------------------------------------------------ D) WebXR
  let spinBeforeXR = false;

  async function enterVR() {
    if (!xrApi) return;
    try {
      await xrApi.enter();
    } catch (err) {
      console.error(err);
      hud.toast(`Não foi possível entrar em VR: ${err?.message || err}`, 5000);
    }
  }

  function onEnterXR() {
    adaptive.pause();
    views.cancel();
    clearSelection();
    selection?.clearHover();
    spinBeforeXR = showroom.turntable.spinning;
    setTurntable(false); // conforto: o carro começa parado em VR
    // Efeitos que custam um passe extra de renderização ficam só no desktop.
    showroom.setMirrorEnabled(false);
    showroom.setGlowEnabled(false);
    vrMenu.placeNearSpawn(showroom.spawn, showroom.lookAt);
    vrMenu.show();
    showroom.plaque.root.setEnabled(true);
    labels?.refresh(); // legendas 3D no headset
    if (energy.on) {
      energyPanel.hideDesktop();
      energyPanel.showVR(xrApi.camera);
    }
    hud.setVR("in-xr");
  }

  function onExitXR() {
    clearSelection();
    labels?.refresh(); // de volta às legendas em tela
    if (energy.on) {
      energyPanel.hideVR();
      energyPanel.showDesktop();
    }
    vrMenu.hide();
    showroom.plaque.root.setEnabled(false);
    showroom.setMirrorEnabled(quality.mirror);
    showroom.setGlowEnabled(quality.glow);
    hud.setVR("available");
    adaptive.resume();
    // O Babylon devolve a câmera orbital na posição em que o usuário estava em VR; voltamos à vista inicial.
    hud.setActiveView("hero");
    views.flyTo("hero");
    if (spinBeforeXR && !showroom.turntable.spinning) setTurntable(true);
  }

  function ensureVRMenu() {
    if (!vrMenu) {
      vrMenu = createVRMenu(scene, {
        onToggleXRay: toggleXRay,
        onToggleEnergy: () => setEnergy(!energy.on),
        onToggleTurntable: toggleTurntable,
        onReturnToSpawn: () => xrApi?.returnToSpawn(),
        onExitVR: () => xrApi?.exit(),
      });
      vrMenu.setTurntableState(showroom.turntable.spinning);
      vrMenu.setXRayState(!!xray?.on);
      vrMenu.setEnergyState(energy.on);
    }
    return vrMenu;
  }

  const support = await checkVRSupport();
  if (!support.supported) {
    hud.setVR("unavailable", support.reason);
  } else {
    try {
      ensureVRMenu();
      xrApi = await createXRExperience(scene, {
        floorMeshes: showroom.teleportFloors,
        isBlocker: (mesh) => !!mesh.metadata?.evxr?.vehicle || showroom.isTeleportBlocker(mesh),
        spawn: showroom.spawn,
        lookAt: showroom.lookAt,
        onEnter: onEnterXR,
        onExit: onExitXR,
      });
      setupXRInteractions(xrApi, { onSummonMenu: () => vrMenu.summon(xrApi.camera) });
      hud.setVR("available");
    } catch (err) {
      console.warn("[EV XR] WebXR indisponível:", err);
      xrApi = null;
      hud.setVR("error", `Falha ao iniciar o WebXR: ${err?.message || err}`);
    }
  }

  // ------------------------------------------------------------------ ferramentas de console
  const instrumentation = new SceneInstrumentation(scene);
  window.evxr = {
    scene,
    engine,
    vehicle,
    showroom,
    get xr() {
      return xrApi;
    },
    /** Testa uma orientação do modelo (graus). Grave o valor certo em config.js → VEHICLE_MODELS. */
    girarModelo(x = 0, y = 0, z = 0) {
      if (!vehicle) return console.warn("Nenhum veículo carregado.");
      const d = orientVehicle(vehicle, { x, y, z });
      console.info(`[EV XR] rotationDeg = { x: ${x}, y: ${y}, z: ${z} } →`, d, "(recarregue após gravar no config.js)");
      return d;
    },
    componentes() {
      console.table(summarizeComponents(vehicle));
    },
    /** Liga/desliga o raio X (sem argumento: alterna). */
    raioX(on) {
      if (on === undefined) toggleXRay();
      else xray?.set(on);
      return xray?.on;
    },
    /** Seleciona um componente pelo id (ex.: "bateria", "motor", "inversor"). */
    /** Liga/desliga o fluxo de energia; `aba`: "accel" | "regen" | "charge". */
    energia(on = !energy.on, aba) {
      setEnergy(on);
      if (on && aba) setEnergyTab(aba, { user: true });
      return energy.on;
    },
    simulacao: () => sim.snapshot(),
    selecionar(id) {
      if (!componentItems[id]) return console.warn("Disponíveis:", Object.keys(componentItems).join(", "));
      selectComponent(id);
    },
    /** Simula no desktop a chegada em VR: olhos a 1,6 m no ponto de partida, painel e placa visíveis. */
    previewVR(on = true) {
      const menu = ensureVRMenu();
      showroom.plaque.root.setEnabled(on);
      if (!on) {
        menu.hide();
        camera.fov = 0.8;
        camera.lowerRadiusLimit = Math.max(2.4, dims.length * 0.55);
        return views.flyTo("hero");
      }
      setTurntable(false);
      alignTurntable(10);
      views.cancel();
      menu.placeNearSpawn(showroom.spawn, showroom.lookAt);
      menu.show();
      camera.fov = 1.45; // campo de visão aproximado de um headset
      camera.lowerRadiusLimit = 0.5;
      camera.setTarget(showroom.lookAt.clone());
      camera.setPosition(showroom.spawn.add(new Vector3(0, 1.6, 0)));
    },
    qualidade(id) {
      const preset = getPreset(id);
      if (!preset.id) return console.warn('Use "low", "medium" ou "high".');
      quality = { ...preset, forced: true };
      applyResolution(engine, quality);
      showroom.setMirrorEnabled(quality.mirror);
      showroom.setGlowEnabled(quality.glow);
      lighting.setShadowsEnabled(quality.shadows);
      adaptive.stop();
      return quality.label;
    },
    info() {
      return {
        modelo: vehicle?.model.url ?? "nenhum",
        dimensoes: vehicle?.dims,
        malhas: vehicle?.optimization,
        qualidade: quality.id,
        fps: Math.round(engine.getFps()),
        drawCalls: instrumentation.drawCallsCounter.current,
        vr: support,
      };
    },
  };

  if (URL_PARAMS.has("debug")) startDebugOverlay(engine, instrumentation, () => quality);
}

function logVehicle(vehicle) {
  const { dims, optimization, model } = vehicle;
  console.info(
    `[EV XR] ${model.url}: ${dims.length.toFixed(2)} × ${dims.width.toFixed(2)} × ${dims.height.toFixed(2)} m (C × L × A); ` +
      `malhas ${optimization.meshesBefore} → ${optimization.meshesAfter} (estratégia "${optimization.strategy}").`,
  );
  console.table(summarizeComponents(vehicle));
}

function startDebugOverlay(engine, instrumentation, getQuality) {
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:16px;bottom:96px;z-index:5;padding:6px 10px;border-radius:8px;font:12px/1.4 monospace;" +
    "color:#00E5FF;background:rgba(8,17,31,.75);pointer-events:none;white-space:pre";
  document.body.append(box);
  setInterval(() => {
    box.textContent =
      `fps ${engine.getFps().toFixed(0)} · draw calls ${instrumentation.drawCallsCounter.current}\n` +
      `qualidade ${getQuality().id} · escala ${engine.getHardwareScalingLevel().toFixed(2)}`;
  }, 500);
}
