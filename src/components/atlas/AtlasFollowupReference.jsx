import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { followupState } from '@/lib/atlasTaskFollowup';

export default function AtlasFollowupReference() {
  const [state, setState] = useState({ rows: [], loaded: false, error: '' });
  const load = async event => {
    if (!event.currentTarget.open || state.loaded) return;
    const { data, error } = await supabase.from('cs_integration_snapshots').select('source_client_id,captured_at,payload').contains('payload', { kind: 'atlas_followup_reference' });
    setState({ rows: data || [], loaded: true, error: error?.message || '' });
  };
  return <details className="atlas-followup-reference" onToggle={load}><summary>Caso real · consulta de referência</summary>
    {state.error ? <p role="alert">Não foi possível consultar: {state.error}</p> : !state.loaded ? <p>Consultando…</p> : !state.rows.length ? <p>Nenhuma referência disponível para esta conta.</p> : state.rows.map(row => {
      const { task, status, people, updates = [] } = row.payload, followup = followupState(task, updates, status, new Date(row.captured_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
      return <article key={row.source_client_id}><strong>{task.title}</strong><p>{people.map(p => p.full_name).join(', ')} · Prazo: {task.due_date?.split('-').reverse().join('/') || 'A definir'} · {status.label}</p><p>{row.payload.comments?.length ? `${row.payload.comments.length} comentário(s) registrado(s). Acompanhamento estruturado ainda em teste.` : followup.label}</p><p className="atlas-demand-muted">Cópia consultada em {new Date(row.captured_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Leitura datada; alterações posteriores da operação real não entram neste piloto.</p><a className="atlas-demand-link" href={'https://planeje.jbapex.com.br/#/tasks/list/' + task.id} target="_blank" rel="noopener noreferrer">Abrir tarefa na operação real ↗</a></article>;
    })}
  </details>;
}
