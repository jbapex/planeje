import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Pencil, Phone, Plus } from 'lucide-react';
import GestorIaDrawer from '@/components/gestor-ia/GestorIaDrawer';
import { supabase } from '@/lib/customSupabaseClient';
import { loadAtendimentoTeamPhone, saveAtendimentoTeamPhone } from '@/lib/atendimentoEquipeNumeros';
import { Filter, Header, SearchField } from './CsIaViews';

const tabs = [['pessoas', 'Pessoas'], ['squads', 'Squads'], ['cargos', 'Cargos']];
const teamPath = '/cs-ia/equipe';
const responseFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function TeamForm({ title, label, canSubmit, onSubmit, onClose, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit || busy) return;
    const dialog = event.currentTarget.closest('dialog');
    setBusy(true);
    setError('');
    try {
      await onSubmit();
      dialog.close();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <GestorIaDrawer label={label} title={title} close={onClose} busy={busy}>
    <form className="gia-stack" onSubmit={submit}>
      <fieldset className="gia-stack" disabled={busy}>{children}</fieldset>
      {error && <p className="gia-notice" role="alert">{error}</p>}
      <div className="cs-actions">
        <button type="button" className="gia-action-link" disabled={busy} onClick={(event) => event.currentTarget.closest('dialog').close()}>Cancelar</button>
        <button type="submit" className="gia-action-link gia-primary-action" disabled={!canSubmit || busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  </GestorIaDrawer>;
}

function LabelEditor({ label, onSave, onClose }) {
  const [name, setName] = useState(label.name);
  const [archived, setArchived] = useState(label.archived);
  const title = label.id ? `Editar ${label.kind}` : `Novo ${label.kind}`;
  return <TeamForm title={title} label="Equipe de CS" onClose={onClose}
    canSubmit={name.trim().length >= 2 && (name.trim() !== label.name || archived !== label.archived)}
    onSubmit={() => onSave({ ...label, name, archived })}>
    <label className="cs-filter"><span>Nome</span><input value={name} required maxLength={60} onChange={(event) => setName(event.target.value)} /></label>
    {label.id && <label className="cs-checkbox"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} /> Arquivado</label>}
    {label.id && <p className="gia-caption">Arquivar oculta este cadastro na organização ativa. Os vínculos são recuperados ao reativá-lo.</p>}
  </TeamForm>;
}

function PersonEditor({ person, labels, onSave, onClose }) {
  const [initial] = useState(person.labels.map(({ id }) => id));
  const [cargo, setCargo] = useState(person.labels.find(({ kind }) => kind === 'cargo')?.id || '');
  const [squads, setSquads] = useState(person.labels.filter(({ kind }) => kind === 'squad').map(({ id }) => id));
  const available = labels.filter(({ id, archived }) => !archived || initial.includes(id));
  const selected = cargo ? [cargo, ...squads] : squads;
  const changed = selected.length !== initial.length || selected.some((id) => !initial.includes(id));
  const display = ({ name, archived }) => archived ? `${name} (arquivado)` : name;

  return <TeamForm title="Editar organização" label={person.full_name || 'Pessoa da equipe'} onClose={onClose}
    canSubmit={changed} onSubmit={() => onSave(person.id, selected, initial)}>
    <Filter label="Cargo" value={cargo} onChange={setCargo}
      options={[[ '', 'Sem cargo' ], ...available.filter(({ kind }) => kind === 'cargo').map((entry) => [entry.id, display(entry)])]} />
    <fieldset className="gia-stack">
      <legend className="mb-2">Squads</legend>
      {available.filter(({ kind }) => kind === 'squad').map((entry) => <label className="cs-checkbox" key={entry.id}>
        <input type="checkbox" checked={squads.includes(entry.id)} disabled={entry.archived}
          onChange={(event) => setSquads(event.target.checked ? [...squads, entry.id] : squads.filter((id) => id !== entry.id))} />
        {display(entry)}
      </label>)}
      {!available.some(({ kind }) => kind === 'squad') && <p className="gia-caption">Crie um squad na aba Squads para incluir esta pessoa.</p>}
    </fieldset>
  </TeamForm>;
}

function PhoneEditor({ person, onSave, onClose }) {
  const [record, setRecord] = useState(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const original = record?.phone ? `+${record.phone}` : '';

  useEffect(() => {
    let current = true;
    loadAtendimentoTeamPhone(supabase, person.id).then((row) => {
      if (!current) return;
      setRecord(row);
      setValue(row?.phone ? `+${row.phone}` : '');
    }).catch((failure) => {
      if (current) setError(failure.message);
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [person.id, revision]);

  return <TeamForm title="Editar WhatsApp" label={person.full_name || 'Pessoa da equipe'} onClose={onClose}
    canSubmit={!loading && !error && value.trim() !== original}
    onSubmit={async () => onSave(await saveAtendimentoTeamPhone(supabase, person, record, value))}>
    <p className="gia-caption">O Atendimento usa este número para reconhecer a pessoa nos grupos da agência. O CS usa o mesmo vínculo para atribuir respostas e comandos de tarefas.</p>
    {loading && <p role="status">Consultando WhatsApp…</p>}
    {error && <p className="gia-notice" role="alert">{error}</p>}
    {!loading && !error && <label className="cs-filter"><span>Número do WhatsApp</span>
      <input type="tel" autoComplete="off" value={value} maxLength={32} placeholder="+55 41 90000-0000"
        onChange={(event) => setValue(event.target.value)} />
    </label>}
    {!loading && <button type="button" className="gia-action-link" onClick={() => {
      setLoading(true);
      setError('');
      setRevision((value) => value + 1);
    }}>Atualizar cadastro</button>}
    {!loading && !error && <p className="gia-caption">Informe DDD no Brasil ou + e DDI para outro país. Para retirar o vínculo, apague o número e salve.</p>}
  </TeamForm>;
}

export default function CsIaTeam({ rows, people = [], organization, responses, viewerId, refreshing, error, canManage, canManageTeam, onReload, onSaveLabel, onSavePerson }) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('asc');
  const [edit, setEdit] = useState(null);
  const [notice, setNotice] = useState('');
  const tab = tabs.find(([id]) => id === params.get('aba'))?.[0] || 'pessoas';
  const labels = organization?.labels || [];
  const currentSquads = labels.filter(({ kind, archived }) => kind === 'squad' && !archived);
  const squad = currentSquads.find(({ id }) => id === params.get('squad'))?.id || '';
  const byId = new Map(labels.map((entry) => [entry.id, entry]));
  const assignments = new Map();
  const accounts = new Map();
  const responsesByPerson = new Map(responses.rows.map((entry) => [entry.profile_id, entry]));
  for (const { profile_id: profileId, label_id: labelId } of organization?.assignments || []) {
    const entry = byId.get(labelId);
    if (entry) assignments.set(profileId, [...(assignments.get(profileId) || []), entry]);
  }
  for (const row of rows) {
    if (row.owner_id) accounts.set(row.owner_id, [...(accounts.get(row.owner_id) || []), row]);
  }
  const roster = people.map((person) => ({ ...person, labels: assignments.get(person.id) || [], clients: accounts.get(person.id) || [] }));
  const needle = search.trim().toLocaleLowerCase('pt-BR');
  const visible = roster.filter((person) => (person.full_name || '').toLocaleLowerCase('pt-BR').includes(needle) &&
      (!squad || person.labels.some(({ id }) => id === squad)))
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt-BR') * (order === 'asc' ? 1 : -1));
  const kind = tab === 'squads' ? 'squad' : 'cargo';
  const catalog = labels.filter((entry) => entry.kind === kind);
  const editable = canManage && organization;
  function updateFilter(name, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }
  function open(entry) {
    setNotice('');
    setEdit(entry);
  }

  return <div className="gia-stack cs-section">
    <Header title="Equipe" text="Organize os responsáveis do CS e acompanhe a carteira de cada squad.">
      {canManageTeam && <Link className="gia-action-link" to="/settings?tab=equipe">Gerenciar usuários <ArrowRight aria-hidden="true" /></Link>}
    </Header>
    <nav className="gia-client-tabs" aria-label="Organização da equipe">
      {tabs.map(([id, name]) => <Link key={id} to={id === 'pessoas' ? teamPath : `${teamPath}?aba=${id}`}
        aria-current={id === tab ? 'page' : undefined}>{name}</Link>)}
    </nav>
    {refreshing && <p role="status">Consultando organização da equipe…</p>}
    {error && <div className="gia-notice" role="alert">{error} <button type="button" onClick={onReload}>Tentar novamente</button></div>}
    {notice && <p className="cs-success" role="status">{notice}</p>}
    {tab === 'pessoas' ? <>
      <div className="gia-filters cs-filters">
        <SearchField label="Buscar pessoa" value={search} onChange={setSearch} />
        <Filter label="Ordem" value={order} onChange={setOrder} options={[[ 'asc', 'Nome A–Z' ], ['desc', 'Nome Z–A' ]]} />
        <Filter label="Período do tempo de resposta" value={String(responses.days)}
          onChange={(value) => updateFilter('resposta', value === '30' ? value : '')} options={[[ '7', 'Últimos 7 dias' ], ['30', 'Últimos 30 dias' ]]} />
        {!!currentSquads.length && <Filter label="Squad" value={squad}
          options={[[ '', 'Todos os squads' ], ...currentSquads.map(({ id, name }) => [id, name])]}
          onChange={(id) => updateFilter('squad', id)} />}
      </div>
      <p className="gia-caption">A mediana usa o expediente do CS e mede até o primeiro envio registrado após um pedido sinalizado pelo Atendimento nos grupos vinculados.</p>
      {responses.loading && <p role="status">Consultando tempos de resposta…</p>}
      {responses.error && <div className="gia-notice" role="alert">{responses.error} <button type="button" onClick={responses.onReload}>Tentar novamente</button></div>}
      {visible.length ? <ul className="cs-card-grid">{visible.map((person) => {
        const response = responsesByPerson.get(person.id);
        return <li key={person.id} className="gia-panel cs-card">
          <h2>{person.full_name || 'Pessoa da equipe'}</h2>
          {organization && <div className="cs-actions">{person.labels.filter(({ archived }) => !archived)
            .map(({ id, name }) => <span className="gia-tag" key={id}>{name}</span>)}</div>}
          <p className="gia-caption">{person.clients.length} {person.clients.length === 1 ? 'cliente' : 'clientes'} na carteira disponível</p>
          {!responses.loading && !responses.error && (canManage || person.id === viewerId) && <p className="gia-caption">
            <strong>Tempo de resposta</strong>{' · '}{response
              ? `${responseFormat.format(response.median_minutes)} min úteis · ${response.response_count} ${response.response_count === 1 ? 'resposta' : 'respostas'}`
              : 'Sem respostas atribuíveis no período'}
          </p>}
          {!!person.clients.length && <ul className="cs-assigned">{person.clients.map((row) => <li key={row.client_id}>
            <Link className="gia-row-link" to={`/cs-ia/clientes/${encodeURIComponent(row.client_id)}`}>{row.client_name}</Link>
          </li>)}</ul>}
          {editable && <button type="button" className="gia-action-link" disabled={refreshing} aria-label={`Editar organização de ${person.full_name || 'pessoa da equipe'}`}
            onClick={() => open({ person, labels })}><Pencil aria-hidden="true" /> Editar organização</button>}
          {canManageTeam && <button type="button" className="gia-action-link" aria-label={`Editar WhatsApp de ${person.full_name || 'pessoa da equipe'}`}
            onClick={() => open({ phoneFor: person })}><Phone aria-hidden="true" /> Editar WhatsApp</button>}
        </li>;
      })}</ul> : <p className="gia-empty">Nenhuma pessoa corresponde aos filtros.</p>}
    </> : organization && <section className="gia-stack" aria-label={tab === 'squads' ? 'Squads' : 'Cargos'}>
      <div className="gia-section-heading">
        <h2>{tab === 'squads' ? 'Squads de atendimento' : 'Cargos da equipe'}</h2>
        {editable && <button type="button" className="gia-action-link gia-primary-action" disabled={refreshing} onClick={() => open({ label: { kind, name: '', archived: false } })}>
          <Plus aria-hidden="true" /> Novo {kind}
        </button>}
      </div>
      {catalog.length ? <ul className="cs-card-grid">{catalog.map((entry) => {
        const members = roster.filter((person) => person.labels.some(({ id }) => id === entry.id));
        const clients = members.flatMap((person) => person.clients);
        const atRisk = clients.filter(({ health }) => health === 'critico' || health === 'atencao').length;
        return <li key={entry.id} className="gia-panel cs-card">
          <h3>{entry.name}</h3>
          {entry.archived && <span className="gia-tag">Arquivado</span>}
          <p className="gia-caption">{members.length} {members.length === 1 ? 'pessoa visível' : 'pessoas visíveis'}</p>
          {kind === 'squad' && !entry.archived && <p className="gia-caption">{clients.length} na carteira · {atRisk} em atenção ou críticos</p>}
          <div className="cs-actions">
            {kind === 'squad' && !entry.archived && <Link className="gia-action-link" to={`${teamPath}?squad=${encodeURIComponent(entry.id)}`}>Ver pessoas</Link>}
            {editable && <button type="button" className="gia-action-link" disabled={refreshing} aria-label={`Editar ${entry.name}`}
              onClick={() => open({ label: entry })}><Pencil aria-hidden="true" /> Editar</button>}
          </div>
        </li>;
      })}</ul> : <p className="gia-empty">{tab === 'squads' ? 'Nenhum squad cadastrado.' : 'Nenhum cargo cadastrado.'}</p>}
    </section>}
    {edit?.label && <LabelEditor label={edit.label} onClose={() => setEdit(null)} onSave={async (draft) => {
      await onSaveLabel(draft);
      setNotice(draft.kind === 'squad' ? 'Squad salvo.' : 'Cargo salvo.');
    }} />}
    {edit?.person && <PersonEditor person={edit.person} labels={edit.labels} onClose={() => setEdit(null)} onSave={async (...args) => {
      await onSavePerson(...args);
      setNotice('Organização salva.');
    }} />}
    {canManageTeam && edit?.phoneFor && <PhoneEditor person={edit.phoneFor} onClose={() => setEdit(null)}
      onSave={(saved) => setNotice(saved ? 'WhatsApp atualizado.' : 'Vínculo de WhatsApp retirado.')} />}
  </div>;
}
