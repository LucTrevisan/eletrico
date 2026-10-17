# EV Experience XR — Laboratório Virtual de Veículos Elétricos

Showroom 3D/VR educacional feito com **Babylon.js 9 + WebXR + Vite**. Funciona no navegador do computador, no celular e no **Meta Quest Browser**.
Veículo em exposição: **Toyota bZ4X** (versão AWD, dois motores).

> **Status:** Etapas 1 a 5 concluídas — showroom, exploração em desktop/VR, **raio X**, painéis educativos,
> **fluxo de energia** (aceleração, frenagem regenerativa, recarga CA/CC), **simulação**, **vista explodida**,
> **portas que abrem**, interface retrátil no celular, mãos no Quest, refinamento de desempenho/materiais e
> publicação no **GitHub Pages**: https://luctrevisan.github.io/eletrico/
>
> Escola SENAI Antonio Adolpho Lobbe.

## Instalação e execução

Requer Node.js 20.19+ (testado com Node 24).

```bash
npm install          # instala dependências
npm run dev          # servidor local em http://localhost:5173
npm run build        # build de produção em dist/
npm run preview      # serve o dist/ em http://localhost:4173
```

## Testar no Meta Quest

WebXR só funciona em **HTTPS** (ou `localhost`). Duas opções para testar a partir do seu PC:

1. **Rede local com certificado autoassinado**
   ```bash
   npm run dev:https
   ```
   No Quest Browser, abra `https://IP-DO-PC:5173` (o IP aparece no terminal), aceite o aviso de certificado e toque em **Entrar em VR**.
2. **Cabo USB (adb)** — com o modo desenvolvedor ativo no Quest:
   ```bash
   adb reverse tcp:5173 tcp:5173
   npm run dev
   ```
   No Quest Browser, abra `http://localhost:5173`.

Para usar sem o PC, abra o endereço publicado no GitHub Pages (seção **Publicação**).

### Controles em VR
| Ação | Controles | Mãos (sem controles) |
|---|---|---|
| Teleporte | Thumbstick para frente (mirar), soltar para ir | Apontar para o piso e manter a pinça (~1,5 s) |
| Giro de 45° (snap turn) | Thumbstick para os lados | — (gire o corpo) |
| Acionar botões do painel 3D | Gatilho (raio) | Pinça apontando para o botão |
| Ver informações de uma peça | Gatilho na peça ou na legenda | Pinça na peça ou na legenda |
| Abrir/fechar uma porta | Gatilho na porta | Pinça na porta |
| Trazer o painel para perto | Botão **B** ou **Y** | Olhar o pulso esquerdo e tocar em **MENU** |

O painel 3D tem: **RAIO X**, **Energia**, **EXPLODIR**, **Girar plataforma**, **Voltar ao início** e **Sair do VR**.
Os dois controles (ou as duas mãos) têm raio de seleção ao mesmo tempo — qualquer mão clica já no primeiro
gatilho. Controles/mãos são detectados sozinhos e as dicas do painel mudam conforme o modo de entrada.

## Raio X e painéis educativos

- **RAIO X** (botão na barra, tecla **X** ou painel 3D em VR): a carroceria fica translúcida; bateria em azul,
  motor em ciano e inversor em laranja, com legendas e linhas de chamada.
- **Clique numa peça** (ou numa legenda) para abrir o painel com *Função*, *Como funciona*, *Importância* e
  uma linha **"No Toyota bZ4X"** com os dados do modelo. No desktop a câmera se aproxima do componente;
  em VR o painel aparece ao lado da linha de visão.
- O GLB do bZ4X traz carroceria, interior, rodas, freios e portas, mas **não** os componentes internos. Bateria,
  e-Axles (motor + redutor + inversor, **um em cada eixo** na versão AWD), BMS, carregador de bordo, refrigeração e
  cabos de alta tensão são mostrados como **formas ilustrativas hachuradas**, sempre identificadas como "ilustrativo".
- Os textos ficam em `src/vehicle/componentContent.js`; os dados do modelo, em `notes` no `src/config.js`.

## Vista explodida e portas

- **EXPLODIR** (barra, tecla **V** ou painel 3D): carroceria, vidros e portas sobem, o interior se separa, rodas e
  freios se afastam para os lados e os componentes do trem de força se abrem em leque. Bateria e chassi ficam
  como referência. Animação suave do Babylon, com legendas que acompanham as peças; **Montar** restaura tudo.
- **Portas:** clique (mouse, toque, gatilho ou pinça) numa porta para abri-la ou fechá-la — quatro portas e a tampa
  traseira, cada uma com sua dobradiça. Tecla **P** (ou o botão no painel da peça "Portas") abre/fecha todas.

