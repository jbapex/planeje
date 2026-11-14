export const KNOWLEDGE_COMPANY_FIELDS = [
  ['name', 'Nome', 120], ['sector', 'Setor', 120], ['about', 'Sobre a empresa', 8000],
  ['phone', 'Telefone', 50], ['email', 'E-mail', 254], ['address', 'Endereço', 1000], ['website', 'Site', 2048],
];
const filled = value => typeof value === 'string' && /[^ \t\r\n]/.test(value);
const hourFilled = row => filled(row.days) && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.end) && row.start < row.end;
const faqFilled = row => filled(row.question) && filled(row.answer);
const policyFilled = row => filled(row.title) && filled(row.content);

export function emptyKnowledgeSections() {
  return { company: Object.fromEntries(KNOWLEDGE_COMPANY_FIELDS.map(([key]) => [key, ''])), hours: [], faq: [], policies: [], context: '' };
}

export function knowledgeSections(base = {}) {
  const value = base.crm_ia_sections;
  if (value && KNOWLEDGE_COMPANY_FIELDS.every(([key]) => typeof value.company?.[key] === 'string')
    && ['hours', 'faq', 'policies'].every(key => Array.isArray(value[key])) && typeof value.context === 'string') return structuredClone(value);
  return { ...emptyKnowledgeSections(), context: base.conteudo || '' };
}

export function compileKnowledgeSections(value) {
  const blocks = [];
  const company = KNOWLEDGE_COMPANY_FIELDS.filter(([key]) => filled(value.company[key])).map(([key, label]) => `${label}: ${value.company[key]}`);
  if (company.length) blocks.push(`Empresa\n${company.join('\n')}`);
  const hours = value.hours.filter(hourFilled).map(row => `${row.days}: ${row.start}–${row.end}`);
  if (hours.length) blocks.push(`Atendimento\n${hours.join('\n')}`);
  const faq = value.faq.filter(faqFilled).map(row => `Pergunta: ${row.question}\nResposta: ${row.answer}`);
  if (faq.length) blocks.push(`Perguntas frequentes\n${faq.join('\n\n')}`);
  const policies = value.policies.filter(policyFilled).map(row => `${row.title}\n${row.content}`);
  if (policies.length) blocks.push(`Políticas\n${policies.join('\n\n')}`);
  // Preserve legacy content exactly when it is the only section.
  if (!blocks.length) return value.context;
  if (value.context) blocks.push(`Contexto adicional\n${value.context}`);
  return blocks.join('\n\n');
}

export function knowledgeCoverage(value) {
  return [Object.values(value.company).some(filled), value.hours.some(hourFilled), value.faq.some(faqFilled), value.policies.some(policyFilled), filled(value.context)].filter(Boolean).length;
}
