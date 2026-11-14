import React, { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, BookmarkCheck, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Search, Star } from 'lucide-react';
import { atlasDate } from './atlasPresentation';

const FILTERS = [['recent', 'Recentes'], ['favorite', 'Favoritas'], ['archived', 'Arquivadas']];
const SECTIONS = [['conversation', MessageSquare, 'Conversa'], ['memory', BookmarkCheck, 'Conhecimento']];
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');

function readMarks(key) {
  try { return JSON.parse(window.localStorage.getItem(key)); } catch { return null; }
}

export default function AtlasConversationNav({ atlas, avatar, name, ownerId, busy, tab, onTab, onNew, onOpen }) {
  const [collapsed, setCollapsed] = useState(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('recent');
  const [notice, setNotice] = useState('');
  const storageKey = 'planeje:atlas:history:' + ownerId;
  const [marks, setMarks] = useState(() => readMarks(storageKey) || {});
  const isCollapsed = collapsed ?? narrow;
  const query = normalize(search.trim());
  const today = atlasDate(new Date()).slice(0, 5);
  const groups = new Map();

  useEffect(() => { if (atlas.mode === 'automation') setCollapsed(true); }, [atlas.mode]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const resize = event => setNarrow(event.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

  useEffect(() => {
    const sync = event => {
      if (event.key === storageKey || event.key === null) setMarks(readMarks(storageKey) || {});
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [storageKey]);

  for (const row of [...(atlas.base.conversations || [])].filter(row => !atlas.base.domain || (row.client_id || '') === atlas.clientId).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))) {
    const mark = marks[row.id];
    if (filter === 'archived' ? !mark?.archived : mark?.archived || filter === 'favorite' && !mark?.favorite) continue;
    if (!normalize(row.title || 'Conversa com Atlas').includes(query)) continue;
    const date = atlasDate(row.updated_at).slice(0, 5);
    const day = date === today ? 'Hoje' : date || 'Sem data';
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(row);
  }

  function toggleMark(id, field) {
    const latest = readMarks(storageKey) || marks;
    const current = { ...latest[id], [field]: !latest[id]?.[field] };
    const next = { ...latest };
    if (current.favorite || current.archived) next[id] = current;
    else delete next[id];
    setMarks(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); setNotice(''); }
    catch { setNotice('A alteração vale nesta aba.'); }
  }

  function chooseSection(value) {
    onTab(value);
    if (narrow) setCollapsed(true);
  }

  return <aside className="atlas-converse-nav" data-collapsed={isCollapsed} aria-label="Histórico do Atlas">
    <div className="atlas-converse-nav-head">
      <div className="atlas-converse-brand"><img src={avatar} alt="" /><strong>Histórico</strong></div>
      <button type="button" className="atlas-converse-icon atlas-converse-collapse" onClick={() => setCollapsed(!isCollapsed)} aria-expanded={!isCollapsed} aria-controls="atlas-converse-history" aria-label={isCollapsed ? 'Mostrar conversas' : 'Recolher conversas'} title={isCollapsed ? 'Mostrar conversas' : 'Recolher conversas'}>
        {isCollapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
      </button>
    </div>
    <button type="button" className="atlas-converse-new" disabled={busy} onClick={() => { setSearch(''); setFilter('recent'); if (narrow) setCollapsed(true); onNew(); }} aria-label="Nova conversa" title="Nova conversa"><Plus size={17} aria-hidden="true" /><span>Nova conversa</span></button>
    <nav className="atlas-converse-shortcuts" aria-label="Seções do Atlas">
      {SECTIONS.map(([value, Icon, label]) => <button key={value} type="button" className="atlas-converse-icon" aria-label={label} title={label} aria-pressed={tab === value} disabled={busy} onClick={() => chooseSection(value)}><Icon size={16} aria-hidden="true" /></button>)}
    </nav>
    {narrow && !isCollapsed && <button type="button" className="atlas-converse-scrim" aria-hidden="true" tabIndex={-1} onClick={() => setCollapsed(true)} />}
    <div className="atlas-converse-history" id="atlas-converse-history" aria-hidden={isCollapsed} onKeyDown={event => {
      if (event.key === 'Escape') {
        setCollapsed(true);
        event.currentTarget.closest('aside')?.querySelector('.atlas-converse-collapse')?.focus();
      }
    }}>
      <div className="atlas-converse-filters" role="group" aria-label="Filtrar conversas">
        {FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      <label className="atlas-converse-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Buscar conversas" placeholder="Buscar conversas" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="atlas-converse-history-list">
        {[...groups].map(([day, rows]) => <section key={day} aria-label={day}>
          <h2>{day}</h2>
          {rows.map(row => {
            const title = row.title || 'Conversa com Atlas';
            const mark = marks[row.id];
            return <div className="atlas-converse-session" key={row.id} data-current={atlas.conversationId === row.id}>
              <button type="button" className="atlas-converse-session-open" disabled={busy} aria-label={title} aria-pressed={atlas.conversationId === row.id} onClick={() => { onOpen(row.id); if (narrow) setCollapsed(true); }}>
                {mark?.favorite && <Star size={12} className="atlas-converse-favorite" aria-hidden="true" />}<span>{title}</span><small>{atlasDate(row.updated_at).slice(7)}</small>
              </button>
              <div className="atlas-converse-session-actions">
                <button type="button" aria-label={(mark?.favorite ? 'Desfavoritar ' : 'Favoritar ') + title} title={mark?.favorite ? 'Desfavoritar' : 'Favoritar'} onClick={() => toggleMark(row.id, 'favorite')}><Star size={14} aria-hidden="true" /></button>
                <button type="button" aria-label={(mark?.archived ? 'Restaurar ' : 'Arquivar ') + title} title={mark?.archived ? 'Restaurar' : 'Arquivar'} onClick={() => toggleMark(row.id, 'archived')}>{mark?.archived ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}</button>
              </div>
            </div>;
          })}
        </section>)}
        {!groups.size && <p>{query ? 'Nenhuma conversa encontrada.' : filter === 'favorite' ? 'Nenhuma conversa favorita.' : filter === 'archived' ? 'Nenhuma conversa arquivada.' : 'Suas conversas vão aparecer aqui.'}</p>}
        {notice && <p role="status">{notice}</p>}
      </div>
      {name && <div className="atlas-converse-account"><img src={avatar} alt="" /><span><strong>{name}</strong><small>Squad · CRM, CS e Gestor IA</small></span></div>}
    </div>
  </aside>;
}
