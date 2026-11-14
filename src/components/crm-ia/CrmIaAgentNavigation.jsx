import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

const textFilled = value => typeof value === 'string' && value.trim().length > 0;

export function crmIaAgentSections({ draft, rules, published }) {
  const profiles = rules.profiles || [];
  const sections = [
    { id: 'identity', label: 'Identidade', fields: [draft.nome, draft.objetivo, draft.instrucoes].map(textFilled) },
    { id: 'scope', label: 'Etapas e conhecimento', fields: [Boolean(rules.pipeline_id), rules.stage_ids.length > 0, rules.idiomas.length > 0, draft.base_ids.length > 0] },
    ...(rules.tipo === 'qualificacao' ? [
      { id: 'variables', label: 'Variáveis', fields: rules.variaveis.map(item => textFilled(item.nome) && textFilled(item.pergunta)) },
      { id: 'profiles', label: 'Perfis', fields: profiles.map(item => textFilled(item.nome) && textFilled(item.descricao) && /^#[\da-f]{6}$/i.test(item.cor)) },
      { id: 'notification', label: 'Resumo por WhatsApp', fields: [typeof rules.notification?.enabled === 'boolean'], status: rules.notification?.enabled ? 'Resumo autorizado' : 'Aviso desligado' },
    ] : []),
    { id: 'audio', label: 'Áudio', fields: [typeof rules.audio.enabled === 'boolean', typeof rules.audio.input_enabled === 'boolean'], status: rules.audio.enabled || rules.audio.input_enabled ? 'Áudio configurado' : 'Somente texto' },
    { id: 'timing', label: 'Gatilhos e horário', fields: [rules.gatilhos.length > 0, ...rules.janelas.map(item => item.dias?.length > 0 && item.inicio < item.fim), textFilled(rules.mensagem_fora_horario)] },
    ...(rules.tipo === 'followup' ? [{ id: 'cadence', label: 'Cadência', fields: rules.cadencia.map(item => Number.isFinite(item.valor) && item.valor > 0) }] : []),
    ...(rules.tipo === 'agendamento' ? [{ id: 'schedule', label: 'Agendamento', fields: [Boolean(rules.agendamento.owner_id), textFilled(rules.agendamento.title), textFilled(rules.agendamento.instructions), (rules.agendamento.reminders || []).length > 0] }] : []),
    { id: 'handoff', label: 'Conclusão e repasse', fields: [Boolean(rules.destino.tipo), Boolean(rules.destino.stage_id), textFilled(rules.destino.message)] },
    { id: 'autonomy', label: 'Ativação', fields: [typeof draft.ativo === 'boolean', typeof draft.auto_responder === 'boolean'], status: draft.auto_responder ? 'Autonomia autorizada' : 'Autonomia desligada' },
    ...(published ? [{ id: 'test', label: 'Testar versão publicada', fields: [], empty: 'Sem envio' }] : []),
  ];
  return sections;
}

export default function CrmIaAgentNavigation({ draft, rules, published, active, onNavigate }) {
  const sections = crmIaAgentSections({ draft, rules, published });
  const fields = sections.flatMap(section => section.fields);
  const filled = fields.filter(Boolean).length;
  const percent = fields.length ? Math.round(filled / fields.length * 100) : 0;
  return <nav className="crm-ia-agent-nav" aria-label="Seções do agente">
    <div className="crm-ia-agent-completeness"><strong>Preenchimento {percent}%</strong><progress aria-label="Preenchimento da configuração" value={filled} max={fields.length || 1} /><small>Opções vazias podem ser intencionais. A publicação confere as regras.</small></div>
    {sections.map(section => {
      const count = section.fields.filter(Boolean).length;
      const status = section.status || (count ? `${count}/${section.fields.length} preenchidos` : section.empty || (section.fields.length ? 'A preencher' : 'Opcional'));
      return <button type="button" key={section.id} aria-controls={`crm-ia-agent-${section.id}`} aria-current={active === section.id ? 'location' : undefined} onClick={() => onNavigate(section.id)}><span>{section.label}</span><small className="crm-ia-agent-section-status">{status}</small></button>;
    })}
  </nav>;
}

const GUIDANCE = {
  identity: 'Comece por quem atende e pelo objetivo da conversa.', scope: 'Escolha onde o agente atua e o conhecimento que ele pode consultar.',
  variables: 'Organize as informações que ele deve descobrir, na ordem da conversa.', profiles: 'Defina os perfis que ajudam a reconhecer cada oportunidade.',
  notification: 'Escolha quem deve receber o resultado da qualificação.', audio: 'Decida como o agente ouve e responde às mensagens de voz.',
  timing: 'Combine os horários e os pedidos que precisam de uma pessoa.', cadence: 'Defina os intervalos de uma retomada cuidadosa.',
  schedule: 'Prepare a agenda, o compromisso e seus lembretes.', handoff: 'Combine o próximo passo e a passagem para a equipe.',
  autonomy: 'Revise a disponibilidade e a autorização de respostas automáticas.', test: 'Converse com a versão publicada antes de liberar novos atendimentos.',
};
export function CrmIaAgentStep({ draft, rules, published, active, onNavigate, children }) {
  const sections = crmIaAgentSections({ draft, rules, published });
  const position = sections.findIndex(section => section.id === active);
  return <>
    <header className="crm-ia-agent-step-intro" key={active}><span>{`Passo ${position + 1} de ${sections.length}`}</span><p>{GUIDANCE[active]}</p></header>
    <div className="crm-ia-agent-step-fields">{children}</div>
    <nav className="crm-ia-agent-step-actions" aria-label="Avançar na configuração"><button type="button" disabled={position <= 0} onClick={() => onNavigate(sections[position - 1].id)}><ArrowLeft size={14} aria-hidden="true" />Etapa anterior</button>{position < sections.length - 1 && <button type="button" onClick={() => onNavigate(sections[position + 1].id)}>Próxima etapa<ArrowRight size={14} aria-hidden="true" /></button>}</nav>
  </>;
}
