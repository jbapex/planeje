export const CAIXA_DOT_STATUS = {
  ABERTA: 'aberta',
  AGUARDANDO_DOT: 'aguardando_dot',
  RESPONDIDO: 'respondido',
  FEITA: 'feita',
  ARQUIVADA: 'arquivada',
  ERRO: 'erro',
};

export const CAIXA_DOT_KIND = {
  DEMANDA: 'demanda',
  CONVERSA: 'conversa',
  AVISO: 'aviso',
};

export const OPEN_DOT_STATUSES = [
  CAIXA_DOT_STATUS.ABERTA,
  CAIXA_DOT_STATUS.AGUARDANDO_DOT,
  CAIXA_DOT_STATUS.RESPONDIDO,
  CAIXA_DOT_STATUS.ERRO,
];

export function previewMessage(body, max = 160) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function normalizeDotTitle(title) {
  const text = String(title || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Informe um título.');
  if (text.length > 200) throw new Error('Título até 200 caracteres.');
  return text;
}

export function normalizeDotBody(body) {
  const text = String(body || '').trim();
  if (!text) throw new Error('Escreva uma mensagem.');
  if (text.length > 8000) throw new Error('Mensagem até 8000 caracteres.');
  return text;
}

export function isOpenDotStatus(status) {
  return OPEN_DOT_STATUSES.includes(status);
}
