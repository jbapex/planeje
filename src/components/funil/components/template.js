import { MarkerType } from '@xyflow/react';

const mk = (color = '#3B82F6', dashed = false) => ({
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
  style: { stroke: color, strokeWidth: 2, ...(dashed ? { strokeDasharray: '7,4' } : {}) },
});

const edgeLabelStyle = {
  labelStyle: { fontSize: 10, fontFamily: 'Inter,sans-serif', fill: '#475569', fontWeight: 600 },
  labelBgStyle: { fill: 'white', fillOpacity: 0.9 },
  labelBgPadding: [5, 6],
  labelBgBorderRadius: 4,
};

const n = (id, type, x, y, label) => ({
  id, type: 'custom', position: { x, y },
  data: { type, label: label || '' },
});

const nc = (id, type, x, y, label, extra = {}) => ({
  id, type: 'custom', position: { x, y },
  data: { type, label: label || '', ...extra },
});

const e = (id, src, tgt, opts = {}) => {
  const { label, dashed, color, srcHandle, tgtHandle } = opts;
  return {
    id, source: src, target: tgt,
    ...(srcHandle ? { sourceHandle: srcHandle } : {}),
    ...(tgtHandle ? { targetHandle: tgtHandle } : {}),
    ...(label ? { label, ...edgeLabelStyle } : {}),
    ...mk(dashed ? '#94A3B8' : (color || '#3B82F6'), dashed),
  };
};

// ── Template 1: Funil Comercial ────────────────────────────────────────────────
export const DEFAULT_TEMPLATE = {
  id: null,
  name: 'Funil Comercial Dinamac',
  nodes: [
    // ── Tráfego ──────────────────────────────
    n('fb',       'facebook',     30,  88, 'Facebook'),
    n('ig',       'instagram',    30, 218, 'Instagram'),

    // ── Páginas ──────────────────────────────
    n('landing',  'landing-page', 190,  98, 'Página de Vendas'),
    n('checkout', 'checkout',     440,  98, 'Checkout c/ Order Bump'),

    // ── Decisão após checkout ─────────────────
    n('purch1',   'purchase',    680,  36, 'Compra Aprovada'),
    n('boleto',   'boleto',      680, 230, 'Boleto Gerado'),

    // ── Upsell ───────────────────────────────
    n('upsell',   'upsell',      860,  36, 'Upsell'),

    // ── Pós-upsell: compra ────────────────────
    n('purch2',   'purchase',   1110,   4, 'Compra Aprovada'),
    n('tyemail',  'email',      1280,   4, 'E-mail de Obrigado'),

    // ── Pós-upsell: não comprou ───────────────
    n('notsold',  'redirect',   1110, 130, 'Não comprou'),
    n('enb1',     'email',      1280, 130, 'Email'),
    n('enb2',     'email',      1420, 130, 'Email'),
    n('enb3',     'email',      1560, 130, 'Email'),

    // ── Sequência boleto ──────────────────────
    n('eb1',      'email',       680, 400, 'Email'),
    n('eb2',      'email',       820, 400, 'Email'),
    n('eb3',      'email',       960, 400, 'Email'),
  ],
  edges: [
    // Tráfego → Landing
    e('e1',  'fb',       'landing',  { srcHandle: 'right', tgtHandle: 'left' }),
    e('e2',  'ig',       'landing',  { srcHandle: 'right', tgtHandle: 'left' }),
    // Landing → Checkout
    e('e3',  'landing',  'checkout', { srcHandle: 'right', tgtHandle: 'left' }),
    // Checkout → Compra / Boleto
    e('e4',  'checkout', 'purch1',   { label: 'Compra Aprovada', srcHandle: 'right', tgtHandle: 'left' }),
    e('e5',  'checkout', 'boleto',   { label: 'Boleto Gerado', dashed: true, srcHandle: 'right', tgtHandle: 'left' }),
    // Compra → Upsell
    e('e6',  'purch1',  'upsell',    { srcHandle: 'right', tgtHandle: 'left' }),
    // Upsell → splits
    e('e7',  'upsell',  'purch2',    { label: 'Compra Aprovada', srcHandle: 'right', tgtHandle: 'left' }),
    e('e8',  'upsell',  'notsold',   { label: 'Não comprou', dashed: true, srcHandle: 'right', tgtHandle: 'left' }),
    // Pós compra
    e('e9',  'purch2',  'tyemail',   { srcHandle: 'right', tgtHandle: 'left' }),
    // Não comprou → emails
    e('e10', 'notsold', 'enb1',      { srcHandle: 'right', tgtHandle: 'left' }),
    e('e11', 'enb1',    'enb2',      { srcHandle: 'right', tgtHandle: 'left' }),
    e('e12', 'enb2',    'enb3',      { srcHandle: 'right', tgtHandle: 'left' }),
    // Boleto → sequência de emails (seta para baixo)
    e('e13', 'boleto',  'eb1',       { color: '#A855F7', dashed: true, srcHandle: 'bottom', tgtHandle: 'top' }),
    e('e14', 'eb1',     'eb2',       { color: '#A855F7', srcHandle: 'right', tgtHandle: 'left' }),
    e('e15', 'eb2',     'eb3',       { color: '#A855F7', srcHandle: 'right', tgtHandle: 'left' }),
  ],
};

