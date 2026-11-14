import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { CrmIaEditor, CrmIaField } from './CrmIaPrimitives';
import { versionOf } from './crmIaPresentation';
import { CrmIaStageIconPicker, StageIcon, STAGE_ICONS } from './CrmIaStageIcons';

const isDefault = row => (row.crm_ia_default ?? row.is_default) === true;

export default function CrmIaPipelineSettings({ workspace, mutate, canManage, pipelineId, onSelect, onPendingChange }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false), mounted = useRef(true), dragging = useRef(null);
  const pipeline = workspace.pipelines.find(item => item.id === pipelineId);
  const stages = workspace.stages.filter(item => item.pipeline_id === pipelineId).sort((a,b) => a.ordem-b.ordem);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onPendingChange?.(false); }; }, [onPendingChange]);
  function choose(id) {
    if (busy.current) return;
    setEditing(null); setError(''); dragging.current = null; onSelect(id);
  }
  function edit(kind, row = {}) {
    if (!canManage || busy.current) return;
    setEditing({kind,row:{...row}}); setError('');
    setDraft({nome:'',color:'#286fc9',tipo:'intermediaria',...row,is_default:isDefault(row),icon:row.crm_ia_icon||(row.id?'circle':'inbox'),iconChanged:false});
  }
  async function commit(action, payload) {
    if (!canManage || busy.current) throw new Error('Aguarde a gravação atual.');
    busy.current = true; setPending(true); onPendingChange?.(true);
    try { return await mutate(action,payload); }
    finally { busy.current = false; if (mounted.current) { setPending(false); onPendingChange?.(false); } }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy.current || !canManage || !editing) return;
    const {kind,row} = editing;
    try {
      if (!draft.nome.trim()) throw new Error('Informe um nome.');
      const iconChanged = draft.iconChanged || !row.id;
      if (kind === 'stage' && iconChanged && !Object.hasOwn(STAGE_ICONS,draft.icon)) throw new Error('Escolha um ícone disponível.');
      const payload = {...versionOf(row),nome:draft.nome.trim()};
      setError('');
      await commit(kind === 'stage' ? 'save_stage' : 'save_pipeline',kind === 'stage'
        ? {...payload,pipeline_id:row.pipeline_id,color:draft.color,tipo:draft.tipo,ordem:draft.ordem,...(iconChanged ? {icon:draft.icon} : {})}
        : {...payload,is_default:draft.is_default===true});
      if (mounted.current) setEditing(null);
    } catch (failure) { if (mounted.current) setError(failure.message || 'Não foi possível salvar.'); }
  }
  function reorder(from,to,snapshot = {pipeline:{...pipeline},stages:stages.map(item=>({...item}))}) {
    if (busy.current || editing || !canManage || !snapshot.pipeline.updated_at || from===to || from<0 || to<0 || to>=snapshot.stages.length) return;
    const order = snapshot.stages.map(item=>item.id); order.splice(to,0,order.splice(from,1)[0]);
    edit('order',{...snapshot.pipeline,order,stages:snapshot.stages});
  }
  const inline = editing && ['pipeline','stage'].includes(editing.kind) && <form className="crm-ia-pipeline-inline" onSubmit={submit}>
    <fieldset disabled={pending || !canManage}><div className="crm-ia-form-grid"><CrmIaField label="Nome" value={draft.nome} onChange={nome=>setDraft(old=>({...old,nome}))} maxLength={100} required />
      {editing.kind === 'stage' ? <><CrmIaField label="Cor" type="color" value={draft.color} onChange={color=>setDraft(old=>({...old,color}))} /><div className="crm-ia-stage-icon-picker"><span>Ícone da etapa</span><CrmIaStageIconPicker value={draft.icon} disabled={pending || !canManage} onChange={icon=>setDraft(old=>({...old,icon,iconChanged:true}))} /></div><details className="crm-ia-stage-rules"><summary>Regras da etapa</summary><CrmIaField label="Tipo de etapa" value={draft.tipo} onChange={tipo=>setDraft(old=>({...old,tipo}))} options={[{value:'intermediaria',label:'Em andamento'},{value:'ganho',label:'Ganho'},{value:'perdido',label:'Perdido'}]} /></details></>
        : <CrmIaField label="Funil padrão" type="checkbox" value={draft.is_default} onChange={is_default=>setDraft(old=>({...old,is_default}))} />}
    </div></fieldset>
    {error && <p role="alert" className="crm-ia-error">{error}</p>}
    <footer><button type="button" disabled={pending} onClick={()=>{setEditing(null);setError('');}}>Cancelar</button><button type="submit" className="crm-ia-primary" disabled={pending || !canManage}>{pending?'Salvando…':'Salvar'}</button></footer>
  </form>;
  if (!pipelineId) return <section className="crm-ia-pipeline-settings" aria-label="Configuração dos funis">
    <header className="crm-ia-section-heading"><div><h2>Funis de vendas</h2><p className="crm-ia-muted">Organize as etapas de cada operação.</p></div><button type="button" disabled={!canManage || pending || Boolean(editing)} onClick={()=>edit('pipeline')}>Novo funil</button></header>
    {inline}<div className="crm-ia-pipeline-cards">{workspace.pipelines.map(item=>{const rows=workspace.stages.filter(stage=>stage.pipeline_id===item.id).sort((a,b)=>a.ordem-b.ordem);return <button type="button" key={item.id} className="crm-ia-pipeline-card" aria-label={`Editar funil ${item.nome}`} disabled={pending} onClick={()=>choose(item.id)}><strong>{item.nome}</strong>{isDefault(item)&&<span className="crm-ia-badge">Padrão</span>}<small>{rows.length} etapas</small><p>{rows.map(stage=>stage.nome).join(' · ')||'Nenhuma etapa'}</p></button>;})}</div>
    {!workspace.pipelines.length&&<p className="crm-ia-state">Nenhum funil disponível.</p>}
  </section>;
  if (!pipeline) return <section className="crm-ia-pipeline-settings"><button type="button" disabled={pending} onClick={()=>choose(null)}>Todos os funis</button><p role="status">Funil indisponível. Volte à lista para escolher um funil atual.</p></section>;
  return <section className="crm-ia-pipeline-settings" aria-label={`Configuração de ${pipeline.nome}`}>
    <button className="crm-ia-pipeline-back" type="button" disabled={pending} onClick={()=>choose(null)}>Todos os funis</button>
    <header className="crm-ia-section-heading"><div className="crm-ia-pipeline-title"><h2>{pipeline.nome}</h2>{isDefault(pipeline)&&<span className="crm-ia-badge">Padrão</span>}</div><div className="crm-ia-toolbar"><button type="button" disabled={!canManage || pending || Boolean(editing)} onClick={()=>edit('pipeline',pipeline)}>Renomear funil</button><button type="button" disabled={!canManage || pending || Boolean(editing)} onClick={()=>edit('delete_pipeline',pipeline)}>Excluir funil</button></div></header>
    {editing?.kind==='pipeline'&&inline}
    <section className="crm-ia-pipeline-flow" aria-label="Visão do fluxo"><h3>Visão do fluxo</h3><ol>{stages.map(item=><li key={item.id}><span style={{color:item.color}}><StageIcon value={item.crm_ia_icon}/></span><strong>{item.nome}</strong></li>)}</ol>{!stages.length&&<p className="crm-ia-muted">Adicione a primeira etapa para organizar o fluxo.</p>}</section>
    <header className="crm-ia-section-heading"><h3>Etapas do funil</h3><button type="button" disabled={!canManage || pending || Boolean(editing)} onClick={()=>edit('stage',{pipeline_id:pipeline.id,ordem:stages.length})}>Adicionar etapa</button></header>
    <ol className="crm-ia-pipeline-stages">{stages.map((item,index)=><li key={item.id} className="crm-ia-stage-order" aria-label={`Ordem da etapa ${item.nome}`} style={{borderLeftColor:item.color}}
      draggable={canManage&&!pending&&!editing&&Boolean(pipeline.updated_at)}
      onDragStart={event=>{if(!canManage||busy.current||editing||!pipeline.updated_at){event.preventDefault?.();return;}dragging.current={id:item.id,pipeline:{...pipeline},stages:stages.map(stage=>({...stage}))};event.dataTransfer.setData('application/x-planeje-crm-stage',item.id);}}
      onDragEnd={()=>{dragging.current=null;}} onDragOver={event=>{if(dragging.current?.pipeline.id===pipelineId&&!busy.current)event.preventDefault();}}
      onDrop={event=>{event.preventDefault();const snapshot=dragging.current;dragging.current=null;if(snapshot?.pipeline.id===pipelineId)reorder(snapshot.stages.findIndex(stage=>stage.id===snapshot.id),snapshot.stages.findIndex(stage=>stage.id===item.id),snapshot);}}>
      <div className="crm-ia-stage-row"><span className="crm-ia-stage-number">{index+1}</span><StageIcon value={item.crm_ia_icon}/><div className="crm-ia-stage-name"><strong>{item.nome}</strong><small>Etapa {index+1} de {stages.length}</small></div><span className="crm-ia-stage-drag-hint"><GripVertical size={14} aria-hidden="true"/>Arraste para reordenar</span><div className="crm-ia-stage-actions"><button type="button" aria-label={`Subir ${item.nome}`} disabled={!canManage||pending||Boolean(editing)||index===0||!pipeline.updated_at} onClick={()=>reorder(index,index-1)}><ChevronUp size={15} aria-hidden="true"/></button><button type="button" aria-label={`Descer ${item.nome}`} disabled={!canManage||pending||Boolean(editing)||index===stages.length-1||!pipeline.updated_at} onClick={()=>reorder(index,index+1)}><ChevronDown size={15} aria-hidden="true"/></button><button type="button" aria-label={`Editar ${item.nome}`} disabled={!canManage||pending||Boolean(editing)} onClick={()=>edit('stage',item)}>Editar</button><button type="button" aria-label={`Excluir ${item.nome}`} disabled={!canManage||pending||Boolean(editing)} onClick={()=>edit('delete_stage',item)}>Excluir</button></div></div>
      {editing?.kind==='stage'&&editing.row.id===item.id&&inline}
    </li>)}</ol>
    {editing?.kind==='stage'&&!editing.row.id&&inline}
    {editing&&['order','delete_stage','delete_pipeline'].includes(editing.kind)&&<CrmIaEditor title={editing.kind==='order'?'Reordenar etapas':'Confirmar exclusão'} disabled={!canManage} onClose={()=>{if(!busy.current)setEditing(null);}} onSave={async()=>{
      const change=editing;
      await commit(change.kind==='order'?'reorder_stages':change.kind,change.kind==='order'?{pipeline_id:change.row.id,stage_ids:change.row.order,expected_updated_at:change.row.updated_at}:versionOf(change.row));
      if(mounted.current&&change.kind==='delete_pipeline')choose(null);
    }}>{editing.kind==='order'?<><p>Confira a nova ordem. As oportunidades e o histórico serão preservados.</p><ol>{editing.row.order.map(id=><li key={id}>{editing.row.stages.find(item=>item.id===id)?.nome}</li>)}</ol></>:<><p>Excluir <strong>{editing.row.nome}</strong>?</p><p>O servidor recusa a exclusão quando houver oportunidades vinculadas. Nenhum lead será apagado.</p></>}</CrmIaEditor>}
  </section>;
}
