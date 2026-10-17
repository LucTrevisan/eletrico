/**
 * Textos dos modos de fluxo de energia (pt-BR). Editáveis livremente.
 * `chain`: etapas exibidas no painel; `kind` define a cor (cc azul, ca ciano, mec laranja).
 * `labels`: componentes cujas legendas aparecem no carro durante o modo; `rename` troca
 * temporariamente o texto de alguma legenda.
 */
export const ENERGY_MODES = {
  accel: {
    tab: "Aceleração",
    title: "Modo A — Aceleração",
    text:
      "A bateria fornece corrente contínua (CC). O inversor a transforma em corrente alternada (CA) trifásica, " +
      "o motor converte a energia elétrica em movimento e o redutor multiplica o torque até as rodas.",
    chain: [
      { label: "Bateria", kind: "cc" },
      { label: "Inversor", note: "CC → CA", kind: "ca" },
      { label: "Motor elétrico", note: "elétrica → mecânica", kind: "mec" },
      { label: "Redutor", kind: "mec" },
      { label: "Rodas", kind: "mec" },
    ],
    labels: ["bateria", "inversor", "motor", "redutor"],
    rename: {},
  },
  regen: {
    tab: "Frenagem regenerativa",
    title: "Modo B — Frenagem regenerativa",
    text:
      "Ao frear, as rodas passam a girar o motor, que funciona como gerador. O inversor converte a CA gerada em CC " +
      "e parte da energia cinética volta para a bateria. Quanto se recupera depende da velocidade, da carga da bateria " +
      "e da intensidade da frenagem — o freio a disco completa a parada.",
    chain: [
      { label: "Rodas", kind: "mec" },
      { label: "Redutor", kind: "mec" },
      { label: "Motor (gerador)", note: "mecânica → elétrica", kind: "ca" },
      { label: "Inversor", note: "CA → CC", kind: "cc" },
      { label: "Bateria", kind: "cc" },
    ],
    labels: ["bateria", "inversor", "motor", "redutor"],
    rename: { motor: "Motor (gerador)" },
  },
  "charge-ac": {
    tab: "Recarga",
    title: "Modo C — Recarga em corrente alternada (CA)",
    text:
      "Na tomada ou wallbox, a energia chega em CA. O carregador de bordo (OBC), dentro do carro, converte a corrente " +
      "alternada em contínua para a bateria. A potência é limitada pelo OBC, por isso a recarga é mais lenta.",
    chain: [
      { label: "Rede / wallbox", note: "CA", kind: "ca" },
      { label: "Porta de recarga", kind: "ca" },
      { label: "Carregador de bordo", note: "CA → CC", kind: "cc" },
      { label: "Bateria", kind: "cc" },
    ],
    labels: ["recarga", "bateria"],
    rename: { recarga: "Porta + carregador de bordo" },
  },
  "charge-dc": {
    tab: "Recarga",
    title: "Modo C — Recarga rápida em corrente contínua (CC)",
    text:
      "No carregador rápido, a conversão para CC acontece fora do carro. A corrente contínua segue direto ao circuito " +
      "de alta tensão, passando pelos sistemas de proteção e controle (contatores e BMS). Perto da carga completa a " +
      "potência diminui para proteger a bateria. Disponível quando o veículo é compatível.",
    chain: [
      { label: "Carregador rápido", note: "CC", kind: "cc" },
      { label: "Porta de recarga", kind: "cc" },
      { label: "Proteção e controle", note: "contatores + BMS", kind: "cc" },
      { label: "Bateria", kind: "cc" },
    ],
    labels: ["recarga", "ecu", "bateria"],
    rename: { ecu: "Proteção e controle (BMS)", recarga: "Porta de recarga" },
  },
};

export const STATE_LABELS = {
  parado: "Parado",
  acelerando: "Acelerando",
  movimento: "Em movimento (sem tração)",
  regenerando: "Regenerando",
  recarregando: "Recarregando",
};

export const NOTE_LABELS = {
  "carga-baixa": "Carga baixa: potência de tração reduzida.",
  "bateria-vazia": "Bateria descarregada — recarregue.",
  "freio-a-disco-completa": "Em baixa velocidade o freio a disco completa a parada.",
  "freio-a-disco-complementa": "Regeneração no limite: o freio a disco complementa.",
  "regeneracao-limitada-bateria-cheia": "Bateria quase cheia: aceita pouca regeneração.",
  "potencia-reduzida-perto-do-fim": "Acima de 50% a potência CC diminui para proteger a bateria.",
  "bateria-cheia": "Bateria carregada.",
};

export const SIMULATION_DISCLAIMER =
  "Simulação educativa com valores demonstrativos — não são medições de um veículo real. " +
  "O carro fica na plataforma como num dinamômetro: as rodas giram, mas ele não sai do lugar.";