// ── Template 2: Jornada Completa do Lead ──────────────────────────────────────
// Baseado no Plano de Operação Comercial Dinamac:
// 3 jornadas paralelas (A=Alto Ticket / B=Médio Ticket / C=Recorrente)
// 5 etapas: Entrada → Qualificado → Em Proposta → Fechamento (3 toques) → Ganho+Pós
export const JORNADA_TEMPLATE = {
  id: null,
  name: 'Jornada Completa Dinamac',
  nodes: [
    // ── Tráfego ──────────────────────────────────────────────────────────────
    n('tg',   'google',      20,   60, 'Google Ads'),
    n('tfb',  'facebook',    20,  200, 'Meta Ads'),
    n('tyt',  'youtube',     20,  340, 'YouTube / Orgânico'),

    // ── Etapa 1: Entrada ──────────────────────────────────────────────────────
    n('lp',   'landing-page', 185, 175, 'Landing Page'),
    n('iara', 'whatsapp',     430, 200, 'Iara — IA'),

    // ── Etapa 2: Qualificado ─── (decision → 3 jornadas) ─────────────────────
    n('dec',  'decision',     625, 200, 'Jornada?'),

    // Lane A (topo, y=30)
    n('jA',       'redirect',  830,   30, 'Jornada A\nAlto Ticket'),
    n('closerA',  'redirect', 1040,   30, 'Closer A'),
    n('propA',    'email',    1240,   30, 'Proposta A'),

    // Lane B (meio, y=200)
    n('jB',       'redirect',  830,  200, 'Jornada B\nMédio Ticket'),
    n('consultB', 'redirect', 1040,  200, 'Consultor B'),
    n('propB',    'email',    1240,  200, 'Proposta B'),

    // Lane C (baixo, y=380)
    n('jC',       'redirect',  830,  380, 'Jornada C\nRecorrente'),
    n('expressC', 'redirect', 1040,  380, 'Express C'),
    n('wonC',     'purchase', 1240,  380, 'Venda C'),

    // ── Etapa 3: Follow-up — Regra dos 3 Toques (lanes A + B) ────────────────
    // Won A (acima da lane A)
    n('wonA',  'purchase',  1430,  -80, 'Venda Ganha A'),

    // Follow-up A
    n('f1A',   'email',     1430,   80, 'Toque 1 · 24h\n(auto Iara)'),
    n('f2A',   'email',     1600,   80, 'Toque 2 · 48h\n(áudio humano)'),
    n('f3A',   'email',     1770,   80, 'Toque 3 · 72h\n(ligação)'),

    // Won B (abaixo da lane B)
    n('wonB',  'purchase',  1430,  320, 'Venda Ganha B'),

    // Follow-up B
    n('f1B',   'email',     1430,  200, 'Toque 1 · 24h\n(auto Iara)'),
    n('f2B',   'email',     1600,  200, 'Toque 2 · 48h\n(áudio humano)'),

    // ── Venda Perdida + Reativação ─────────────────────────────────────────────
    n('lost',  'redirect',  1940,  130, 'Venda Perdida'),
    n('reat',  'email',     2100,  130, 'Reativação 30d'),

    // ── Etapa 4: Pós-Venda (Iara + Hunter) ───────────────────────────────────
    n('pos1',  'email',     1600,  -80, 'Pós-venda\n24h / 15d'),
    n('pos2',  'email',     1770,  -80, 'Manutenção\n90d'),
    n('nps',   'email',     1940,  -80, 'NPS + Indicação\n180d'),

    // ── Cross-sell C ──────────────────────────────────────────────────────────
    n('cross', 'whatsapp',  1430,  380, 'Cross-sell\n(Iara)'),
  ],
  edges: [
    // Tráfego → Landing
    e('eg1',  'tg',   'lp',      { srcHandle: 'right', tgtHandle: 'left' }),
    e('efb',  'tfb',  'lp',      { srcHandle: 'right', tgtHandle: 'left' }),
    e('eyt',  'tyt',  'lp',      { srcHandle: 'right', tgtHandle: 'left' }),

    // Landing → Iara
    e('elp',  'lp',   'iara',    { srcHandle: 'right', tgtHandle: 'left' }),

    // Iara → Decision
    e('eid',  'iara', 'dec',     { srcHandle: 'right', tgtHandle: 'left' }),

    // Decision → 3 jornadas
    e('edA',  'dec',  'jA',      { label: 'Alto ticket', color: '#7C3AED', srcHandle: 'top',    tgtHandle: 'left' }),
    e('edB',  'dec',  'jB',      { label: 'Médio ticket',                  srcHandle: 'right',  tgtHandle: 'left' }),
    e('edC',  'dec',  'jC',      { label: 'Recorrente',  color: '#16A34A', srcHandle: 'bottom', tgtHandle: 'left' }),

    // ── Jornada A ─────────────────────────────────────────────────────────────
    e('eA1',  'jA',      'closerA', { color: '#7C3AED', srcHandle: 'right', tgtHandle: 'left' }),
    e('eA2',  'closerA', 'propA',   { color: '#7C3AED', srcHandle: 'right', tgtHandle: 'left' }),

    // Proposta A → Won ou Follow-up
    e('eA3',  'propA',  'wonA',   { label: 'Fechou!', color: '#16A34A', srcHandle: 'top',   tgtHandle: 'bottom' }),
    e('eA4',  'propA',  'f1A',    { label: 'Sem resp.', dashed: true,   srcHandle: 'right', tgtHandle: 'left' }),

    // Follow-up A → chain → Perdido
    e('eA5',  'f1A',  'f2A',     { srcHandle: 'right', tgtHandle: 'left' }),
    e('eA6',  'f2A',  'f3A',     { srcHandle: 'right', tgtHandle: 'left' }),
    e('eA7',  'f3A',  'lost',    { label: 'Sem resp.', color: '#EF4444', dashed: true, srcHandle: 'right', tgtHandle: 'top' }),

    // Won A → Pós-venda
    e('eA8',  'wonA', 'pos1',    { color: '#16A34A', srcHandle: 'right', tgtHandle: 'left' }),
    e('eA9',  'pos1', 'pos2',    { color: '#16A34A', srcHandle: 'right', tgtHandle: 'left' }),
    e('eA10', 'pos2', 'nps',     { color: '#16A34A', srcHandle: 'right', tgtHandle: 'left' }),

    // ── Jornada B ─────────────────────────────────────────────────────────────
    e('eB1',  'jB',      'consultB', { srcHandle: 'right', tgtHandle: 'left' }),
    e('eB2',  'consultB','propB',    { srcHandle: 'right', tgtHandle: 'left' }),

    // Proposta B → Won ou Follow-up
    e('eB3',  'propB',  'wonB',  { label: 'Fechou!', color: '#16A34A', srcHandle: 'bottom', tgtHandle: 'top' }),
    e('eB4',  'propB',  'f1B',   { label: 'Sem resp.', dashed: true,   srcHandle: 'right',  tgtHandle: 'left' }),

    // Follow-up B → chain → Perdido
    e('eB5',  'f1B',  'f2B',    { srcHandle: 'right', tgtHandle: 'left' }),
    e('eB6',  'f2B',  'lost',   { label: 'Sem resp.', color: '#EF4444', dashed: true, srcHandle: 'right', tgtHandle: 'bottom' }),

    // ── Jornada C ─────────────────────────────────────────────────────────────
    e('eC1',  'jC',      'expressC', { color: '#16A34A', srcHandle: 'right', tgtHandle: 'left' }),
    e('eC2',  'expressC','wonC',     { color: '#16A34A', srcHandle: 'right', tgtHandle: 'left' }),
    e('eC3',  'wonC',    'cross',    { label: 'Cross-sell', color: '#16A34A', srcHandle: 'right', tgtHandle: 'left' }),

    // ── Venda Perdida → Reativação ────────────────────────────────────────────
    e('eL1',  'lost',  'reat',   { color: '#F97316', dashed: true, srcHandle: 'right', tgtHandle: 'left' }),
  ],
};