## Fluxo de energia e simulação

Botão **Energia** (tecla **E**, ou no painel 3D em VR). O raio X liga sozinho e o caminho da energia aparece
com partículas: **azul = CC**, **ciano = CA**, **laranja = mecânica**.

- **Aceleração:** segure **Acelerar** (ou **W**): bateria → inversores (CC→CA) → motores → redutores → rodas,
  nos **dois eixos** (AWD).
- **Frenagem regenerativa:** a aba coloca o carro a 80 km/h; segure **Frear** (ou **S**): o fluxo se inverte e a
  energia recuperada é contabilizada. A regeneração some em baixa velocidade e diminui com a bateria quase cheia.
- **Recarga:** escolha **CA** (carregador de bordo) ou **CC** (recarga rápida) e toque em **Iniciar recarga**.
  Um carregador externo aparece ao lado da **porta de recarga (para-lama dianteiro esquerdo)**, e a câmera enquadra
  carro e carregador juntos. Tempo acelerado: 1 s = 1 min.

O painel mostra velocidade, estado de carga (SOC), potência da bateria e o estado do sistema. As rodas giram
conforme a velocidade (o carro fica na plataforma, como num dinamômetro). **Todos os valores são demonstrativos**,
inspirados no bZ4X AWD de lançamento (`SIMULATION` em `src/config.js`); os textos ficam em `src/simulation/energyContent.js`.

## Celular: interface retrátil

Pensada para deixar o carro visível na tela pequena:

- **Cartão do veículo** recolhido por padrão (toque para ver medidas e créditos).
- **Vistas** (Inicial, Frente, Lateral, Traseira, Superior) agrupadas num menu suspenso da barra.
- **Recolher** esconde a barra inteira; o botão **Menu** a traz de volta.
- Painéis de peça e de energia são **gavetas**: toque na alça (ou arraste para baixo) para recolher; a explicação
  longa da energia fica atrás do botão **Explicação**.
- **Olho** (canto superior, tecla **I**): esconde toda a interface para ver só o modelo 3D.
- Com um painel aberto, o carro se desloca para o centro da área livre e só a legenda da peça escolhida fica na tela.
- **Legendas sob demanda:** no raio X e na vista explodida, nenhuma legenda cobre o carro — toque numa peça para
  ver o nome dela (na vista explodida, a gaveta abre recolhida, só com o nome; a alça mostra os detalhes). Tocar
  fora das peças fecha.
- **Fluxo de energia:** o carro é enquadrado para ocupar a área acima da gaveta; enquanto **Acelerar** ou **Frear**
  está pressionado, a gaveta fica só com os mostradores e os botões e as legendas somem, deixando o carro, o fluxo e
  as rodas à vista. No desktop nada muda.

## Desempenho

| | Original | Etapa 4 | Etapa 5 |
|---|---|---|---|
| Modelo 3D (`toyota-bz4x.glb`) | 35,4 MB · 432 mil triângulos | 4,6 MB · 257 mil | **3,4 MB · 257 mil** (texturas WebP, máx. 1024 px) |
| JavaScript na abertura | 8,0 MB (1,74 MB gzip) | 2,2 MB (580 KB gzip) | **1,8 MB (502 KB gzip)** — WebXR sob demanda |
| Draw calls por quadro (perfil do Quest, por olho) | — | 111 | **86** |
| Triângulos do showroom | — | 76 mil | **9,4 mil** |
| Memória de texturas na GPU | — | 84 MB | **48 MB** |

- Importações do Babylon por módulo (sem o pacote inteiro); carregadores de glTF e extensões sob demanda.
- WebXR (teleporte, controles, mãos) e a interface 3D de VR (Babylon GUI) só são baixados em dispositivos com VR.
- Carroceria, vidros, interior e chassi unidos por material entre conjuntos (`mergeAcross` no config): 95 → 70
  malhas sem afetar raio X, vista explodida e portas.
- Anéis de LED e halo como tubos leves (~2 mil triângulos cada, contra ~19 mil de um toro equivalente).
- Materiais compartilhados no fluxo de energia; partículas por *thin instances*.
- Legendas da vista explodida só são recalculadas enquanto as peças se movem.
- Mãos em VR com esferas instanciadas (um draw call) e esfera de toque com material simples: nada é baixado da
  CDN do Babylon para as mãos (e some um erro de NodeMaterial que a versão padrão causava).
