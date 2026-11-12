import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { demandRpc } from '@/lib/atlasDemands';
import ClientRecordHistory from '@/components/projects/ClientRecordHistory';
import ClienteReunioesPanel from '@/components/clients/ClienteReunioesPanel';

export default function AtlasClientKnowledge({ client }) {
  const [tab, setTab] = useState('documents'), [memories, setMemories] = useState([]), [error, setError] = useState(''), [owner, setOwner] = useState(false);
  useEffect(() => { let alive = true; setMemories([]); setOwner(false); setError('');
    demandRpc('atlas_demand_access').then(async allowed => {
      if (!alive) return; setOwner(allowed);
      if (allowed) { const { data, error } = await supabase.from('atlas_memories').select('id,content,source,version,created_at,state').eq('client_id', client.id).eq('state', 'active').order('created_at', { ascending: false }).limit(100); if (alive) { if (error) setError('Não foi possível consultar as memórias.'); else setMemories(data || []); } }
    }).catch(e => alive && setError(e.message));return () => { alive = false; }; }, [client.id]);
  return <section className="atlas-demands" aria-label="Arquivos e memória do cliente"><div className="atlas-demand-header"><div><h2>Arquivos e memória</h2><p className="atlas-demand-muted">Documentos, anexos, links, reuniões e direções deste cliente, com histórico e origem.</p></div></div><div className="atlas-demand-actions" role="tablist" aria-label="Organização dos registros" style={{ marginBottom: 18 }}>{[['documents', 'Documentos e arquivos'], ['meetings', 'Reuniões'], ...(owner ? [['memories', 'Memórias confirmadas']] : [])].map(([id, label]) => <button key={id} type="button" role="tab" id={'atlas-knowledge-' + id} aria-controls={'atlas-knowledge-panel-' + id} aria-selected={tab === id} className={`atlas-demand-button ${tab === id ? 'is-primary' : ''}`} onClick={() => setTab(id)}>{label}</button>)}</div>{error && <p role="alert" className="atlas-demand-error">{error}</p>}
    <div hidden={tab !== 'documents'} role="tabpanel" id="atlas-knowledge-panel-documents" aria-labelledby="atlas-knowledge-documents"><ClientRecordHistory client={client} /></div>
    <div hidden={tab !== 'meetings'} role="tabpanel" id="atlas-knowledge-panel-meetings" aria-labelledby="atlas-knowledge-meetings"><ClienteReunioesPanel clientId={client.id} /></div>
    {owner && <div hidden={tab !== 'memories'} role="tabpanel" id="atlas-knowledge-panel-memories" aria-labelledby="atlas-knowledge-memories"><p className="atlas-demand-muted">Direções confirmadas pelo dono. Respostas da equipe permanecem no histórico da tarefa e não substituem estas decisões.</p>{!memories.length ? <p>Nenhuma memória confirmada para este cliente.</p> : <ol className="atlas-demand-history">{memories.map(m => <li key={m.id}><p>{m.content}</p><span>Versão {m.version} · {m.source === 'user_confirmation' ? 'Confirmada pelo dono' : m.source} · {new Date(m.created_at).toLocaleString('pt-BR')}</span></li>)}</ol>}</div>}
  </section>;
}
