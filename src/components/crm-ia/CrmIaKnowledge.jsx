import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Clock, HelpCircle, Shield, Sparkles } from 'lucide-react';
import { CrmIaEditor, CrmIaField } from './CrmIaPrimitives';
import { named, versionOf } from './crmIaPresentation';
import { KNOWLEDGE_COMPANY_FIELDS, compileKnowledgeSections, emptyKnowledgeSections, knowledgeCoverage, knowledgeSections } from '../../../supabase/functions/_shared/crmIaKnowledge';
import './CrmIaKnowledge.css';

const SECTIONS = [
  ['company', 'Empresa', 'Identidade e contato', Building2], ['hours', 'Atendimento', 'Dias e horários', Clock],
  ['faq', 'Perguntas frequentes', 'Respostas rápidas', HelpCircle], ['policies', 'Políticas', 'Regras do negócio', Shield],
  ['context', 'Contexto adicional', 'Orientações para a IA', Sparkles],
];
const EMPTY_BASES = [];
function compareKnowledgeVersion(left, right) {
  const milliseconds = Date.parse(left) - Date.parse(right);
  if (milliseconds !== 0) return milliseconds;
  const [a, b] = [left, right].map(value => (String(value).match(/\.(\d{1,6})/)?.[1] || '').padEnd(6, '0'));
  return a > b ? 1 : a < b ? -1 : 0;
}

export default function CrmIaKnowledge({ workspace, mutate, canManage, active }) {
  const bases = workspace.bases || EMPTY_BASES;
  const [selected, setSelected] = useState(bases[0] || null);
  const [dirty, setDirty] = useState(false);
  const [nameEditor, setNameEditor] = useState(null);
  const [naming, setNaming] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const mounted = useRef(true), permission = useRef(canManage), namingBusy = useRef(false);
  permission.current = canManage;
  useEffect(() => { mounted.current = true;return () => { mounted.current = false; }; }, []);
  const selectedId = selected?.id || bases[0]?.id;
  const latest = bases.find(item => item.id === selectedId);
  // A confirmed write must survive an older or failed workspace refresh.
  let row = latest || selected;
  if (latest && selected && compareKnowledgeVersion(selected.updated_at, latest.updated_at) >= 0) row = selected;
  if (!latest && !canManage) row = null;
  const options = !latest && row ? [...bases, row] : bases;
  useEffect(() => {
    if (!canManage && selected && !bases.some(item => item.id === selected.id)) { setSelected(null);setDirty(false);setNameEditor(null); }
  }, [canManage, selected, bases]);
  function choose(id) {
    if (dirty || namingBusy.current) return;
    setSelected(bases.find(item => item.id === id) || null);
  }
  async function saveName() {
    if (!permission.current) throw Error('Você tem acesso somente para consulta.');
    if (namingBusy.current) throw Error('Aguarde a confirmação da base.');
    const source = nameEditor.row;
    namingBusy.current = true;setNaming(true);
    try {
      const saved = await mutate('save_base', { ...(source ? versionOf(source) : {}), nome: nameEditor.value.trim(), crm_ia_sections: source ? knowledgeSections(source) : emptyKnowledgeSections() });
      if (!mounted.current) return;
      setSelected(saved);setFormRevision(value => value + 1);setDirty(false);setNameEditor(null);
    } finally { namingBusy.current = false;if (mounted.current) setNaming(false); }
  }
  const config = workspace.config.data;
  const bindings = row ? [
    ...(config.knowledge?.assignments || []).filter(item => item.base_id === row.id).map(item => `Funil: ${named(workspace.pipelines.find(pipeline => pipeline.id === item.pipeline_id))}`),
    ...workspace.agents.filter(agent => agent.base_ids?.includes(row.id)).map(agent => `Agente: ${named(agent)}`),
    ...((config.concierge?.base_id || config.knowledge?.concierge_base_id) === row.id ? ['Concierge'] : []),
  ] : [];
  return <section className="crm-ia-knowledge" hidden={!active}>
    <header className="crm-ia-knowledge-header">
      <div><small className="crm-ia-muted">BASE DE CONHECIMENTO</small><h2>{row ? `Ensine a IA sobre ${row.nome}` : 'Ensine a IA sobre sua empresa'}</h2><p className="crm-ia-muted">Este conteúdo orienta os agentes dos funis vinculados e o Concierge.</p></div>
      <div className="crm-ia-toolbar"><CrmIaField label="Base de conhecimento" value={selectedId || ''} disabled={dirty || naming || !options.length} onChange={choose} options={options.length ? options : [{ value: '', label: 'Nenhuma base' }]} />
        {canManage && <><button type="button" disabled={dirty || naming} onClick={() => setNameEditor({ value: '', row: null })}>Nova base</button>{row && <button type="button" disabled={dirty || naming} onClick={() => setNameEditor({ value: row.nome, row })}>Renomear base</button>}</>}
      </div>
      {dirty && <p className="crm-ia-muted">Salve ou descarte as alterações antes de trocar de base.</p>}
      {row && <div className="crm-ia-knowledge-bindings"><span>Vínculos configurados</span>{bindings.length ? bindings.map((label, index) => <span className="crm-ia-badge" key={index}>{label}</span>) : <span className="crm-ia-muted">Nenhum vínculo definido.</span>}<Link className="crm-ia-link-button" to={`/crm-ia/configuracoes?cliente=${encodeURIComponent(workspace.client.id)}&aba=knowledge`}>Vincular funis e Concierge</Link></div>}
    </header>
    {row ? <KnowledgeForm key={`${row.id}:${formRevision}`} {...{ row, mutate }} canManage={canManage && !naming} onDirty={setDirty} onSaved={setSelected} /> : <p className="crm-ia-state">Nenhuma base de conhecimento disponível.{canManage && ' Crie uma base para começar.'}</p>}
    {nameEditor && <CrmIaEditor open={active} title={nameEditor.row ? 'Renomear base' : 'Nova base'} disabled={!canManage || naming} onClose={() => { if (!namingBusy.current) setNameEditor(null); }} onSave={saveName} saveLabel={nameEditor.row ? 'Renomear' : 'Criar base'}><CrmIaField label="Nome da base" value={nameEditor.value} onChange={value => setNameEditor(previous => ({ ...previous, value }))} maxLength={80} required /></CrmIaEditor>}
  </section>;
}

