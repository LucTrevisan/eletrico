import { PALETTE } from "../config.js";

/**
 * Conteúdo educativo dos painéis (pt-BR). Textos curtos e genéricos sobre veículos
 * elétricos — não descrevem especificações de engenharia de um modelo específico.
 * Educadores podem editar este arquivo livremente; as chaves são os ids de
 * COMPONENT_CATALOG (vehicle/components.js).
 *
 *  short   — rótulo curto das legendas do raio X
 *  tag     — categoria exibida acima do título
 *  color   — cor de destaque (raio X, legendas, painel)
 *  extra   — linha opcional (tecnologia / sistema associado / segurança)
 */
const NEUTRAL = "#C9D6E3";

export const COMPONENT_CONTENT = {
  bateria: {
    title: "Bateria de tração",
    short: "Bateria",
    tag: "Armazenamento de energia",
    color: PALETTE.blue,
    funcao: "Armazenar a energia elétrica que movimenta o veículo.",
    comoFunciona:
      "Células recarregáveis, normalmente de íons de lítio, são agrupadas em módulos ligados em série e em paralelo, formando um conjunto de alta tensão (centenas de volts).",
    importancia:
      "A capacidade (kWh) define a autonomia; a potência limita aceleração e recarga rápida. No assoalho, baixa o centro de gravidade.",
    extra: { label: "Sistema associado", text: "BMS — monitora tensão, corrente e temperatura das células." },
  },
  motor: {
    title: "Motor elétrico",
    short: "Motor elétrico",
    tag: "Tração",
    color: PALETTE.cyan,
    funcao: "Converter energia elétrica em movimento nas rodas.",
    comoFunciona:
      "Correntes alternadas no estator criam um campo magnético girante que arrasta o rotor. Muitos elétricos usam motores síncronos de ímãs permanentes.",
    importancia:
      "Entrega torque desde a rotação zero, com eficiência tipicamente acima de 90%. Na frenagem, pode atuar como gerador.",
  },
  inversor: {
    title: "Inversor de frequência",
    short: "Inversor",
    tag: "Eletrônica de potência",
    color: PALETTE.orange,
    funcao: "Transformar a corrente contínua (CC) da bateria em corrente alternada (CA) trifásica para o motor.",
    comoFunciona:
      "Transistores de potência chaveiam milhares de vezes por segundo; variando frequência e amplitude, controlam velocidade e torque do motor.",
    importancia:
      "É quem dosa a potência pedida pelo acelerador. Na regeneração, faz o caminho inverso: CA do motor → CC para a bateria.",
    extra: { label: "Tecnologia", text: "Transistores IGBT ou de carbeto de silício (SiC)." },
  },
  ecu: {
    title: "Unidades de controle (BMS / ECU)",
    short: "BMS / ECU",
    tag: "Gerenciamento",
    color: NEUTRAL,
    funcao: "Monitorar e coordenar os sistemas elétricos do veículo.",
    comoFunciona:
      "Sensores medem tensões, correntes e temperaturas; os controladores trocam dados por redes internas (como CAN) e definem limites de potência e recarga.",
    importancia:
      "Protegem a bateria contra sobrecarga, descarga profunda e superaquecimento, prolongando sua vida útil com segurança.",
  },
  recarga: {
    title: "Sistema de recarga",
    short: "Recarga (OBC)",
    tag: "Entrada de energia",
    color: NEUTRAL,
    funcao: "Receber energia da rede elétrica para recarregar a bateria.",
    comoFunciona:
      "Em CA, o carregador de bordo (OBC) converte alternada em contínua. Em CC (recarga rápida, quando compatível), o carregador externo entrega CC ao circuito de alta tensão, sob controle do veículo.",
    importancia: "A potência do OBC define o tempo de recarga em casa; a recarga CC encurta as paradas em viagens.",
  },
  refrigeracao: {
    title: "Sistema de refrigeração",
    short: "Refrigeração",
    tag: "Gerenciamento térmico",
    color: NEUTRAL,
    funcao: "Manter bateria, motor e eletrônica de potência na temperatura ideal.",
    comoFunciona:
      "Um líquido de arrefecimento circula por placas e canais e leva o calor ao radiador. Em clima frio, o sistema também pode aquecer a bateria.",
    importancia: "Temperatura adequada preserva a bateria, permite recarga rápida e mantém o desempenho em uso intenso.",
  },
  redutor: {
    title: "Redutor (transmissão)",
    short: "Redutor",
    tag: "Transmissão",
    color: NEUTRAL,
    funcao: "Reduzir a alta rotação do motor e multiplicar o torque entregue às rodas.",
    comoFunciona:
      "Engrenagens com relação fixa (em geral uma única marcha) e o diferencial, que permite às rodas girar em velocidades diferentes nas curvas.",
    importancia: "Dispensa o câmbio de várias marchas: menos peças, menos perdas e aceleração contínua.",
  },
  cabos_hv: {
    title: "Cabos de alta tensão",
    short: "Cabos HV",
    tag: "Distribuição de energia",
    color: NEUTRAL,
    funcao: "Conduzir a energia entre bateria, inversor, motor e sistema de recarga.",
    comoFunciona: "Condutores de grande seção, isolados e blindados. A cor laranja identifica alta tensão, por padrão da indústria.",
    importancia: "Suportam correntes elevadas com poucas perdas.",
    extra: { label: "Segurança", text: "Somente profissionais capacitados podem intervir em circuitos de alta tensão." },
  },
  freios: {
    title: "Freios e frenagem regenerativa",
    short: "Freios",
    tag: "Desaceleração",
    color: NEUTRAL,
    funcao: "Reduzir a velocidade e parar o veículo com segurança.",
    comoFunciona:
      "Na regeneração, o motor atua como gerador e devolve parte da energia à bateria. Os freios a disco (disco e pinça) complementam a frenagem quando necessário.",
    importancia:
      "A regeneração aumenta a autonomia, sobretudo na cidade, e reduz o desgaste das pastilhas. A energia recuperada depende da velocidade, da carga da bateria e da intensidade da frenagem.",
  },
  rodas: {
    title: "Rodas e pneus",
    short: "Rodas",
    tag: "Contato com o solo",
    color: NEUTRAL,
    funcao: "Transmitir ao solo as forças de tração, frenagem e direção.",
    comoFunciona: "O torque do redutor chega às rodas pelos semieixos; a leve deformação do pneu cria a aderência.",
    importancia: "Pneus de baixa resistência ao rolamento e bem calibrados reduzem o consumo e aumentam a autonomia.",
  },
  chassi: {
    title: "Chassi e plataforma",
    short: "Chassi",
    tag: "Estrutura",
    color: NEUTRAL,
    funcao: "Sustentar e proteger os componentes e os ocupantes.",
    comoFunciona: "Em plataformas dedicadas, a bateria fica no assoalho, entre os eixos, e pode fazer parte da estrutura.",
    importancia: "Rigidez e centro de gravidade baixo melhoram a estabilidade e a segurança em colisões.",
  },
  carroceria: {
    title: "Carroceria",
    short: "Carroceria",
    tag: "Estrutura e aerodinâmica",
    color: PALETTE.cyan,
    funcao: "Abrigar os ocupantes e dar forma aerodinâmica ao veículo.",
    comoFunciona: "Painéis e reforços de aço, alumínio ou compósitos absorvem energia em colisões; as formas guiam o fluxo de ar.",
    importancia: "Menos arrasto aerodinâmico significa menos energia gasta em velocidade de estrada — e mais autonomia.",
    extra: { label: "Dica", text: "Ative o RAIO X para ver os componentes internos." },
  },
  portas: {
    title: "Portas",
    short: "Portas",
    tag: "Acesso e proteção",
    color: PALETTE.cyan,
    funcao: "Dar acesso à cabine e proteger os ocupantes em impactos laterais.",
    comoFunciona: "Estruturas com barras de reforço internas, fechaduras e vedações.",
    importancia: "Contribuem para a rigidez lateral e para o isolamento acústico — perceptível num carro silencioso como o elétrico.",
  },
  interior: {
    title: "Interior e painel",
    short: "Interior",
    tag: "Cabine",
    color: NEUTRAL,
    funcao: "Acomodar os ocupantes e reunir comandos e informações de condução.",
    comoFunciona: "A central multimídia mostra autonomia, consumo e fluxo de energia em tempo real.",
    importancia: "Climatização e aquecimento consomem energia da bateria e influenciam a autonomia.",
  },
  outros: {
    title: "Peça do veículo",
    short: "Peça",
    tag: "Não classificada",
    color: NEUTRAL,
    funcao: "Esta peça ainda não foi associada a um componente do catálogo.",
    comoFunciona: "Ajuste os padrões de nome em vehicle/components.js para classificá-la.",
    importancia: "—",
  },
};

export function getContent(id) {
  return COMPONENT_CONTENT[id] ?? COMPONENT_CONTENT.outros;
}
