import { Matrix, Vector3 } from "../babylon.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Legendas do raio X no desktop/celular, em coordenadas de tela: duas colunas
 * (à esquerda e à direita do carro), ordenadas pela altura do componente, com linha
 * de chamada até ele. Nunca se sobrepõem, têm tamanho fixo e são botões clicáveis
 * (acessíveis por teclado). Em VR usam-se as legendas 3D (ui/componentLabels.js).
 *
 * items: [{ id, short, color, illustrative, center (local do prato) }]
 * onDemand(): quando devolve true (celular), só aparece a legenda do componente tocado — nenhuma
 * enquanto nada estiver selecionado (tela pequena demais para todas de uma vez).
 */
export function createComponentCallouts(scene, { items, parent, carBounds, onSelect, onDemand }) {
  const hud = document.getElementById("hud");
  const canvas = scene.getEngine().getRenderingCanvas();

  const root = document.createElement("div");
  root.className = "callouts";
  root.hidden = true;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("callout-lines");
  root.append(svg);
  hud.prepend(root);

  const entries = items.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "callout";
    button.style.setProperty("--c", item.color);
    const text = document.createElement("span");
    text.textContent = item.short;
    button.append(text);
    if (item.illustrative) {
      const tag = document.createElement("small");
      tag.textContent = "ilustrativo";
      button.append(tag);
    }
    button.addEventListener("click", () => onSelect?.(item.id));
    root.append(button);
    const line = document.createElementNS(SVG_NS, "line");
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("r", "4");
    for (const el of [line, dot]) el.style.setProperty("--c", item.color);
    svg.append(line, dot);
    return { ...item, button, text, line, dot, world: new Vector3(), screen: { x: 0, y: 0, z: 0 } };
  });

  // Cantos da caixa do carro (local do prato) — para saber onde o carro está na tela.
  const corners = [];
  for (const x of [carBounds.min.x, carBounds.max.x])
    for (const y of [carBounds.min.y, carBounds.max.y])
      for (const z of [carBounds.min.z, carBounds.max.z]) corners.push(new Vector3(x, y, z));
  const carCenter = Vector3.Center(carBounds.min, carBounds.max);
  const tmpWorld = new Vector3();

  let visibility = 0;
  let activeId = null;
  let filter = null; // Set de ids visíveis (null = todos)

  function project(local, out) {
    const engine = scene.getEngine();
    const cam = scene.activeCamera;
    const rw = engine.getRenderWidth();
    const rh = engine.getRenderHeight();
    Vector3.TransformCoordinatesToRef(local, parent.getWorldMatrix(), tmpWorld);
    const p = Vector3.Project(tmpWorld, Matrix.IdentityReadOnly, scene.getTransformMatrix(), cam.viewport.toGlobal(rw, rh));
    out.x = (p.x * canvas.clientWidth) / rw;
    out.y = (p.y * canvas.clientHeight) / rh;
    out.z = p.z;
    return out;
  }

  const rectOf = (id) => {
    const el = document.getElementById(id);
    return el && !el.hidden && el.offsetParent !== null ? el.getBoundingClientRect() : null;
  };

  function layoutColumn(list, side, carBox, limits) {
    list.sort((a, b) => a.screen.y - b.screen.y);
    const gap = 8;
    // de cima para baixo, depois de baixo para cima, respeitando os limites verticais
    let prevBottom = limits.top;
    for (const e of list) {
      if (!e.measured && e.button.offsetWidth) {
        e.w = e.button.offsetWidth;
        e.h = e.button.offsetHeight;
        e.measured = true;
      }
      e.w ??= 120;
      e.h ??= 30;
      e.y = Math.max(e.screen.y - e.h / 2, prevBottom + gap);
      prevBottom = e.y + e.h;
    }
    let nextTop = limits.bottom;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.y = Math.min(e.y, nextTop - gap - e.h);
      nextTop = e.y;
    }
    for (const e of list) {
      const mid = { top: e.y, bottom: e.y + e.h };
      if (side === "left") {
        let x = carBox.minX - 36 - e.w;
        const card = limits.leftObstacles.find((r) => r.bottom > mid.top && r.top < mid.bottom);
        x = Math.max(x, (card ? card.right : 0) + 12);
        e.x = x;
        e.lineX = x + e.w;
      } else {
        let x = carBox.maxX + 36;
        const obstacle = limits.rightObstacles.find((r) => r.bottom > mid.top && r.top < mid.bottom);
        x = Math.min(x, (obstacle ? obstacle.left : canvas.clientWidth) - 12 - e.w);
        e.x = x;
        e.lineX = x;
      }
    }
  }

  let allHidden = false;
  scene.onAfterRenderObservable.add(() => {
    if (visibility <= 0.001 || !scene.activeCamera) return;
    const demand = !!onDemand?.();
    if (demand && !activeId) {
      // Sob demanda e nada selecionado: esconde tudo uma vez e não calcula nada por quadro.
      if (!allHidden) {
        for (const e of entries) {
          e.button.hidden = true;
          e.line.style.display = e.dot.style.display = "none";
        }
        allHidden = true;
      }
      return;
    }
    allHidden = false;
    const box = { minX: Infinity, maxX: -Infinity };
    const p = { x: 0, y: 0, z: 0 };
    for (const c of corners) {
      project(c, p);
      box.minX = Math.min(box.minX, p.x);
      box.maxX = Math.max(box.maxX, p.x);
    }
    // Divide as colunas pelo centro do carro na tela: componentes da frente para um lado,
    // da traseira para o outro (linhas curtas e sem cruzamentos), em qualquer ângulo.
    const centerX = project(carCenter, p).x;
    const header = document.querySelector(".hud-top")?.getBoundingClientRect();
    // Barra recolhida (retângulo zerado): o limite inferior passa a ser o botão "Menu".
    const shown = (r) => (r && r.height > 0 ? r : null);
    const toolbar =
      shown(document.querySelector(".toolbar")?.getBoundingClientRect()) ?? shown(rectOf("toolbarRestore"));
    // Celular: painéis viram gavetas inferiores; com um componente aberto, só a legenda dele fica.
    const narrow = canvas.clientWidth < 720;
    // Com um componente aberto e pouca área livre (celular, tablet em pé), só a legenda dele fica.
    const panelLeft = rectOf("componentPanel")?.left ?? canvas.clientWidth;
    const freeWidth = panelLeft - (rectOf("energyPanel")?.right ?? 0);
    const compact = !!activeId && (demand || narrow || canvas.clientHeight < 520 || freeWidth < 560);
    const sheetTop = narrow
      ? [rectOf("componentPanel"), rectOf("energyPanel")].filter(Boolean).reduce((t, r) => Math.min(t, r.top), Infinity)
      : Infinity;
    const limits = {
      top: (header?.bottom ?? 60) + 12,
      bottom: Math.min(toolbar?.top ?? canvas.clientHeight, sheetTop) - 12,
      leftObstacles: [rectOf("vehicleCard"), rectOf("energyPanel")].filter(Boolean),
      rightObstacles: [rectOf("componentPanel"), rectOf("helpPanel")].filter(Boolean),
    };

    const left = [];
    const right = [];
    for (const e of entries) {
      project(e.center, e.screen);
      e.visible = e.screen.z > 0 && e.screen.z < 1 && (!filter || filter.has(e.id)) && (!compact || e.id === activeId);
      if (!e.visible) continue;
      (e.screen.x < centerX ? left : right).push(e);
    }
    layoutColumn(left, "left", box, limits);
    layoutColumn(right, "right", box, limits);

    for (const e of entries) {
      e.button.hidden = !e.visible;
      e.line.style.display = e.dot.style.display = e.visible ? "" : "none";
      if (!e.visible) continue;
      e.button.style.transform = `translate(${Math.round(e.x)}px, ${Math.round(e.y)}px)`;
      e.button.classList.toggle("is-active", e.id === activeId);
      e.button.classList.toggle("is-dimmed", !!activeId && e.id !== activeId);
      e.line.setAttribute("x1", e.lineX);
      e.line.setAttribute("y1", e.y + e.h / 2);
      e.line.setAttribute("x2", e.screen.x);
      e.line.setAttribute("y2", e.screen.y);
      e.dot.setAttribute("cx", e.screen.x);
      e.dot.setAttribute("cy", e.screen.y);
    }
  });

  return {
    setVisibility(k) {
      visibility = k;
      root.hidden = k <= 0.001;
      root.style.opacity = String(k);
    },
    setActive(id) {
      activeId = id;
    },
    /** Mostra só as legendas destes componentes (null = todas). */
    setFilter(ids) {
      filter = ids ? new Set(ids) : null;
    },
    /** Texto alternativo temporário (null volta ao nome curto). */
    setText(id, value) {
      const e = entries.find((x) => x.id === id);
      if (!e) return;
      e.text.textContent = value ?? e.short;
      e.measured = false;
      e.w = e.h = undefined;
    },
  };
}
