export const NODE_CONFIG = {
  // ── Tráfego ── círculos coloridos ──────────────────────────────────────────
  facebook: {
    label: 'Facebook', shape: 'circle', category: 'Tráfego',
    bg: '#1877F2', gradient: 'linear-gradient(135deg,#1877F2,#0a5dc2)',
    description: 'Anúncios no Facebook',
  },
  instagram: {
    label: 'Instagram', shape: 'circle', category: 'Tráfego',
    bg: '#E1306C', gradient: 'linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)',
    description: 'Anúncios no Instagram',
  },
  google: {
    label: 'Google Ads', shape: 'circle', category: 'Tráfego',
    bg: '#4285F4', gradient: 'linear-gradient(135deg,#4285F4,#34A853)',
    description: 'Google Ads / SEO',
  },
  youtube: {
    label: 'YouTube', shape: 'circle', category: 'Tráfego',
    bg: '#FF0000', gradient: 'linear-gradient(135deg,#FF0000,#cc0000)',
    description: 'Anúncios no YouTube',
  },
  tiktok: {
    label: 'TikTok', shape: 'circle', category: 'Tráfego',
    bg: '#010101', gradient: 'linear-gradient(135deg,#010101,#fe2c55)',
    description: 'Anúncios no TikTok',
  },
  meta: {
    label: 'Meta Ads', shape: 'circle', category: 'Tráfego',
    bg: '#0081FB', gradient: 'linear-gradient(135deg,#0081FB,#0064D2)',
    borderColor: '#0081FB',
    description: 'Campanhas Meta Ads (Facebook + Instagram)',
  },

  // ── Páginas ── mockup de browser ───────────────────────────────────────────
  'landing-page': {
    label: 'Pág. de Vendas', shape: 'browser', content: 'landing', category: 'Páginas',
    ctaColor: '#3B82F6', pageBg: '#F8FAFC',
    description: 'Página de captura / vendas',
  },
  checkout: {
    label: 'Checkout', shape: 'browser', content: 'checkout', category: 'Páginas',
    ctaColor: '#3B82F6', pageBg: '#F8FAFC',
    description: 'Checkout com Order Bump',
  },
  upsell: {
    label: 'Upsell', shape: 'browser', content: 'upsell', category: 'Páginas',
    ctaColor: '#F97316', pageBg: '#F8FAFC',
    description: 'Página de upsell / downsell',
  },
  'thank-you-page': {
    label: 'Pág. Obrigado', shape: 'browser', content: 'thankyou', category: 'Páginas',
    ctaColor: '#16A34A', pageBg: '#F0FDF4',
    description: 'Página de confirmação',
  },
  webinar: {
    label: 'Webinar', shape: 'browser', content: 'webinar', category: 'Páginas',
    ctaColor: '#7C3AED', pageBg: '#F5F3FF',
    description: 'Página de evento / webinar',
  },

  // ── Ações ── círculos com ícone ────────────────────────────────────────────
  email: {
    label: 'Email', shape: 'circle', category: 'Ações',
    bg: '#3B82F6', gradient: 'linear-gradient(135deg,#3B82F6,#2563EB)',
    description: 'Email da sequência',
  },
  purchase: {
    label: 'Compra Aprovada', shape: 'circle', category: 'Ações',
    bg: '#14B8A6', gradient: 'linear-gradient(135deg,#14B8A6,#0D9488)',
    description: 'Confirmação de compra',
  },
  whatsapp: {
    label: 'WhatsApp', shape: 'circle', category: 'Ações',
    bg: '#25D366', gradient: 'linear-gradient(135deg,#25D366,#128C7E)',
    description: 'Mensagem via WhatsApp',
  },
  sms: {
    label: 'SMS', shape: 'circle', category: 'Ações',
    bg: '#F97316', gradient: 'linear-gradient(135deg,#F97316,#EA580C)',
    description: 'Mensagem SMS',
  },
  redirect: {
    label: 'Redirect', shape: 'circle', category: 'Ações',
    bg: '#14B8A6', gradient: 'linear-gradient(135deg,#14B8A6,#0891B2)',
    description: 'Redirecionamento / saída',
  },

  // ── Decisões ── diamante ───────────────────────────────────────────────────
  boleto: {
    label: 'Boleto Gerado', shape: 'diamond', category: 'Decisões',
    bg: '#A855F7', gradient: 'linear-gradient(135deg,#A855F7,#7C3AED)',
    description: 'Pagamento por boleto',
  },
  decision: {
    label: 'Decisão', shape: 'diamond', category: 'Decisões',
    bg: '#64748B', gradient: 'linear-gradient(135deg,#64748B,#475569)',
    description: 'Ponto de decisão A/B',
  },

  // ── IA & Equipe ───────────────────────────────────────────────────────────
  'ia-bot': {
    label: 'IA / Iara', shape: 'circle', category: 'IA & Equipe',
    bg: '#6366F1', gradient: 'linear-gradient(135deg,#818CF8,#6366F1)',
    borderColor: '#6366F1',
    description: 'Bot de IA — qualificação e follow-up automático',
  },
  sdr: {
    label: 'SDR', shape: 'circle', category: 'IA & Equipe',
    bg: '#475569', gradient: 'linear-gradient(135deg,#64748B,#475569)',
    borderColor: '#475569',
    description: 'SDR — qualifica e distribui leads ao vendedor certo',
  },
  vendedor: {
    label: 'Vendedor', shape: 'circle', category: 'IA & Equipe',
    bg: '#2563EB', gradient: 'linear-gradient(135deg,#3B82F6,#2563EB)',
    borderColor: '#2563EB',
    description: 'Closer A / Consultor B / Express C',
  },
  phone: {
    label: 'Ligação', shape: 'circle', category: 'IA & Equipe',
    bg: '#16A34A', gradient: 'linear-gradient(135deg,#22C55E,#16A34A)',
    borderColor: '#16A34A',
    description: 'Ligação telefônica — Toque 3 da Regra dos 3 Toques',
  },
  proposta: {
    label: 'Proposta', shape: 'circle', category: 'IA & Equipe',
    bg: '#D97706', gradient: 'linear-gradient(135deg,#F59E0B,#D97706)',
    borderColor: '#D97706',
    description: 'Proposta / orçamento enviado ao lead',
  },
  crm: {
    label: 'CRM / Gênio', shape: 'circle', category: 'IA & Equipe',
    bg: '#0891B2', gradient: 'linear-gradient(135deg,#06B6D4,#0891B2)',
    borderColor: '#0891B2',
    description: 'CRM Gênio — registro e acompanhamento do pipeline',
  },

  // ── Jornadas ─── diamantes coloridos por segmento ──────────────────────
  'jornada-a': {
    label: 'Jornada A', shape: 'diamond', category: 'Jornadas',
    bg: '#7C3AED', gradient: 'linear-gradient(135deg,#A78BFA,#7C3AED)',
    borderColor: '#7C3AED',
    description: 'Jornada A · Alto Ticket — micro trator, gerador, industrial (R$15k–R$150k)',
  },
  'jornada-b': {
    label: 'Jornada B', shape: 'diamond', category: 'Jornadas',
    bg: '#2563EB', gradient: 'linear-gradient(135deg,#60A5FA,#2563EB)',
    borderColor: '#2563EB',
    description: 'Jornada B · Médio Ticket — roçadeira, motosserra, implemento (R$2k–R$15k)',
  },
  'jornada-c': {
    label: 'Jornada C', shape: 'diamond', category: 'Jornadas',
    bg: '#16A34A', gradient: 'linear-gradient(135deg,#4ADE80,#16A34A)',
    borderColor: '#16A34A',
    description: 'Jornada C · Recorrente — peças, óleo, acessórios (R$50–R$2k)',
  },
  won: {
    label: 'Venda Ganha', shape: 'circle', category: 'Jornadas',
    bg: '#15803D', gradient: 'linear-gradient(135deg,#22C55E,#15803D)',
    borderColor: '#15803D',
    description: 'Venda fechada — NF emitida',
  },
  lost: {
    label: 'Venda Perdida', shape: 'circle', category: 'Jornadas',
    bg: '#DC2626', gradient: 'linear-gradient(135deg,#F87171,#DC2626)',
    borderColor: '#DC2626',
    description: 'Lead perdido — documentar motivo obrigatório',
  },

  // ── Pós-venda ── extensões de Jornadas ───────────────────────────────────
  entrega: {
    label: 'Entrega', shape: 'circle', category: 'Jornadas',
    bg: '#0891B2', gradient: 'linear-gradient(135deg,#06B6D4,#0891B2)',
    borderColor: '#0891B2',
    description: 'Produto entregue — confirmação de recebimento',
  },
  nps: {
    label: 'NPS', shape: 'circle', category: 'Jornadas',
    bg: '#7C3AED', gradient: 'linear-gradient(135deg,#A78BFA,#7C3AED)',
    borderColor: '#7C3AED',
    description: 'Pesquisa de satisfação pós-venda',
  },
  indicacao: {
    label: 'Indicação', shape: 'circle', category: 'Jornadas',
    bg: '#D97706', gradient: 'linear-gradient(135deg,#F59E0B,#D97706)',
    borderColor: '#D97706',
    description: 'Programa de indicação — cliente indica novo lead',
  },
  reativacao: {
    label: 'Reativação', shape: 'circle', category: 'Jornadas',
    bg: '#DC2626', gradient: 'linear-gradient(135deg,#F87171,#DC2626)',
    borderColor: '#DC2626',
    description: 'Reativação de cliente inativo',
  },

  // ── Rastreamento ── círculos com ícone ────────────────────────────────────
  'pixel-meta': {
    label: 'Pixel Meta', shape: 'circle', category: 'Rastreamento',
    bg: '#0081FB', gradient: 'linear-gradient(135deg,#0081FB,#0064D2)',
    borderColor: '#0081FB',
    description: 'Pixel do Meta — rastreia eventos e conversões',
  },
  gtm: {
    label: 'GTM', shape: 'circle', category: 'Rastreamento',
    bg: '#4285F4', gradient: 'linear-gradient(135deg,#4285F4,#2563EB)',
    borderColor: '#4285F4',
    description: 'Google Tag Manager — gerencia todas as tags',
  },
  ga4: {
    label: 'GA4', shape: 'circle', category: 'Rastreamento',
    bg: '#F9AB00', gradient: 'linear-gradient(135deg,#FCD34D,#F9AB00)',
    borderColor: '#F9AB00',
    description: 'Google Analytics 4 — análise de comportamento',
  },
  evento: {
    label: 'Evento', shape: 'circle', category: 'Rastreamento',
    bg: '#EA580C', gradient: 'linear-gradient(135deg,#F97316,#EA580C)',
    borderColor: '#EA580C',
    description: 'Evento customizado — Purchase, Lead, ViewContent…',
  },
  audiencia: {
    label: 'Audiência Custom', shape: 'circle', category: 'Rastreamento',
    bg: '#7C3AED', gradient: 'linear-gradient(135deg,#A78BFA,#7C3AED)',
    borderColor: '#7C3AED',
    description: 'Audiência customizada para remarketing',
  },
  lookalike: {
    label: 'Lookalike', shape: 'circle', category: 'Rastreamento',
    bg: '#0064D2', gradient: 'linear-gradient(135deg,#3B82F6,#0064D2)',
    borderColor: '#0064D2',
    description: 'Audiência lookalike — semelhantes aos compradores',
  },
  utm: {
    label: 'UTM / Parâm.', shape: 'circle', category: 'Rastreamento',
    bg: '#16A34A', gradient: 'linear-gradient(135deg,#22C55E,#16A34A)',
    borderColor: '#16A34A',
    description: 'Parâmetros UTM — source, medium, campaign, content',
  },

  // ── Automação ── círculos com ícone ───────────────────────────────────────
  automacao: {
    label: 'Automação', shape: 'circle', category: 'Automação',
    bg: '#6366F1', gradient: 'linear-gradient(135deg,#818CF8,#6366F1)',
    borderColor: '#6366F1',
    description: 'Fluxo de automação — e-mail, SMS, WhatsApp',
  },
  gatilho: {
    label: 'Gatilho', shape: 'circle', category: 'Automação',
    bg: '#DC2626', gradient: 'linear-gradient(135deg,#F87171,#DC2626)',
    borderColor: '#DC2626',
    description: 'Gatilho de evento — dispara ação automaticamente',
  },
  wait: {
    label: 'Aguardar', shape: 'circle', category: 'Automação',
    bg: '#64748B', gradient: 'linear-gradient(135deg,#94A3B8,#64748B)',
    borderColor: '#64748B',
    description: 'Delay / espera — aguarda X horas/dias antes do próximo passo',
  },
  'tag-seg': {
    label: 'Tag / Segmento', shape: 'circle', category: 'Automação',
    bg: '#0891B2', gradient: 'linear-gradient(135deg,#06B6D4,#0891B2)',
    borderColor: '#0891B2',
    description: 'Aplica tag ou segmento ao contato',
  },

  // ── Criativos ── círculos com ícone ───────────────────────────────────────
  'video-ad': {
    label: 'Vídeo Ad', shape: 'circle', category: 'Criativos',
    bg: '#EA4C1D', gradient: 'linear-gradient(135deg,#F97316,#EA4C1D)',
    borderColor: '#EA4C1D',
    description: 'Criativo em vídeo',
  },
  'image-ad': {
    label: 'Imagem Ad', shape: 'circle', category: 'Criativos',
    bg: '#7C3AED', gradient: 'linear-gradient(135deg,#A78BFA,#7C3AED)',
    borderColor: '#7C3AED',
    description: 'Criativo em imagem',
  },
  'story-ad': {
    label: 'Story / Reels', shape: 'circle', category: 'Criativos',
    bg: '#E1306C', gradient: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)',
    borderColor: '#E1306C',
    description: 'Story ou Reels',
  },
  'copy-text': {
    label: 'Copy / Texto', shape: 'circle', category: 'Criativos',
    bg: '#0EA5E9', gradient: 'linear-gradient(135deg,#38BDF8,#0284C7)',
    borderColor: '#0EA5E9',
    description: 'Texto do anúncio',
  },
};

export const CATEGORIES = ['Tráfego', 'Criativos', 'Páginas', 'IA & Equipe', 'Ações', 'Jornadas', 'Rastreamento', 'Automação', 'Decisões'];