// ── Template 3: Funil de Mídia Paga ────────────────────────────────────────────
// 10 campanhas Google + Meta pré-preenchidas com spec completa:
// criativo, audiência, URL, copy, KPI e observações por campanha
export const CAMPANHAS_TEMPLATE = {
  id: null,
  name: 'Funil de Mídia Paga — Dinamac',
  nodes: [
    // ── Criativos (coluna esquerda) ──────────────────────────────────────────
    nc('cr-g',   'video-ad',  20, 150, 'Criativos Google', {
      subtitle: 'YouTube · Display',
      creative: 'video-dinamac-luiz-fazenda-30s.mp4 · 3 carrosséis (Micro Trator / Roçadeira / Gerador 6 KVA)',
      notes: 'YouTube: 30s pulável + versão 15s p/ Shorts\nDisplay: 300x250 · 728x90 · 160x600',
    }),
    nc('cr-mv',  'video-ad',  20, 720, 'Criativos Meta — Vídeo', {
      subtitle: 'TOFU · MOFU · BOFU',
      creative: 'Série "Comprei e Testei" (4 vídeos 30-60s) · Calculadora da Roça · Dinamac na Estrada · Depoimento cliente',
      notes: 'GRAVAR: visita JB Apex Semana 3\nCortar versões 15-30s p/ Reels/Stories · Captions abertas',
    }),
    nc('cr-mi',  'image-ad',  20, 920, 'Criativos Meta — Imagem', {
      subtitle: 'MOFU · BOFU',
      creative: 'Carrossel 3 micro tratores c/ preço · Foto produto + "10x sem juros" · Vídeo entrega montada',
      notes: 'CTA: "Falar no WhatsApp" · "Calcular meu ROI" · "Pedir Orçamento"\nUTM trackeado em todos',
    }),
    nc('cr-ltv', 'copy-text', 20, 1120, 'Copy Cross-sell', {
      subtitle: 'Ampulheta · Rotação semanal',
      creative: 'S1: óleo 2T roçadeira · S2: implementos micro trator · S3: manutenção 90d · S4: Oferta Relâmpago Terça',
      notes: 'Rotacionar semanalmente · UTM: ?utm_source=meta&utm_campaign=crosssell',
    }),

    // ── GOOGLE ADS ─────────────────────────────────────────────────────────────
    nc('g-tofu',     'youtube',      240, 60,   'G-TOFU-YOUTUBE-VIDEO', {
      subtitle: 'R$1.000/mês · TOFU',
      creative: 'video-dinamac-luiz-fazenda-30s.mp4',
      url: 'dinamac.com.br',
      copy: 'In-Stream pulável + Shorts · Entusiastas Agro · Sul+Sudeste',
      notes: 'CPV < R$0,10 · View Rate > 25% · CPM < R$15\nExcluir SP capital + RJ capital\nAudiência: Agro/Pecuária + Em mercado: Maquinário pesado',
    }),
    nc('g-mofu',     'google',       460, 60,   'G-MOFU-DISPLAY-REMKT', {
      subtitle: 'R$700/mês · MOFU · Modificar existente',
      creative: '3 carrosséis: Micro Trator R$15-35k / Roçadeira mais vendida / Gerador 6 KVA',
      url: 'dinamac.com.br',
      copy: 'CPA alvo R$30 · Visitantes 30-90d + Lista 9.335 contatos',
      notes: 'CPL < R$40 · CTR > 0,8%\nExcluir compradores últimos 30d\nAdicionar exclusão quem já comprou + segmentar por produto visto',
    }),
    nc('g-bofu-a1',  'google',       680, 0,    'G-BOFU-SEARCH-A1', {
      subtitle: 'R$1.500/mês · BOFU · Jornada A1',
      url: 'dinamac.com.br/micro-tratores-em-oferta',
      copy: '+micro +trator +preço · +motocultivador +18hp · +microtrator +tobata · +mini +trator',
      notes: 'CPL < R$80 · CTR > 5% · Conv > 4%\nNeg: -usado -segunda-mão -grátis -vagas -emprego\nGeo: Sul+SP+MG +30% · Norte/Nordeste -50%',
    }),
    nc('g-bofu-a23', 'google',       680, 155,  'G-BOFU-SEARCH-A23', {
      subtitle: 'R$1.500/mês · BOFU · Jornadas A2+A3',
      url: 'dinamac.com.br/tratores-4x4-premium',
      copy: '+trator +4x4 +25hp · +trator +foton · +trator +kawashima · +trator +cabinado +ar condicionado',
      notes: 'CPL < R$300 · ROAS > 30x\nRaio 500km Curitiba +50% lance\nNeg: -usado -john deere -massey -new holland\nLP: CRIAR DO ZERO /tratores-4x4-premium',
    }),
    nc('g-bofu-b',   'google',       680, 310,  'G-BOFU-SEARCH-B', {
      subtitle: 'R$1.500/mês · BOFU · Jornada B',
      url: 'dinamac.com.br/rocadeiras-em-oferta',
      copy: '+roçadeira +profissional · +motosserra +preço · +cortador +grama +gasolina · +roçadeira +costal',
      notes: 'CPL < R$36 · CTR > 8% · ROAS > 50x\nNeg: -aluguel -usada -conserto -manual\nGrupos separados: /rocadeiras + /motosserras',
    }),
    nc('g-pmax',     'google',       680, 465,  'G-BOFU-PMAX-TODOS', {
      subtitle: 'R$1.500/mês · BOFU · MANTER existente',
      url: 'dinamac.com.br',
      copy: 'PMAX - TODOS OS PRODUTOS - [D] · CPL atual R$13 · meta < R$25',
      notes: '1. Reclassificar: só Compra + Clique WA como primárias\n2. Subir budget R$716→R$1.500/mês\n3. Corrigir bug valor R$1 fixo Tray\n4. Excluir visitantes recentes (deixa pro Search)',
    }),

    // ── Landing pages ─────────────────────────────────────────────────────────
    nc('lp-a1',  'landing-page', 900, 0,   'LP Mini Trator', {
      subtitle: '/micro-tratores-em-oferta',
      url: 'dinamac.com.br/micro-tratores-em-oferta',
      copy: 'Adicionar lead form com botão WhatsApp tagueado no GTM',
      notes: 'Versão c/ lead form · mobile first\nTag GTM: clique WhatsApp obrigatória',
    }),
    nc('lp-a23', 'landing-page', 900, 155, 'LP Trator 4x4 Premium', {
      subtitle: '/tratores-4x4-premium · CRIAR DO ZERO',
      url: 'dinamac.com.br/tratores-4x4-premium',
      copy: 'Nova LP: Foton, Kawashima, YTO 75hp. Specs técnicas + diferenciais entrega.',
      notes: 'CRIAR DO ZERO · mobile first · lead form + CTA WhatsApp\nConteúdo: especificações + entrega montada',
    }),
    nc('lp-b',   'landing-page', 900, 310, 'LP Roçadeira / Motosserra', {
      subtitle: '/rocadeiras-em-oferta · /motosserras-em-oferta',
      url: 'dinamac.com.br/rocadeiras-em-oferta',
      copy: 'Verificar mobile. Grupos separados por produto. CTA WhatsApp tagueado.',
      notes: 'Otimizar mobile · 2 URLs: /rocadeiras + /motosserras',
    }),

    // ── WhatsApp / Iara — destino central ────────────────────────────────────
    nc('wapp',   'whatsapp',    1140, 240, 'Iara / WhatsApp', {
      subtitle: 'Destino central · todas as campanhas',
      url: 'wa.me/5541991197146',
      copy: 'Todas as campanhas convergem aqui. Iara qualifica e direciona ao vendedor certo (A/B/C).',
      notes: 'PRÉ-REQ: Pixel Meta via GTM (GTM-TB9L6N3) + evento Lead no clique WA\nRegra dos 5 min: SDR assume em 30min\nJanela 24h: ativar número secundário não-oficial para follow-up',
    }),

    // ── META ADS ───────────────────────────────────────────────────────────────
    nc('m-tofu',  'facebook',   240, 770, 'M-TOFU-VIDEO-AGRO', {
      subtitle: 'R$1.000/mês · TOFU',
      creative: 'Série "Comprei e Testei" (3-4 vídeos 30-60s) · Captions abertas',
      url: 'dinamac.com.br',
      copy: 'Awareness · ThruPlay · Lookalike 3% clientes + Interesses Agro 25-65a',
      notes: 'CPM < R$10 · ThruPlay > 15% · Frequência 2-3x\nGeo: Brasil excl. SP capital + RJ capital\n2 ad sets: Lookalike 3% + Interesses',
    }),
    nc('m-mofu',  'facebook',   460, 770, 'M-MOFU-LEADS-90D', {
      subtitle: 'R$1.000/mês · MOFU · REAPROVEITAR audiência',
      creative: 'Carrossel 3 micro tratores c/ preço + Vídeo Calculadora ROI + Vídeo depoimento',
      url: 'wa.me/5541991197146',
      copy: 'Leads · Público 90D + Lista Emails — audiência que gerou 29.479 cliques!',
      notes: 'CPL < R$15 · Conv > 5% · COST_CAP R$15 após 1ª semana\n3 audiências: 90D+Emails / Visitantes site / Engajaram vídeo 75%+\nExcluir compradores 30d',
    }),
    nc('m-bofu',  'facebook',   680, 770, 'M-BOFU-CONV-PRODUTO', {
      subtitle: 'R$700/mês · BOFU',
      creative: 'Foto produto + preço "10x sem juros" · Vídeo "Dinamac na Estrada" (entrega montada)',
      url: 'wa.me/5541991197146',
      copy: 'Vendas · Lookalike 1% clientes + visitantes produto + carrinho abandonado Tray',
      notes: 'CPL < R$30 · ROAS > 30x\nExcluir Audience Network · Excluir compradores 60d\nA/B: WhatsApp direto vs. LP específica (30 dias)',
    }),
    nc('m-ltv',   'facebook',   900, 770, 'M-LTV-CROSSSELL', {
      subtitle: 'R$300/mês · Ampulheta',
      creative: 'S1: óleo 2T · S2: implementos micro trator · S3: manutenção 90d · S4: Oferta Terça',
      url: 'wa.me/5541991197146?utm_source=meta&utm_campaign=crosssell',
      copy: 'Cross-sell + reativação · Lista Clientes Ativos (sem lookalike — público controlado)',
      notes: 'CPC link < R$0,30 · Receita atribuída > R$15k/mês\nRotacionar criativos semanal\nDestino: WhatsApp com UTM trackeado',
    }),
  ],
  edges: [
    // Criativos → campanhas
    e('ec1', 'cr-g',  'g-tofu',  { color: '#F97316', srcHandle: 'right', tgtHandle: 'left' }),
    e('ec2', 'cr-g',  'g-mofu',  { color: '#F97316', dashed: true, srcHandle: 'right', tgtHandle: 'left' }),
    e('ec3', 'cr-mv', 'm-tofu',  { color: '#F97316', srcHandle: 'right', tgtHandle: 'left' }),
    e('ec4', 'cr-mi', 'm-mofu',  { color: '#A855F7', srcHandle: 'right', tgtHandle: 'left' }),
    e('ec5', 'cr-mi', 'm-bofu',  { color: '#A855F7', dashed: true, srcHandle: 'right', tgtHandle: 'left' }),
    e('ec6', 'cr-ltv','m-ltv',   { color: '#0EA5E9', srcHandle: 'right', tgtHandle: 'left' }),

    // TOFU → MOFU (audience feeds, dashed)
    e('ef1', 'g-tofu', 'g-mofu', { label: 'Audiência', dashed: true, color: '#94A3B8', srcHandle: 'right', tgtHandle: 'left' }),
    e('ef2', 'm-tofu', 'm-mofu', { label: 'Custom 90d', dashed: true, color: '#94A3B8', srcHandle: 'right', tgtHandle: 'left' }),

    // MOFU → BOFU (retargeting, dashed)
    e('ef3', 'm-mofu', 'm-bofu', { label: 'Leads quentes', dashed: true, color: '#94A3B8', srcHandle: 'right', tgtHandle: 'left' }),

    // BOFU Google → Landing pages
    e('eg1', 'g-bofu-a1',  'lp-a1',  { srcHandle: 'right', tgtHandle: 'left' }),
    e('eg2', 'g-bofu-a23', 'lp-a23', { srcHandle: 'right', tgtHandle: 'left' }),
    e('eg3', 'g-bofu-b',   'lp-b',   { srcHandle: 'right', tgtHandle: 'left' }),
    e('eg4', 'g-pmax',     'wapp',   { srcHandle: 'right', tgtHandle: 'bottom' }),

    // Landing pages → WhatsApp
    e('elp1', 'lp-a1',  'wapp', { color: '#16A34A', srcHandle: 'right', tgtHandle: 'top' }),
    e('elp2', 'lp-a23', 'wapp', { color: '#16A34A', srcHandle: 'right', tgtHandle: 'top' }),
    e('elp3', 'lp-b',   'wapp', { color: '#16A34A', srcHandle: 'right', tgtHandle: 'top' }),

    // Meta BOFU + MOFU → WhatsApp
    e('em1', 'm-bofu', 'wapp', { color: '#25D366', srcHandle: 'right', tgtHandle: 'bottom' }),
    e('em2', 'm-mofu', 'wapp', { label: 'Leads diretos', color: '#25D366', dashed: true, srcHandle: 'right', tgtHandle: 'bottom' }),

    // Cross-sell ↔ WhatsApp
    e('em3', 'm-ltv',  'wapp', { color: '#F97316', dashed: true, srcHandle: 'right', tgtHandle: 'bottom' }),
  ],
};
