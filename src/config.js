/**
 * Configuração central do EV Experience XR.
 *
 * Tudo que depende do modelo 3D fica aqui, para que a troca do modelo provisório
 * pelo GLB definitivo do BYD Song Pro exija apenas copiar o arquivo e, se preciso,
 * ajustar a orientação (`rotationDeg`).
 */

export const APP = {
  name: "EV Experience XR",
  subtitle: "Laboratório Virtual de Veículos Elétricos",
};

/**
 * Identificação da escola (totem no showroom, placa em VR e tela de carregamento).
 * `logoUrl` é opcional: se o arquivo existir, a arte oficial substitui o logotipo desenhado.
 */
export const INSTITUTION = {
  eyebrow: "Escola SENAI",
  schoolName: "Antonio Adolpho Lobbe",
  fullName: "SENAI Antonio Adolpho Lobbe",
  logoUrl: "textures/senai-logo.png",
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
 * Modelos candidatos, em ordem de prioridade. O primeiro arquivo encontrado em
 * `public/models/` é carregado. Para usar o modelo definitivo basta salvá-lo como
 * `public/models/byd-song-pro.glb` — o provisório passa a ser ignorado.
 *
 * `rotationDeg` corrige a orientação para o padrão da cena: frente do carro
 * apontando para +Z, teto para +Y. Ajuste ao vivo pelo console com
 * `evxr.girarModelo(x, y, z)` e depois grave aqui o valor que funcionou.
 *
 * `drivetrain` ("front" | "rear") indica o eixo do motor. Só é usado para posicionar
 * representações ilustrativas quando o GLB não traz os componentes internos.
 */
export const VEHICLE_MODELS = [
  {
    id: "byd-song-pro",
    url: "models/byd-song-pro.glb",
    label: "BYD Song Pro",
    provisional: false,
    rotationDeg: { x: 0, y: 0, z: 0 },
    drivetrain: "front",
  },
  {
    id: "provisorio",
    url: "models/provisorio.glb",
    label: "BYD Song Pro",
    provisional: true,
    // No GLB provisório a frente está em +X (glTF); após a conversão para o
    // sistema de mão esquerda do Babylon ela fica em -X. 90° leva -X para +Z.
    rotationDeg: { x: 0, y: 90, z: 0 },
    drivetrain: "rear",
  },
];

export const VEHICLE = {
  /**
   * Medidas de referência (m), usadas apenas para corrigir a escala se o modelo
   * vier em outra unidade (mm, cm) — não são exibidas ao usuário.
   * Conferir com a ficha técnica oficial do veículo.
   */
  referenceLength: 4.738,
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
  /** Malhas que nunca são unidas (precisam de pivô próprio, ex.: portas que abrem). */
  keepSeparate: [/porta_painel|porta_contorno|porta_macaneta|door/i],
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
 * Simulação educativa (Etapa 3). VALORES DEMONSTRATIVOS, plausíveis para um SUV
 * elétrico médio — não são especificações nem medições do veículo exibido.
 */
export const SIMULATION = {
  massKg: 1900,
  batteryKwh: 70,
  initialSoc: 72,
  maxPowerKw: 150, // potência máxima de tração retirada da bateria
  maxRegenKw: 60, // potência máxima de regeneração devolvida à bateria
  maxAccel: 3.6, // m/s² (limite de aderência/torque em baixa velocidade)
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
  acKw: 7.4, // recarga CA (carregador de bordo)
  dcKw: 100, // recarga rápida CC (pico, cai perto da carga completa)
  chargeTimeScale: 60, // na recarga, 1 s de tela = 1 min simulado
};

/**
 * Parâmetros de URL úteis para teste: ?q=low|medium|high, ?nointro, ?debug, ?model=models/x.glb,
 * ?ilustrativo (esconde os componentes internos reais para testar as representações ilustrativas).
 */
export const URL_PARAMS = new URLSearchParams(window.location.search);
