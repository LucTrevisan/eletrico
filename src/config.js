/**
 * Configuração central do EV Experience XR.
 *
 * Tudo que depende do modelo 3D fica aqui: arquivo, orientação, layout dos componentes
 * elétricos e valores da simulação. Trocar de veículo = ajustar VEHICLE_MODELS e SIMULATION.
 */

export const APP = {
  name: "EV Experience XR",
  subtitle: "Laboratório Virtual de Veículos Elétricos",
};

/**
 * Identificação da escola (totem no showroom, placa em VR e tela de carregamento).
 * `logoUrl` é opcional: salve a arte oficial em public/textures/ e informe o caminho aqui
 * (ex.: "textures/senai-logo.png") para substituir o logotipo desenhado. null = só o desenho
 * (nenhuma requisição extra na abertura).
 */
export const INSTITUTION = {
  eyebrow: "Escola SENAI",
  schoolName: "Antonio Adolpho Lobbe",
  fullName: "SENAI Antonio Adolpho Lobbe",
  logoUrl: null,
};

/** Paleta oficial (hex sRGB). */
export const PALETTE = {
  background: "#08111F",
  blue: "#00B8FF",
  cyan: "#00E5FF",
  orange: "#FF9F43",
  text: "#F5F7FA",
};

/**
 * Modelos candidatos, em ordem de prioridade (o primeiro arquivo encontrado em
 * `public/models/` é carregado). Otimize GLBs novos com `npm run otimizar-modelo`.
 *
 *  rotationDeg  correção de orientação (frente do carro → +Z, teto → +Y);
 *               `autoFront` acerta sozinho a frente pela posição dos faróis/lanternas.
 *  drivetrain   eixo do(s) motor(es): "front" | "rear" | "awd". Posiciona as peças
 *               ilustrativas quando o GLB não traz os componentes internos.
 *  chargePort   onde fica a porta de recarga: { side: "left"|"right", end: "front"|"rear" }.
 *  extraPatterns regras extras de identificação de peças só para este arquivo.
 *  notes        linha "No Toyota bZ4X" nos painéis educativos (valores aproximados).
 */
export const VEHICLE_MODELS = [
  {
    id: "toyota-bz4x",
    url: "models/toyota-bz4x.glb",
    label: "Toyota bZ4X",
    badge: "100% elétrico · AWD",
    provisional: false,
    credit: "Modelo 3D: “Toyota bZ4X” por KOElkast1007 (Sketchfab, licença Sketchfab Standard)",
    rotationDeg: { x: 0, y: 0, z: 0 },
    autoFront: true,
    // O modelo tem emblema "AWD": um e-Axle (motor + redutor + inversor) em cada eixo.
    drivetrain: "awd",
    chargePort: { side: "left", end: "front" }, // para-lama dianteiro esquerdo
    extraPatterns: {
      portas: [/^boot/i], // tampa traseira (5ª porta)
      interior: [/^misc_[ab]/i, /steering/i],
      freios: [/^hub_/i],
    },
    // Ajustes finos de material (nome do material no GLB). clearCoat = verniz, só fora do perfil leve.
    materials: {
      carpaint: { clearCoat: { intensity: 1, roughness: 0.06 } },
      velg: { metallic: 0.85, roughness: 0.34 }, // rodas de liga leve (no arquivo vinham como plástico fosco)
    },
    notes: {
      bateria: "Íons de lítio sob o assoalho, refrigerada a líquido; ~71,4 kWh brutos na versão de lançamento (varia por versão e ano).",
      motor: "Versão AWD (a do modelo): dois motores, um por eixo, de ~80 kW cada (~160 kW combinados no lançamento). A FWD tem só o dianteiro.",
      inversor: "Um por e-Axle, integrado ao motor e ao redutor — na dianteira e na traseira.",
      redutor: "Um por e-Axle, junto com o motor e o inversor, em cada eixo.",
      recarga: "Porta no para-lama dianteiro esquerdo. CA de 6,6 kW (11 kW em versões posteriores) e CC rápida de até ~150 kW.",
      refrigeracao: "Circuito de líquido para bateria e trem de força, com trocador de calor na dianteira.",
      portas: "Quatro portas e tampa traseira: clique em uma delas para abrir ou fechar.",
    },
  },
];

