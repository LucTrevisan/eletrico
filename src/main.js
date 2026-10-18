/**
 * EV Experience XR — ponto de entrada.
 *   Etapa 1: showroom, carro, câmera, luzes e VR.
 *   Etapa 2: raio X, identificação de componentes e painéis educativos.
 *   Etapa 3: fluxo de energia (aceleração, regeneração, recarga CA/CC) e simulação.
 *   Etapa 4: exploded view, portas, seleção aprimorada, hand tracking e interface retrátil.
 *   Etapa 5: desempenho (fusão de malhas, texturas, WebXR sob demanda), materiais, controles VR e responsividade.
 *
 * A inicialização é dividida em seções independentes, cada uma com seu próprio
 * tratamento de erro, para que uma falha (ex.: WebXR indisponível) nunca impeça
 * a visualização 3D:
 *   A)  motor, cena, câmera e luzes — o render loop começa imediatamente
 *   B)  carregamento do veículo
 *   C)  showroom, vistas e HUD
 *   C2) componentes: raio X, legendas, seleção e painéis
 *   C3) fluxo de energia e simulação
 *   C4) exploded view e portas
 *   D)  WebXR (somente se houver suporte)
 */
import "./styles/main.css";
import { SceneInstrumentation, TransformNode, Vector3 } from "./babylon.js";
import { SHOWROOM, SIMULATION, URL_PARAMS, VEHICLE, VEHICLE_MODELS } from "./config.js";
import { applyResolution, createCamera, createEngine, createScene, createViewController } from "./scene/createScene.js";
import { createShowroom } from "./scene/environment.js";
import { createCabinView, findDriverSeat } from "./scene/cabinView.js";
import { createLighting } from "./scene/lighting.js";
import { playIntro, tween } from "./scene/presentation.js";
import { createAdaptiveQuality, detectQuality, getPreset } from "./scene/quality.js";
import { loadVehicle, orientVehicle, resolveModel, tuneMaterials } from "./vehicle/loadVehicle.js";
import {
  INTERNAL_COMPONENTS,
  computeComponentLayout,
  organizeVehicle,
  summarizeComponents,
} from "./vehicle/components.js";
import { getContent } from "./vehicle/componentContent.js";
import { createDoors } from "./vehicle/doors.js";
import { createExplodedView } from "./vehicle/explodedView.js";
import { createMaterialStates } from "./vehicle/materialStates.js";
import { createSchematics } from "./vehicle/schematics.js";
import { createSelection } from "./vehicle/selection.js";
import { createXRayMode } from "./vehicle/xrayMode.js";
import { createComponentCallouts } from "./ui/componentCallouts.js";
import { createComponentLabels, createFloatingLabels } from "./ui/componentLabels.js";
import { createComponentPanel } from "./ui/componentPanel.js";
import { checkARSupport, checkVRSupport } from "./xr/support.js";
import { createHud } from "./ui/hud.js";
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
  // Celular (em pé ou deitado): legendas sob demanda, gavetas recolhidas e enquadramentos próprios.
  const mobileUI = () => hud.isCompactLayout();
  const portraitUI = () => hud.isNarrowLayout();
  const hinted = new Set();
  const mobileHint = (key, text) => {
    if (!mobileUI() || hinted.has(key)) return;
    hinted.add(key);
    hud.toast(text, 4000);
  };

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
  let seat = null; // banco do motorista (vista interna), medido antes da fusão de malhas
  try {
    hud.setLoaderStatus("Localizando o modelo 3D…");
    const model = await resolveModel(VEHICLE_MODELS);
    hud.setLoaderStatus(`Carregando ${model.label}${model.provisional ? " (modelo provisório)" : ""}…`);
    vehicle = await loadVehicle(scene, model, { parent: turntable, onProgress: (f) => hud.setProgress(f) });
    hud.setProgress(1);
    hud.setLoaderStatus("Preparando materiais e iluminação…");
    tuneMaterials(vehicle, quality);
    seat = findDriverSeat(vehicle, turntable, vehicle.dims);
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
  // Realidade aumentada: o showroom inteiro some (fica o carro e a sombra de contato sob ele).
  const arHiddenMeshes = scene.meshes.filter((m) => !m.metadata?.evxr && m.name !== "contact-shadow" && m.name !== "scan-ring");
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
  let turntableBaseYaw = 0; // RA: orientação em que o usuário posicionou o carro
  function alignTurntable(duration = 1100) {
    showroom.turntable.halt();
    const from = turntable.rotation.y;
    const to = turntableBaseYaw + Math.round((from - turntableBaseYaw) / (Math.PI * 2)) * Math.PI * 2;
    if (Math.abs(to - from) < 1e-3) return;
    tween(scene, { duration, onUpdate: (t) => (turntable.rotation.y = from + (to - from) * t) });
  }

  // ------------------------------------------------------------------ C2) componentes (Etapa 2)
  let xray = null;
  let selection = null;
  let labels = null;
  let doors = null;
  let schematics = null;
  let layoutAxles = null;
  let explode = null; // C4
  let explodeLabels = null; // C4
  const panel = createComponentPanel(scene, {
    onClose: () => clearSelection(),
    onAction: (action) => action === "doors" && toggleAllDoors(),
  });
  const componentItems = {}; // id → { meshes, center (local do prato), size, illustrative }

  if (vehicle) {
    try {
      // ?ilustrativo: esconde os componentes internos reais para testar as representações ilustrativas.
      if (URL_PARAMS.has("ilustrativo")) {
        for (const m of vehicle.meshes) if (INTERNAL_COMPONENTS.includes(m.metadata.evxr.component)) m.setEnabled(false);
      }
      const states = createMaterialStates(vehicle.meshes.filter((m) => m.isEnabled()));
      const { components, axles } = computeComponentLayout(vehicle, turntable);
      layoutAxles = axles;
      const missing = INTERNAL_COMPONENTS.filter((id) => !components[id]);
      schematics = createSchematics(scene, {
        parent: turntable,
        dims,
        axles,
        missing,
        drivetrain: vehicle.model.drivetrain,
      });
      Object.assign(componentItems, components, schematics.items);
      if (missing.length) console.info(`[EV XR] Ausentes no modelo (exibidos como ilustrativos): ${missing.join(", ")}`);
      doors = createDoors(scene, { items: componentItems, parent: turntable });

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
        // Celular: só a legenda da peça tocada. No fluxo de energia elas ficam, mas somem enquanto
        // Acelerar/Frear está pressionado, para o carro e as rodas ficarem à vista.
        onDemand: () => mobileUI() && (!energy.on || energy.holding),
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
          if (on && !energy.on) mobileHint("legendas", "Toque numa peça para ver o nome dela.");
        },
      });
      selection = createSelection(scene, {
        meshesByComponent: new Map(Object.values(componentItems).map((c) => [c.id, c.meshes])),
        states,
        onSelect: (id, mesh) => selectComponent(id, mesh),
        // Celular: tocar fora das peças fecha a seleção (e a legenda dela).
        onEmptyTap: () => mobileUI() && panel.openId && clearSelection(),
        onHover: (id, x, y) => {
          if (cabin?.active) id = null;
          canvas.style.cursor = id ? "pointer" : "";
          if (!id) return hud.hideTooltip();
          const doorHint = id === "portas" && doors && !xray?.on;
          hud.showTooltip(doorHint ? "Porta · clique para abrir ou fechar" : getContent(id).title, x, y);
        },
      });
    } catch (err) {
      console.error("[EV XR] Falha ao preparar os componentes:", err);
      hud.toast("Raio X e painéis indisponíveis neste modelo (veja o console).", 6000);
    }
  }

  /** Centro atual (mundo) de um componente — acompanha portas abertas e a vista explodida. */
  function currentWorldCenter(item, picked) {
    // Peça ilustrativa com mais de uma parte (ex.: e-Axle dianteiro e traseiro no AWD): foca a parte
    // clicada ou, vindo da legenda, a principal — nunca o meio do caminho entre elas.
    const meshes = item.parts?.length > 1 ? [item.meshes.includes(picked) ? picked : item.parts[0].mesh] : item.meshes;
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of meshes) {
      if (!m.isEnabled()) continue;
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      min.minimizeInPlace(b.minimumWorld);
      max.maximizeInPlace(b.maximumWorld);
    }
    return Number.isFinite(min.x) ? Vector3.Center(min, max) : Vector3.TransformCoordinates(item.center, turntable.getWorldMatrix());
  }

  /** Conteúdo educativo + nota do veículo exibido (config: notes). */
  function contentFor(id) {
    const content = getContent(id);
    const note = vehicle?.model.notes?.[id];
    return note ? { ...content, modelNote: { label: `No ${vehicle.model.label}`, text: note } } : content;
  }

  const doorActions = () => (doors ? [{ id: "doors", label: doors.anyOpen ? "Fechar portas" : "Abrir portas" }] : []);

  function toggleAllDoors() {
    if (!doors) return hud.toast("Este modelo não tem portas separadas para abrir.");
    if (explode?.exploded) setExploded(false);
    const open = doors.toggleAll();
    if (panel.openId === "portas") panel.setActions(doorActions());
    hud.toast(open ? "Portas abertas." : "Portas fechadas.", 1600);
  }

  /** Seleciona um componente: destaca, abre o painel e aproxima a câmera (desktop). */
  function selectComponent(id, mesh) {
    const item = componentItems[id];
    if (!item || !selection || cabin?.active || cabinXR?.seated) return; // dentro do carro: só olhar ao redor
    if (ar?.consumePlacementTap()) return; // RA: soltar o toque que posicionou o carro não seleciona peça
    userTookControl = true;
    // Portas: o clique (mouse, toque, gatilho ou pinça) abre/fecha a porta clicada.
    if (id === "portas" && doors && mesh && !mesh.metadata?.evxr?.labelFor && !explode?.exploded) {
      const open = doors.toggleFor(mesh);
      if (open !== null) {
        if (panel.openId === "portas") panel.setActions(doorActions());
        return;
      }
    }
    const content = contentFor(id);
    const actions = id === "portas" ? doorActions() : [];
    // Componentes internos só ficam visíveis com o raio X (ou com o carro explodido).
    if (INTERNAL_COMPONENTS.includes(id) && !xray.on && !explode?.exploded) xray.set(true);
    showroom.turntable.halt();
    setTurntable(false);
    selection.setSelected(id);
    labels?.setActive(id);
    explodeLabels?.setActive(id);
    const world = currentWorldCenter(item, mesh);
    if (xrApi?.inXR && !xrApi.domOverlay) {
      panel.showVR(id, content, { illustrative: item.illustrative, actions, camera: xrApi.camera, target: world });
      return;
    }
    hud.closeHelp();
    // Celular com o carro explodido: o toque mostra o nome (legenda + gaveta recolhida) sem tirar a
    // visão de conjunto; a alça da gaveta abre os detalhes.
    const peek = mobileUI() && !!explode?.exploded;
    panel.showDesktop(id, content, { illustrative: item.illustrative, actions, collapsed: peek });
    const size = Math.max(item.size.x, item.size.y, item.size.z);
    // Peças do tamanho do carro (carroceria, portas, rodas) não pedem aproximação.
    if (!peek && !xrApi?.inXR && size < Math.min(2.6, dims.length * 0.55)) {
      hud.setActiveView(null);
      views.setScreenInsets(hud.getInsets()); // o painel acabou de abrir: a área livre já muda
      views.focusOn(world, size, { maxBeta: INTERNAL_COMPONENTS.includes(id) ? 0.78 : null });
    }
  }

  function clearSelection() {
    selection?.setSelected(null);
    labels?.setActive(null);
    explodeLabels?.setActive(null);
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
        axles: layoutAxles,
        chargePort: vehicle.model.chargePort,
        platformRadius: showroom.radius,
        floorY: -SHOWROOM.platformHeight,
        spawnLocal: showroom.spawn.subtract(turntable.position),
        addGlow: (meshes) => showroom.addGlow(meshes),
      });
    } catch (err) {
      console.error("[EV XR] Falha ao preparar o fluxo de energia:", err);
    }
  }

  const energy = { on: false, tab: "accel", chargeType: "ac", xrayBefore: false, lastUi: 0, hold: { accel: false, brake: false }, holding: false };
  const energyModeKey = () => (energy.tab === "charge" ? `charge-${energy.chargeType}` : energy.tab);

  const energyPanel = createEnergyPanel(scene, {
    onTab: (tab) => setEnergyTab(tab, { user: true }),
    onHold(name, on) {
      energy.hold[name] = on;
      energy.holding = energy.hold.accel || energy.hold.brake;
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
    const prev = energy.tab;
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
    if (!energy.on) return;
    if (tab === "charge" && (user || prev !== "charge")) frameCharging();
    else if (prev === "charge" && tab !== "charge" && !xrApi?.inXR) portraitUI() ? frameDriving() : views.flyTo("hero");
  }

  /**
   * Celular em pé: o carro ocupa a área livre acima da gaveta de energia (em vez de ficar pequeno no topo),
   * visto de frente-esquerda para as rodas e o e-Axle dianteiro aparecerem.
   */
  function frameDriving() {
    if (xrApi?.inXR) return;
    const o = turntable.getAbsolutePosition();
    const min = new Vector3(-dims.width / 2, 0, -dims.length / 2).addInPlace(o);
    const max = new Vector3(dims.width / 2, dims.height, dims.length / 2).addInPlace(o);
    hud.setActiveView(null);
    views.setScreenInsets(hud.getInsets()); // a gaveta acabou de abrir
    views.frameBox(min, max, { alpha: Math.PI / 2 + 0.42, beta: 1.24, free: true, margin: 1, depth: 0.12 });
  }

  /** Desktop: enquadra carro + carregador externo lado a lado (o prato já está alinhado em 0°). */
  function frameCharging() {
    if (xrApi?.inXR || !flow) return;
    const o = turntable.getAbsolutePosition();
    const st = flow.stationLocal;
    const min = new Vector3(Math.min(-dims.width / 2, st.x - 0.35), 0, Math.min(-dims.length / 2, st.z - 0.35)).addInPlace(o);
    const max = new Vector3(Math.max(dims.width / 2, st.x + 0.35), Math.max(dims.height, 1.8), Math.max(dims.length / 2, st.z + 0.35)).addInPlace(o);
    // Câmera a ~57° da direção do carregador, do lado mais próximo da vista inicial.
    const phi = Math.atan2(st.z, st.x);
    const hero = views.views.hero.alpha;
    const gap = (a) => Math.abs(Math.atan2(Math.sin(a - hero), Math.cos(a - hero)));
    const alpha = [phi - 1, phi + 1].sort((a, b) => gap(a) - gap(b))[0];
    hud.setActiveView(null);
    views.frameBox(min, max, { alpha });
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
      if (explode?.exploded) setExploded(false); // o fluxo usa as posições montadas
      doors?.closeAll();
      energy.xrayBefore = !!xray?.on;
      xray?.set(true); // o fluxo passa por dentro do carro
      clearSelection();
      setTurntable(false);
      alignTurntable(); // carregador externo alinhado com a porta de recarga
      applyEnergyMode();
      energyPanel.update(sim.snapshot());
      if (xrApi?.inXR && !xrApi.domOverlay) energyPanel.showVR(xrApi.camera);
      else energyPanel.showDesktop(); // inclui o celular em RA (painel HTML sobre a câmera)
      if (energy.tab === "charge") frameCharging();
      else if (portraitUI()) frameDriving();
      else if (!xrApi?.inXR && views.current == null) views.flyTo("hero"); // vinha do zoom numa peça: o fluxo percorre o carro todo
    } else {
      if (energy.tab === "charge" && !xrApi?.inXR) views.flyTo("hero");
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

  // ------------------------------------------------------------------ C4) exploded view (Etapa 4)
  /** Legendas da vista explodida: âncoras móveis no grupo de peças mais visível (frente-esquerda). */
  const EXPLODE_LABEL_IDS = ["carroceria", "portas", "interior", "rodas", "chassi", ...INTERNAL_COMPONENTS];
  function makeAnchors(ids) {
    const list = ids
      .filter((id) => componentItems[id])
      .map((id) => ({
        id,
        short: getContent(id).short,
        color: getContent(id).color,
        illustrative: !!componentItems[id].illustrative,
        meshes: componentItems[id].meshes,
        center: new Vector3(),
      }));
    const tmpMin = new Vector3();
    const tmpMax = new Vector3();
    function update() {
      const inv = turntable.getWorldMatrix().clone().invert();
      for (const a of list) {
        const groups = new Map();
        for (const m of a.meshes) {
          if (!m.isEnabled()) continue;
          const k = m.parent?.uniqueId ?? 0;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(m);
        }
        let best = null;
        for (const g of groups.values()) {
          tmpMin.setAll(Infinity);
          tmpMax.setAll(-Infinity);
          for (const m of g) {
            m.computeWorldMatrix(true);
            const b = m.getBoundingInfo().boundingBox;
            tmpMin.minimizeInPlace(b.minimumWorld);
            tmpMax.maximizeInPlace(b.maximumWorld);
          }
          const c = Vector3.TransformCoordinates(Vector3.Center(tmpMin, tmpMax), inv);
          if (!best || c.x - c.z < best.x - best.z) best = c;
        }
        if (best) a.center.copyFrom(best);
      }
    }
    update();
    return { list, update };
  }

  if (vehicle && componentItems.carroceria) {
    try {
      explode = createExplodedView(scene, { vehicle, parent: turntable, dims, schematics });
      const anchors = makeAnchors(EXPLODE_LABEL_IDS);
      const callouts = createComponentCallouts(scene, {
        items: anchors.list,
        parent: turntable,
        carBounds: {
          min: new Vector3(-dims.width / 2 - 0.6, 0, -dims.length / 2 - 0.7),
          max: new Vector3(dims.width / 2 + 0.6, dims.height + 1.45, dims.length / 2 + 0.7),
        },
        onSelect: (id) => selectComponent(id),
        onDemand: mobileUI, // celular: só o nome da peça tocada (12 legendas não cabem na tela)
      });
      const floating = createFloatingLabels(scene, { items: anchors.list, parent: turntable });
      let level = 0;
      explodeLabels = {
        setVisibility(k) {
          level = k;
          const inXR = !!xrApi?.inXR;
          floating.setVisibility(inXR ? k : 0);
          callouts.setVisibility(inXR ? 0 : k);
        },
        setActive: (id) => callouts.setActive(id),
        refresh() {
          this.setVisibility(level);
        },
      };
      // Só recalcula as âncoras enquanto as peças se movem (custo zero com o carro parado).
      scene.onBeforeRenderObservable.add(() => {
        if (!explode.animating) return;
        anchors.update();
        floating.update();
      });
    } catch (err) {
      console.error("[EV XR] Falha ao preparar a vista explodida:", err);
    }
  }

  function setExploded(on) {
    if (!explode) return hud.toast("Vista explodida indisponível neste modelo.");
    if (on === explode.exploded) return;
    userTookControl = true;
    if (on && cabinXR?.seated) cabinXR.exit(); // VR: as peças se afastam — o usuário sai do carro antes
    if (on && energy.on) setEnergy(false);
    clearSelection();
    doors?.closeAll();
    explode.set(on);
    labels?.setFilter(on ? [] : null); // as legendas do raio X dão lugar às da vista explodida
    explodeLabels?.setVisibility(on ? 1 : 0);
    hud.setExplode(on);
    vrMenu?.setExplodeState(on);
    if (on) mobileHint("legendas", "Toque numa peça para ver o nome dela.");
    if (!xrApi?.inXR) {
      hud.setActiveView(null);
      views.flyTo(views.current ?? "hero", { radiusScale: on ? 1.32 : 1 });
    }
  }

  function toggleTurntable() {
    if (energy.on) return hud.toast("A plataforma fica parada durante o fluxo de energia.");
    if (cabinXR?.seated) return; // sentado no carro, a plataforma não gira
    userTookControl = true;
    setTurntable(!showroom.turntable.spinning);
  }

  // ------------------------------------------------------------------ C5) vista interna (dentro do carro)
  // Desktop/celular: câmera própria que entra pela porta do motorista. VR: ver xr/cabinXR.js.
  let cabin = null;
  let cabinXR = null; // criado junto com o WebXR
  let ar = null; // realidade aumentada (xr/arMode.js, criado junto com o WebXR se houver suporte)
  const driverDoor = seat && doors ? doors.nearest(seat.eye) : null;
  if (vehicle && seat) {
    cabin = createCabinView(scene, {
      mainCamera: camera,
      canvas,
      parent: turntable,
      seat,
      dims,
      door: driverDoor,
      views,
      onChange: (state) => {
        hud.setCabin(state);
        // Dentro do carro, glow e espelho da plataforma não acrescentam nada (e o brilho do anel de LED
        // apareceria por cima do painel): desligados até a saída — também poupa dois passes de renderização.
        if (state === "entering") {
          showroom.setGlowEnabled(false);
          showroom.setMirrorEnabled(false);
        }
        if (state === "in" && !mobileUI()) hud.toast("As setas também giram o olhar · Esc sai do carro.", 3500);
        if (state === "out") {
          showroom.setGlowEnabled(quality.glow);
          showroom.setMirrorEnabled(quality.mirror);
          hud.setActiveView("hero");
        }
      },
    });
  }

  function enterCabin() {
    if (!cabin || cabin.active || xrApi?.inXR) return;
    userTookControl = true;
    if (energy.on) setEnergy(false);
    if (explode?.exploded) setExploded(false);
    clearSelection();
    xray?.set(false);
    hud.closeHelp();
    hud.setActiveView(null);
    views.cancel();
    setTurntable(false);
    alignTurntable(); // a saída termina na vista inicial, com o carro de frente-esquerda
    cabin.enter();
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
    onToggleExplode: () => setExploded(!explode?.exploded),
    onToggleDoors: toggleAllDoors,
    onSelectComponent: (id) => selectComponent(id),
    onEscape: () => (panel.openId ? clearSelection() : energy.on && setEnergy(false)),
    onEnterVR: () => enterVR(),
    onEnterCabin: enterCabin,
    onEnterAR: () => enterAR(),
    onARAction(action) {
      if (!ar?.active) return;
      if (action === "reposition") ar.reposition();
      else if (action === "scale") ar.toggleScale();
      else if (action === "xray") toggleXRay();
      else if (action === "energy") setEnergy(!energy.on);
      else if (action === "explode") setExploded(!explode?.exploded);
      else if (action === "doors") toggleAllDoors();
      else if (action === "exit") xrApi?.exit();
      syncARBar();
    },
    onExitCabin: () => cabin?.exit(),
  });
  hud.setCredit(vehicle?.model.credit);

  // Painéis abertos deslocam o carro para o centro da área livre da tela (consulta leve, 4×/s).
  setInterval(() => {
    if (!xrApi?.inXR) views.setScreenInsets(hud.getInsets());
    hud.setCabinAvailable(
      !!cabin && cabin.state === "out" && !!doors?.anyOpen && !explode?.exploded && !energy.on && !xrApi?.inXR,
    );
    syncARBar();
  }, 250);
  /** Barra de RA do celular: estado dos botões (também chamado logo após cada ação). */
  function syncARBar() {
    if (ar?.active) hud.setARState({ xray: !!xray?.on, energy: energy.on, explode: !!explode?.exploded, scale: ar.scale });
  }
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
    showroom.setMirrorEnabled(preset.mirror && !cabin?.active); // dentro do carro ficam desligados
    showroom.setGlowEnabled(preset.glow && !cabin?.active);
    lighting.setShadowsEnabled(preset.shadows);
    hud.toast(`Qualidade ajustada para “${preset.label}” para manter a fluidez (${Math.round(fps)} fps).`, 4500);
  });
  adaptive.start(6500);

  // ------------------------------------------------------------------ D) WebXR
  let spinBeforeXR = false;

  async function enterAR() {
    if (!ar || xrApi?.inXR) return;
    cabin?.exitNow();
    try {
      await ar.enter();
    } catch (err) {
      console.error(err);
      hud.toast(`Não foi possível entrar em RA: ${err?.message || err}`, 5000);
    }
  }

  async function enterVR() {
    if (!xrApi) return;
    cabin?.exitNow(); // a câmera do showroom precisa estar ativa ao entrar (e ao voltar) do VR
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
    explodeLabels?.refresh();
    if (energy.on) {
      energyPanel.hideDesktop();
      energyPanel.showVR(xrApi.camera);
    }
    hud.setVR("in-xr");
    hud.setXRSession(true);
    if (xrApi.isAR) onEnterAR();
  }

  /** Complementa onEnterXR na realidade aumentada (o resto da sessão é igual à VR). */
  function onEnterAR() {
    ar.onEnter();
    hud.setAR(true, { overlay: xrApi.domOverlay });
    if (xrApi.domOverlay && energy.on) {
      energyPanel.hideVR();
      energyPanel.showDesktop();
    }
  }

  function onExitXR() {
    if (ar?.active) {
      ar.onExit();
      hud.setAR(false);
      turntableBaseYaw = 0;
    }
    cabinXR?.reset();
    hud.setXRSession(false);
    clearSelection();
    labels?.refresh(); // de volta às legendas em tela
    explodeLabels?.refresh();
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

  /** O painel de controle VR (e a GUI do Babylon) só é baixado em dispositivos com VR. */
  let vrMenuPromise = null;
  function ensureVRMenu() {
    vrMenuPromise ??= import("./ui/vrMenu.js").then(({ createVRMenu }) => {
      vrMenu = createVRMenu(scene, {
        onToggleXRay: toggleXRay,
        onToggleEnergy: () => setEnergy(!energy.on),
        onToggleExplode: () => setExploded(!explode?.exploded),
        onToggleTurntable: toggleTurntable,
        onReturnToSpawn: () => {
          if (ar?.active) return ar.reposition(); // RA: o botão vira "Reposicionar carro"
          cabinXR?.reset(); // sentado no carro: volta a ficar em pé
          xrApi?.returnToSpawn();
        },
        onExitVR: () => xrApi?.exit(),
      });
      vrMenu.setTurntableState(showroom.turntable.spinning);
      vrMenu.setXRayState(!!xray?.on);
      vrMenu.setEnergyState(energy.on);
      vrMenu.setExplodeState(!!explode?.exploded);
      return vrMenu;
    });
    return vrMenuPromise;
  }

  const [support, arSupport] = await Promise.all([checkVRSupport(), checkARSupport()]);
  if (!support.supported && !arSupport.supported) {
    hud.setVR("unavailable", support.reason);
  } else {
    try {
      // WebXR e o painel 3D (Babylon GUI) só são baixados aqui, em dispositivos com VR ou RA.
      const [{ createXRExperience }, { setupXRInteractions }, { createCabinXR }, arModule] = await Promise.all([
        import("./xr/xrExperience.js"),
        import("./xr/interactions.js"),
        import("./xr/cabinXR.js"),
        arSupport.supported ? import("./xr/arMode.js") : null,
        ensureVRMenu(),
      ]);
      xrApi = await createXRExperience(scene, {
        floorMeshes: showroom.teleportFloors,
        isBlocker: (mesh) => !!mesh.metadata?.evxr?.vehicle || showroom.isTeleportBlocker(mesh),
        spawn: showroom.spawn,
        lookAt: showroom.lookAt,
        onEnter: onEnterXR,
        onExit: onExitXR,
      });
      setupXRInteractions(xrApi, {
        onSummonMenu: () => vrMenu.summon(xrApi.camera),
        onInputModeChange: (mode) => vrMenu.setInputMode(mode),
      });
      if (seat && driverDoor) {
        cabinXR = createCabinXR(scene, {
          xrApi,
          parent: turntable,
          seat,
          dims,
          door: driverDoor,
          raycastBlockers: () => scene.meshes.filter((m) => m.metadata?.evxr),
          menuMesh: vrMenu.mesh,
          isAllowed: () => !ar?.active,
          onSeatedChange: (on) => {
            if (!on) return;
            clearSelection();
            showroom.turntable.halt();
            setTurntable(false);
          },
        });
      }
      if (arModule) {
        ar = arModule.createARMode(scene, {
          xrApi,
          turntable,
          dims,
          hiddenMeshes: arHiddenMeshes,
          overlayRoot: document.getElementById("hud"),
          vrMenu,
          onPlacedChange(placed, yaw) {
            turntableBaseYaw = placed ? yaw : 0;
            if (!placed) clearSelection(); // reposicionando: o carro some até o novo toque
            if (placed && !xrApi.domOverlay) vrMenu.setTurntableState(showroom.turntable.spinning);
          },
          onScaleChange: () => syncARBar(),
          onStatus(text) {
            hud.setARStatus(text);
            if (!xrApi.domOverlay && !ar?.placed) vrMenu.setStatus(text); // Quest: dica no painel 3D
          },
        });
      }
      // Botões: VR só com suporte a VR (o celular com ARCore pode ter só RA).
      hud.setVR(support.supported ? "available" : "unavailable", support.reason);
      hud.setARAvailable(!!ar);
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
    /** Liga/desliga a vista explodida (sem argumento: alterna). */
    explodir(on = !explode?.exploded) {
      setExploded(on);
      return explode?.exploded;
    },
    /** Abre/fecha todas as portas. */
    portas: () => toggleAllDoors(),
    /** Entra (true) ou sai (false) do carro na vista interna. */
    interior(on = !cabin?.active) {
      if (on) enterCabin();
      else cabin?.exit();
      return cabin?.state;
    },
    /** VR: senta no banco do motorista (true) ou sai do carro (false). */
    sentarVR(on = !cabinXR?.seated) {
      if (on) cabinXR?.enter();
      else cabinXR?.exit();
      return cabinXR?.seated;
    },
    /** Banco do motorista detectado (local do prato). */
    banco: () => seat && { olhos: seat.eye.asArray().map((v) => +v.toFixed(3)), lado: seat.side, volante: seat.steering?.asArray().map((v) => +v.toFixed(3)) },
    /** Liga/desliga o fluxo de energia; `aba`: "accel" | "regen" | "charge". */
    energia(on = !energy.on, aba) {
      setEnergy(on);
      if (on && aba) setEnergyTab(aba, { user: true });
      return energy.on;
    },
    simulacao: () => sim.snapshot(),
    /** Seleciona um componente pelo id (ex.: "bateria", "motor", "inversor"); null limpa a seleção. */
    selecionar(id) {
      if (id == null) return clearSelection();
      if (!componentItems[id]) return console.warn("Disponíveis:", Object.keys(componentItems).join(", "));
      selectComponent(id);
    },
    /** Simula no desktop a chegada em VR: olhos a 1,6 m no ponto de partida, painel e placa visíveis. */
    async previewVR(on = true) {
      const menu = await ensureVRMenu();
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