- Verniz (clear coat) na pintura e rodas metálicas só fora do perfil leve; no Quest ficam os materiais originais.
- Espelho da plataforma e glow só existem no desktop; são desligados automaticamente em VR. Perfil de qualidade
  ajustado sozinho se o FPS cair.

### Otimizar um GLB novo

```bash
npm run otimizar-modelo -- modelos-originais/carro.glb public/models/carro.glb
npm run otimizar-modelo -- modelos-originais/toyota-bz4x.glb public/models/toyota-bz4x.glb --simplificar=0.5 --webp
```

Aplica deduplicação, solda de vértices, compressão **meshopt**, limita as texturas a 1024 px (`--textura=N`;
imagens quase lisas ficam com 512 px) e, opcionalmente, simplificação com limite de erro (`--simplificar`,
`--erro`) e texturas em WebP (`--webp`). O segundo comando gera exatamente o modelo publicado.
O decodificador meshopt é servido localmente (`public/vendor/meshopt_decoder.js`). Guarde os originais em
`modelos-originais/` (pasta ignorada pelo git).

## Publicação (GitHub Pages)

O repositório já tem o workflow `.github/workflows/deploy.yml`: a cada `git push` na branch `main`, o GitHub
Actions roda `npm ci` + `npm run build` e publica a pasta `dist/` em **https://luctrevisan.github.io/eletrico/**.

1. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (uma vez só).
2. Publicar uma alteração:
   ```bash
   git add -A
   git commit -m "Descrição da alteração"
   git push
   ```
3. Acompanhe em **Actions**; em ~1–2 min o site é atualizado (no Quest, recarregue a página).

O `vite.config.js` usa `base: "./"` (caminhos relativos), necessário porque o site fica em `/eletrico/`, e não na
raiz do domínio. O build de produção também pode ser testado localmente: `npm run build && npm run preview`.

**Checklist antes de uma demonstração no Quest:** abrir o endereço publicado no Quest Browser → aguardar o
carregamento → **Entrar em VR** → testar gatilho no painel 3D, teleporte (thumbstick para frente), giro de 45°,
botão B/Y e, sem controles, a pinça e o menu de pulso.

## Identificação da escola

O totem do showroom, a placa em VR e a tela de carregamento usam `INSTITUTION` em `src/config.js`.
O logotipo é desenhado pelo app; para usar a **arte oficial**, salve-a em `public/textures/` (ex.:
`senai-logo.png`, fundo opaco, proporção ~4:1) e informe o caminho em `INSTITUTION.logoUrl`.

## Trocar ou ajustar o veículo

Tudo que depende do modelo fica em `VEHICLE_MODELS` (`src/config.js`): arquivo, nome, selo, crédito do autor,
orientação, tração (`drivetrain`: `"front"`, `"rear"` ou `"awd"`), posição da porta de recarga e padrões extras de
nomes de peças, além de ajustes finos de material (`materials`: verniz, metálico, rugosidade).

1. Otimize o GLB (seção acima) e salve em `public/models/`.
2. A frente é detectada sozinha pelos faróis/lanternas (`autoFront`). Se ainda aparecer virado, ajuste ao vivo
   no console (F12) e grave em `rotationDeg`:
   ```js
   evxr.girarModelo(0, 90, 0)
   ```
3. Confira quais componentes foram reconhecidos pelos nomes das peças:
   ```js
   evxr.componentes()
   ```
   Ajuste `extraPatterns` no config (ou os padrões em `src/vehicle/components.js`).

A escala é verificada automaticamente: se o comprimento medido estiver fora de 3–6,5 m (ex.: modelo exportado em
milímetros), o carro é reescalado para o comprimento de referência definido em `src/config.js`.

**Crédito do modelo 3D:** “Toyota bZ4X” por KOElkast1007 (Sketchfab, licença Sketchfab Standard) — exibido no
cartão do veículo.

## Parâmetros de URL e console (depuração)

| Parâmetro | Efeito |
|---|---|
| `?q=low` / `medium` / `high` | Força o perfil de qualidade |
| `?nointro` | Pula a animação de abertura |
| `?debug` | Mostra FPS, draw calls e perfil de qualidade |
| `?model=models/x.glb&rot=0,90,0` | Carrega outro GLB com rotação (graus) |
| `?ilustrativo` | Esconde os componentes internos reais para testar as formas ilustrativas |

No console: `evxr.info()`, `evxr.componentes()`, `evxr.raioX(true)`, `evxr.selecionar("bateria")`
(`evxr.selecionar(null)` limpa), `evxr.explodir(true)`, `evxr.portas()`, `evxr.energia(true, "regen")`,
`evxr.simulacao()`, `evxr.girarModelo(x, y, z)`, `evxr.qualidade("low")`, `evxr.previewVR()` (simula no desktop a
vista de chegada em VR; `evxr.previewVR(false)` volta).

