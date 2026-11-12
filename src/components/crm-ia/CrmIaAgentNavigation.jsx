import React from 'react';

const textFilled = value => typeof value === 'string' && value.trim().length > 0;

export default function CrmIaAgentNavigation({ draft, rules, published, active, onNavigate }) {
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