function KnowledgeForm({ row, canManage, mutate, onDirty, onSaved }) {
  const [source, setSource] = useState(row);
  const [draft, setDraft] = useState(() => knowledgeSections(row));
  const [section, setSection] = useState('company');
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const mounted = useRef(true), busy = useRef(false), permission = useRef(canManage), sectionRefs = useRef({});
  permission.current = canManage;
  const dirty = JSON.stringify(draft) !== JSON.stringify(knowledgeSections(source));
  const sourceChanged = row.updated_at !== source.updated_at;
  const coverage = knowledgeCoverage(draft), characters = [...compileKnowledgeSections(draft)].length;
  useEffect(() => { mounted.current = true;return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  function change(key, value) {
    if (!permission.current || busy.current) return;
    setDraft(previous => ({ ...previous, [key]: value }));setSaved(false);
  }
  function editRow(key, index, field, value) { change(key, draft[key].map((item, i) => i === index ? { ...item, [field]: value } : item)); }
  const addHour = () => change('hours', [...draft.hours, { days: '', start: '09:00', end: '18:00' }]);
  const addFaq = () => change('faq', [...draft.faq, { question: '', answer: '' }]);
  const addPolicy = () => change('policies', [...draft.policies, { title: '', content: '' }]);
  function navigate(id) { setSection(id);sectionRefs.current[id]?.scrollIntoView({ block: 'start' }); }
  function discard() { if (busy.current) return;setSource(row);setDraft(knowledgeSections(row));setError('');setSaved(false); }
  async function save(event) {
    event.preventDefault();if (busy.current || !permission.current || !dirty) return;
    busy.current = true;setPending(true);setError('');setSaved(false);
    try {
      if (characters > 30000) throw Error('O conteúdo da base excede 30.000 caracteres.');
      if (draft.hours.some(item => item.start >= item.end)) throw Error('O fechamento deve ser depois da abertura em cada horário.');
      const result = await mutate('save_base', { ...versionOf(source), nome: source.nome, crm_ia_sections: draft });
      if (!mounted.current) return;
      setSource(result);setDraft(knowledgeSections(result));setSaved(true);onSaved(result);
    } catch (failure) { if (mounted.current) setError(failure.message || 'Não foi possível salvar a base.'); }
    finally { busy.current = false;if (mounted.current) setPending(false); }
  }
  return <div className="crm-ia-knowledge-layout">
    <nav className="crm-ia-knowledge-nav" aria-label="Seções da base de conhecimento">
      <div className="crm-ia-knowledge-coverage"><span>Cobertura da base</span><strong>{coverage} de 5 seções</strong><progress aria-label="Cobertura da base" value={coverage} max={5} /></div>
      {SECTIONS.map(([id, label, description, Icon]) => <button type="button" key={id} aria-current={section === id ? 'location' : undefined} aria-controls={`crm-ia-knowledge-${id}`} onClick={() => navigate(id)}><Icon size={16} aria-hidden="true" /><span>{label}<small>{id === 'hours' ? `${draft.hours.length} horário${draft.hours.length === 1 ? '' : 's'}` : id === 'faq' ? `${draft.faq.length} resposta${draft.faq.length === 1 ? '' : 's'}` : id === 'policies' ? `${draft.policies.length} política${draft.policies.length === 1 ? '' : 's'}` : description}</small></span></button>)}
    </nav>
    <form className="crm-ia-knowledge-form" onSubmit={save}>
      <fieldset disabled={pending || !canManage}>
        <section className="crm-ia-card" id="crm-ia-knowledge-company" ref={element => { sectionRefs.current.company = element; }} aria-labelledby="crm-ia-knowledge-company-title"><h3 id="crm-ia-knowledge-company-title">Empresa</h3><p className="crm-ia-muted">Identidade e contato que a IA pode compartilhar quando o lead pedir.</p><div className="crm-ia-knowledge-company">
          {KNOWLEDGE_COMPANY_FIELDS.map(([key, label, maxLength]) => <div key={key} className={key === 'about' ? 'crm-ia-knowledge-wide' : undefined}><CrmIaField label={key === 'name' ? 'Nome da empresa' : label} type={key === 'about' ? 'textarea' : key === 'email' ? 'email' : key === 'website' ? 'url' : key === 'phone' ? 'tel' : 'text'} value={draft.company[key]} onChange={value => change('company', { ...draft.company, [key]: value })} maxLength={maxLength} /></div>)}
        </div></section>
        <section className="crm-ia-card" id="crm-ia-knowledge-hours" ref={element => { sectionRefs.current.hours = element; }} aria-labelledby="crm-ia-knowledge-hours-title"><div className="crm-ia-section-heading"><h3 id="crm-ia-knowledge-hours-title">Atendimento</h3><button type="button" disabled={draft.hours.length >= 30} onClick={addHour}>Adicionar horário</button></div><p className="crm-ia-muted">Dias e horários da equipe. A disponibilidade para compromissos é configurada na Agenda.</p>
          {draft.hours.map((item, index) => <fieldset className="crm-ia-knowledge-row" key={index}><legend>Faixa {index + 1}</legend><div className="crm-ia-knowledge-hours-row"><CrmIaField label={`Dias do horário ${index + 1}`} value={item.days} placeholder="Ex.: Seg–Sex" required maxLength={80} onChange={value => editRow('hours', index, 'days', value)} /><CrmIaField label={`Abertura do horário ${index + 1}`} type="time" value={item.start} required onChange={value => editRow('hours', index, 'start', value)} /><CrmIaField label={`Fechamento do horário ${index + 1}`} type="time" value={item.end} required min={item.start || undefined} onChange={value => editRow('hours', index, 'end', value)} /><button type="button" onClick={() => change('hours', draft.hours.filter((_, i) => i !== index))}>Remover faixa {index + 1}</button></div></fieldset>)}
          {!draft.hours.length && <p className="crm-ia-state">Nenhum horário cadastrado.</p>}
        </section>
        <section className="crm-ia-card" id="crm-ia-knowledge-faq" ref={element => { sectionRefs.current.faq = element; }} aria-labelledby="crm-ia-knowledge-faq-title"><div className="crm-ia-section-heading"><h3 id="crm-ia-knowledge-faq-title">Perguntas frequentes</h3><button type="button" disabled={draft.faq.length >= 50} onClick={addFaq}>Nova pergunta</button></div><p className="crm-ia-muted">Cadastre respostas objetivas para as dúvidas que mais aparecem nas conversas.</p>
          {draft.faq.map((item, index) => <fieldset className="crm-ia-knowledge-row" key={index}><legend>Pergunta {index + 1}</legend><CrmIaField label={`Pergunta ${index + 1}`} value={item.question} required maxLength={300} onChange={value => editRow('faq', index, 'question', value)} /><CrmIaField label={`Resposta ${index + 1}`} type="textarea" value={item.answer} required maxLength={4000} onChange={value => editRow('faq', index, 'answer', value)} /><button type="button" onClick={() => change('faq', draft.faq.filter((_, i) => i !== index))}>Remover pergunta {index + 1}</button></fieldset>)}
          {!draft.faq.length && <p className="crm-ia-state">Ainda não há perguntas. Comece pela dúvida que sua equipe responde todos os dias.</p>}
        </section>
        <section className="crm-ia-card" id="crm-ia-knowledge-policies" ref={element => { sectionRefs.current.policies = element; }} aria-labelledby="crm-ia-knowledge-policies-title"><div className="crm-ia-section-heading"><h3 id="crm-ia-knowledge-policies-title">Políticas</h3><button type="button" disabled={draft.policies.length >= 30} onClick={addPolicy}>Nova política</button></div><p className="crm-ia-muted">Registre regras de pagamento, cancelamento e outras orientações importantes.</p>
          {draft.policies.map((item, index) => <fieldset className="crm-ia-knowledge-row" key={index}><legend>Política {index + 1}</legend><CrmIaField label={`Título da política ${index + 1}`} value={item.title} required maxLength={120} onChange={value => editRow('policies', index, 'title', value)} /><CrmIaField label={`Conteúdo da política ${index + 1}`} type="textarea" value={item.content} required maxLength={4000} onChange={value => editRow('policies', index, 'content', value)} /><button type="button" onClick={() => change('policies', draft.policies.filter((_, i) => i !== index))}>Remover política {index + 1}</button></fieldset>)}
          {!draft.policies.length && <p className="crm-ia-state">Nenhuma política cadastrada.</p>}
        </section>
        <section className="crm-ia-card" id="crm-ia-knowledge-context" ref={element => { sectionRefs.current.context = element; }} aria-labelledby="crm-ia-knowledge-context-title"><h3 id="crm-ia-knowledge-context-title">Contexto adicional</h3><p className="crm-ia-muted">Inclua particularidades e orientações que não se encaixam nas outras seções.</p>{source.crm_ia_sections == null && source.conteudo && <p className="crm-ia-muted">O conteúdo anterior foi preservado aqui. Organize-o nas outras seções quando desejar.</p>}<CrmIaField label="Contexto adicional" type="textarea" value={draft.context} maxLength={30000} rows={8} onChange={value => change('context', value)} /></section>
      </fieldset>
      {sourceChanged && <p role="status">Há uma versão mais recente. {dirty ? 'Sua edição foi mantida; descarte as alterações para recarregar.' : <button type="button" disabled={pending} onClick={discard}>Recarregar base</button>}</p>}
      {error && <p className="crm-ia-error" role="alert">{error}</p>}{saved && <p role="status">Base salva.</p>}
      <footer className="crm-ia-knowledge-footer"><div><strong>{coverage} de 5 seções preenchidas</strong><small>{characters.toLocaleString('pt-BR')}/30.000 caracteres no conteúdo</small><small>{dirty ? 'Alterações pendentes' : 'Conteúdo salvo'}</small></div><div className="crm-ia-toolbar">{dirty && <button type="button" disabled={pending} onClick={discard}>Descartar alterações</button>}<button type="submit" className="crm-ia-primary" disabled={pending || !canManage || !dirty}>{pending ? 'Salvando…' : 'Salvar alterações'}</button></div></footer>
    </form>
  </div>;
}
