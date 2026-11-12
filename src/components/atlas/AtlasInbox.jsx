import React from 'react';
import { Link } from 'react-router-dom';
import { Brain, ArrowUpRight, Archive, RefreshCw, CheckCircle2 } from 'lucide-react';
import useAtlasInbox from './useAtlasInbox';
import { atlasDate } from './atlasPresentation';

export default function AtlasInbox({data}) {
  const local=useAtlasInbox({enabled:!data});const inbox=data||local;
  if(!inbox.visible)return null;
  const online=inbox.worker?.heartbeat_at&&Date.now()-new Date(inbox.worker.heartbeat_at).getTime()<90000;
  return <section className="rounded-2xl border border-purple-200 bg-background p-5 dark:border-purple-900">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-purple-100 p-3 text-purple-700"><Brain size={22}/></span><div><h2 className="font-semibold">Atlas está acompanhando</h2><p className="text-xs text-muted-foreground">{online?'Serviço conectado':'Serviço sem confirmação recente'} · Seus assuntos são privados</p></div></div><button type="button" onClick={inbox.refresh} className="rounded-lg border px-3 py-2 text-xs"><RefreshCw size={14} className="mr-2 inline"/>Atualizar</button></header>
    {inbox.error&&<p role="alert" className="mb-3 text-sm text-red-600">{inbox.error}</p>}
    {!inbox.items.length?<div className="py-8 text-center text-sm text-muted-foreground"><CheckCircle2 size={24} className="mx-auto mb-3"/>Os resultados das missões e os assuntos encontrados na operação aparecerão aqui.<Link to="/assistant/atlas" className="mt-4 block text-purple-600">Abrir Atlas →</Link></div>:<div className="grid gap-3 lg:grid-cols-2">{inbox.items.map(item=><article key={item.id} className={`rounded-xl border p-4 ${item.state==='resolved'?'opacity-70':item.severity==='critical'?'border-orange-300 bg-orange-50/40':'border-border'}`}>
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>{item.state==='resolved'?'Resolvido na fonte':item.kind==='mission'?'Resultado de missão':item.kind}{!item.read_at&&item.state==='open'?' · Novo':''}</span><time>{atlasDate(item.updated_at)}</time></div>
      <h3 className="font-medium">{item.title}</h3><p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{item.body}</p>
      <div className="mt-4 flex items-center justify-between gap-2"><Link to={item.source_key?.startsWith('demand:followup:')&&item.evidence?.task_id?`/tasks/list/${encodeURIComponent(item.evidence.task_id)}`:item.source_key?.startsWith('office:')&&item.client_id?`/assistant/atlas?office_client=${encodeURIComponent(item.client_id)}`:`/assistant/atlas?topic=${item.id}${item.conversation_id?`&conversation=${item.conversation_id}`:''}`} className="inline-flex items-center gap-1 text-sm font-medium text-purple-600" onClick={()=>inbox.mark(item.id).catch(()=>{})}>{item.source_key?.startsWith('demand:followup:')?'Ver tarefa e retorno da equipe':item.source_key?.startsWith('office:')?'Ver cliente no escritório':'Conversar com Atlas'}<ArrowUpRight size={15}/></Link><button type="button" className="p-2 text-muted-foreground" aria-label={`Arquivar ${item.title}`} onClick={()=>inbox.mark(item.id,true).catch(()=>{})}><Archive size={15}/></button></div>
    </article>)}</div>}
  </section>;
}