### Atalhos de teclado (desktop)

| Tecla | Ação |
|---|---|
| **X** | Raio X |
| **E** | Fluxo de energia (**W** acelera, **S** freia) |
| **V** | Explodir / montar |
| **P** | Abrir / fechar todas as portas |
| **I** | Esconder / mostrar a interface |
| **Espaço** | Girar / parar a plataforma |
| **0** a **4** | Vistas: inicial, frente, lateral, traseira, superior |
| **H** | Ajuda |
| **Esc** | Fechar o painel aberto |

## Estrutura

```
src/
├── main.js                 orquestração (cena → veículo → showroom → VR), cada etapa com tratamento de erro próprio
├── babylon.js              importações do Babylon por módulo (tree-shaking) e registro dos carregadores
├── config.js               modelo, paleta, medidas, VR e simulação — tudo que muda ao trocar o GLB
├── scene/
│   ├── createScene.js      motor, cena, câmera orbital, vistas predefinidas e enquadramentos
│   ├── environment.js      showroom: piso, plataforma giratória, LEDs, halo, título, placa e totem da escola
│   ├── lighting.js         ambiente de estúdio + luzes direcionais + sombras
│   ├── presentation.js     tween e animação de abertura
│   └── quality.js          perfis de qualidade e redução automática se o FPS cair
├── vehicle/
│   ├── loadVehicle.js      carregamento do GLB, orientação (inclusive automática), escala e centralização
│   ├── components.js       catálogo de componentes, agrupamento, fusão de malhas e posições
│   ├── componentContent.js textos educativos (função, como funciona, importância)
│   ├── materialStates.js   opacidade e brilho por peça (base do raio X e da seleção)
│   ├── xrayMode.js         raio X com transição suave
│   ├── selection.js        seleção por clique/toque/gatilho/pinça, hover e destaque pulsante
│   ├── schematics.js       formas ilustrativas (e-Axle por eixo conforme a tração)
│   ├── explodedView.js     vista explodida com animações do Babylon
│   └── doors.js            dobradiças e animação das portas e da tampa traseira
├── simulation/
│   ├── vehicleSimulation.js modelo da simulação (sem Babylon; valores demonstrativos)
│   ├── energyFlow.js       rotas e partículas do fluxo (1 ou 2 e-Axles), carregador externo e giro das rodas
│   └── energyContent.js    textos dos modos A, B e C
├── xr/
│   ├── support.js          detecção de suporte a VR (sem Babylon: entra no pacote inicial)
│   ├── xrExperience.js     WebXR (sob demanda): entrada em VR, teleporte, snap turn, mãos, ponto de partida
│   └── interactions.js     botões B/Y e menu de pulso (mãos) para chamar o painel
├── ui/
│   ├── hud.js              HUD em HTML (desktop/celular) e interface retrátil
│   ├── vrMenu.js           painel de controle 3D dentro do headset (carregado só em VR)
│   ├── componentPanel.js   painel educativo (HTML; versão holográfica em componentPanelVR.js)
│   ├── energyPanel.js      painel de energia e simulação (HTML; versão holográfica em energyPanelVR.js)
│   ├── componentCallouts.js legendas em tela (desktop/celular)
│   ├── componentLabels.js  legendas em 3D (VR) e legendas móveis da vista explodida
│   └── gui.js              importações do Babylon GUI
└── styles/main.css
public/
├── models/toyota-bz4x.glb  modelo otimizado (4,6 MB)
├── textures/studio.env     mapa de ambiente (reflexos PBR), servido localmente
├── vendor/meshopt_decoder.js decodificador da compressão meshopt
└── audio/
scripts/otimizar-modelo.mjs  otimização de GLB (npm run otimizar-modelo)
modelos-originais/           GLBs originais, fora do git
```

## Notas técnicas

- Malhas com o mesmo material dentro de cada conjunto são unidas na carga; portas ficam separadas para abrir.
- O HUD em HTML não aparece dentro do headset — em VR os mesmos comandos estão no painel 3D.
- Os modelos 3D dos **controles** em VR vêm da CDN do Babylon.js; sem internet, a VR continua funcionando com o
  raio de seleção. As mãos não dependem de internet.
- Os dados do bZ4X (bateria ~71,4 kWh, 2 × ~80 kW, CA 6,6/11 kW, CC até ~150 kW) variam por versão e ano e são
  usados apenas como referência didática.

#   e l e t r i c o  
 #   e l e t r i c o  
 