export const VEHICLE = {
  /**
   * Medidas de referência (m), usadas apenas para corrigir a escala se o modelo
   * vier em outra unidade (mm, cm) — não são exibidas ao usuário.
   * Conferir com a ficha técnica oficial do veículo.
   */
  referenceLength: 4.69, // Toyota bZ4X: 4,69 × 1,86 × 1,65 m, entre-eixos 2,85 m
  /** Faixa plausível de comprimento (m). Fora dela, o modelo é reescalado para `referenceLength`. */
  plausibleLength: [3.0, 6.5],

  /**
   * Otimização de draw calls: une malhas que compartilham material dentro do mesmo
   * conjunto (ex.: os 24 pedaços de uma roda viram ~4 malhas). Mantém a separação
   * por conjunto, que é a granularidade usada por raio X e exploded view.
   *   "assembly"  — une por conjunto de topo do GLB (recomendado)
   *   "component" — une por categoria de componente (para GLBs sem hierarquia)
   *   "none"      — mantém todas as malhas originais
   */
  mergeStrategy: "assembly",
  /**
   * Componentes que se movem em bloco: além de unidos dentro de cada conjunto, são unidos entre
   * conjuntos por material (no bZ4X: 95 → ~69 malhas). Portas, rodas e freios ficam por conjunto.
   */
  mergeAcross: ["carroceria", "vidros", "interior", "chassi"],
  /** Malhas que nunca são unidas (precisam de pivô próprio, ex.: portas que abrem). */
  keepSeparate: [/porta_painel|porta_contorno|porta_macaneta|door|^boot/i],
};

export const SHOWROOM = {
  platformHeight: 0.12,
  /** Folga entre o carro e a borda da plataforma (m). */
  platformMargin: 0.8,
  turntableDegPerSecond: 6,
  floorSize: 80,
  environmentTexture: "textures/studio.env",
  environmentIntensity: 0.85,
};

export const XR = {
  /** Distância do ponto de partida em VR até a borda da plataforma (m). */
  spawnClearance: 1.4,
  /** Ângulo do snap turn (graus) no thumbstick esquerdo/direito. */
  snapTurnDeg: 45,
  /** Foveação fixa no Quest (0 = desligada, 1 = máxima). */
  fixedFoveation: 0.5,
};

/**
 * Simulação educativa (Etapa 3). VALORES APROXIMADOS inspirados no Toyota bZ4X AWD de
 * lançamento (2 × 80 kW, bateria ~71,4 kWh, ~2.000 kg, CA 6,6 kW, CC até ~150 kW) — a
 * simulação é demonstrativa e não reproduz medições do veículo. Confira a ficha da versão/ano.
 */
export const SIMULATION = {
  massKg: 2000,
  batteryKwh: 71.4,
  initialSoc: 72,
  maxPowerKw: 160, // potência máxima de tração retirada da bateria (dois motores)
  maxRegenKw: 60, // potência máxima de regeneração devolvida à bateria
  maxAccel: 4.1, // m/s² (tração integral: mais aderência na arrancada)
  brakeDecel: 3.0, // m/s² ao segurar "Frear"
  maxSpeedKmh: 160,
  driveEfficiency: 0.9, // bateria → rodas
  regenEfficiency: 0.7, // rodas → bateria
  auxKw: 0.6, // eletrônica, iluminação, climatização leve
  rollingCoef: 0.011,
  dragAreaM2: 0.8, // Cd × área frontal
  regenMinKmh: 8, // abaixo disso a regeneração some e o freio a disco completa a parada
  regenSocLimit: 95, // acima disso a bateria aceita menos regeneração
  lowSoc: 8, // abaixo disso a potência de tração é reduzida
  acKw: 6.6, // recarga CA (carregador de bordo)
  dcKw: 150, // recarga rápida CC (pico, cai perto da carga completa)
  chargeTimeScale: 60, // na recarga, 1 s de tela = 1 min simulado
};

/**
 * Parâmetros de URL úteis para teste: ?q=low|medium|high, ?nointro, ?debug, ?model=models/x.glb&rot=0,90,0,
 * ?ilustrativo (esconde os componentes internos reais para testar as representações ilustrativas).
 */
export const URL_PARAMS = new URLSearchParams(window.location.search);
