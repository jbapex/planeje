/** Abas do hub Rastreamento, alinhadas à operação do TRACK-APICE. */

export const RASTREAMENTO_CLIENT_STORAGE_KEY = 'planeje-rastreamento-cliente-id';

export const RASTREAMENTO_TABS = [
  { id: 'visao', label: 'Visão geral', aliases: [], hidden: false },
  { id: 'leads', label: 'Leads', aliases: ['contatos'], hidden: false },
  { id: 'relatorio', label: 'Relatórios', aliases: ['relatorio'], hidden: false },
  { id: 'eventos', label: 'Eventos', aliases: ['eventos-meta', 'eventos-google'], hidden: false },
  { id: 'funil', label: 'Funil', aliases: [], hidden: true },
  { id: 'links', label: 'Links', aliases: ['link', 'links-rastreaveis', 'rastreaveis'], hidden: false },
  { id: 'integracoes', label: 'Integrações', aliases: [], hidden: false },
  { id: 'configuracoes', label: 'Configurações', aliases: ['config', 'settings', 'jornada'], hidden: false },
];

export const RASTREAMENTO_VISIBLE_TABS = RASTREAMENTO_TABS.filter((tab) => !tab.hidden);

export function readStoredRastreamentoClienteId() {
  try {
    return localStorage.getItem(RASTREAMENTO_CLIENT_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function storeRastreamentoClienteId(clienteId) {
  try {
    if (clienteId) localStorage.setItem(RASTREAMENTO_CLIENT_STORAGE_KEY, String(clienteId));
    else localStorage.removeItem(RASTREAMENTO_CLIENT_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

const TAB_BY_ALIAS = new Map(
  RASTREAMENTO_TABS.flatMap((tab) => [
    [tab.id, tab.id],
    ...tab.aliases.map((alias) => [alias, tab.id]),
  ]),
);

export const DEFAULT_RASTREAMENTO_TAB = 'visao';

export function resolveRastreamentoTab(aba) {
  const raw = String(aba || '')
    .trim()
    .toLowerCase();
  if (!raw) return DEFAULT_RASTREAMENTO_TAB;
  return TAB_BY_ALIAS.get(raw) || DEFAULT_RASTREAMENTO_TAB;
}

/** `null` omite `aba` da URL (visão geral). */
export function rastreamentoTabSearchValue(tabId) {
  const resolved = resolveRastreamentoTab(tabId);
  return resolved === DEFAULT_RASTREAMENTO_TAB ? null : resolved;
}

export function rastreamentoTabSubtitle(tabId) {
  switch (resolveRastreamentoTab(tabId)) {
    case 'visao':
      return 'Investimento, conversas Meta e reais, funil da jornada e comparação diária';
    case 'leads':
      return 'Leads rastreados pelo WhatsApp pago (ctwaClid)';
    case 'relatorio':
      return 'Relatórios Meta, Google e Site, fontes, conversas reais e etiquetas de análise';
    case 'eventos':
      return 'Auditoria Meta CAPI e Google Ads (gclid)';
    case 'funil':
      return 'Funil de mídia e atribuição';
    case 'links':
      return 'Links /r/ para Google Ads, Meta no site e botão do site — sem pixel Meta nem CAPI';
    case 'integracoes':
      return 'Meta Ads por token, Google Ads conversões, instâncias Uazapi, webhook Chatvolt e destino CAPI';
    case 'configuracoes':
      return 'Jornada e gatilhos de conversão';
    default:
      return '';
  }
}

/** Texto longo das abas: vai no ícone `?`, não no corpo da tela. */
export function rastreamentoTabHelp(tabId) {
  switch (resolveRastreamentoTab(tabId)) {
    case 'visao':
      return 'O período (Hoje, 7 dias etc.) é o mesmo das abas Leads e Eventos, no fuso de Brasília. Conversas Meta vêm do Gerenciador; conversas reais são WhatsApp com anúncio na primeira mensagem. O funil segue os gatilhos ativos. O quadro de baixo é saúde CAPI (últimos 200), não a contagem do período.';
    case 'leads':
      return 'O período é o mesmo da Visão geral e dos Eventos. A lista filtra Meta (CTWA), Google, Site ou sem origem. Na ficha, marque Qualificado, Comprou e o valor — isso segue a jornada e pode ir à Meta. Não responde, Desqualificado ou outra etiqueta ficam só para análise. Clique no nome ou no olho para atribuição: CTWA mostra criativo e jornada CAPI; Google/Site mostram UTM e gclid/fbclid, sem CAPI nem criativo Graph. Se a conversa iniciada não chegou à Meta e o lead tem clique CTWA, envie de novo na ficha.';
    case 'relatorio':
      return 'Escolha Meta, Google ou Site dentro de Relatórios. O período selecionado vale para as três abas. Em Site, clique no cartão de utm_source para filtrar a origem; Sem source informado reúne Site sem esse parâmetro. A primeira origem registrada permanece principal. Leads usam a última atividade. Conversas reais e Qualificados usam a primeira mensagem no WhatsApp com origem da plataforma. Formulário sem conversa não entra nessas duas colunas. Gasto vem das contas vinculadas apenas nas abas de anúncios. Google sem campanha identificada permanece visível, sem custo associado por suposição. Não responde e Desqualificado são etiquetas só de análise.';
    case 'eventos':
      return 'O período é o mesmo da Visão geral e dos Leads. Em Meta: Conversas iniciadas e envios CAPI. Clique no lead abre a atribuição. Conversa iniciada reenvia quando há CTWA e ainda não houve sucesso. Qualificado/Compra: reenviar só vale para falha de rede.';
    case 'funil':
      return 'Funil de mídia e atribuição. Esta aba fica oculta; abra com ?aba=funil.';
    case 'links':
      return 'Gere o link /r/ do cliente com o número WhatsApp já ligado. Use na URL final do Google, no anúncio Meta que manda ao site, ou no botão do site. O script do site grava cookies 7 dias (gclid/fbclid/utm) e injeta nos links Planeje — não é pixel Meta nem CAPI. A origem entra na primeira mensagem do WhatsApp e não sobrescreve CTWA.';
    case 'integracoes':
      return 'Ligar Meta, Google Ads (devolver conversões com gclid), as instâncias WhatsApp Uazapi da agência, o webhook do Chatvolt deste cliente e o destino CAPI. Na Meta, o token permanente da mesma BM pode ser reaproveitado de outra conta já conectada; o que muda por cliente são contas, Pixel e Página. Sem WABA nesta tela. Links rastreáveis ficam na aba Links.';
    case 'configuracoes':
      return 'A primeira mensagem de anúncio envia Conversa iniciada (LeadSubmitted). Cadastre gatilhos extras — etiqueta ou frase — só para lead pago: Lead, Qualificado, Checkout iniciado ou Compra.';
    default:
      return '';
  }
}
