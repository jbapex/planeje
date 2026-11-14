import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position } from '@xyflow/react';
import { GitBranch, Play, Save, Zap } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { loadAtlasAutomation } from '@/lib/atlasApi';

function AutomationNode({ data }) {
  return <div className="atlas-automation-node" data-state={data.state}>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <span>{data.type === 'trigger' ? <Zap size={15} aria-hidden="true" /> : <GitBranch size={15} aria-hidden="true" />}{data.app === 'atlas' ? 'Squad' : data.app?.toUpperCase()}</span>
    <strong>{data.label}</strong><p>{data.description}</p>{data.state && <small>{{ completed: 'Concluído', running: 'Executando', failed: 'Falhou', skipped: 'Não executado', stopped: 'Encerrado', partial: 'Parcial', waiting: 'Aguardando' }[data.state] || 'Etapa registrada'}</small>}
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </div>;
}
const nodeTypes = { squad: AutomationNode };

export default function AtlasAutomationCanvas({ item, run, busy, onSave, onRun, onPrompt }) {
  const proposed = item?.state === 'proposed' && item.action === 'save_automation';
  const saved = item?.result?.automation;
  const [snapshot, setSnapshot] = useState(null);
  const [sourceError, setSourceError] = useState('');
  const pendingRead = useRef(null), readEpoch = useRef(null);
  const savedId = saved?.id, app = item?.app, clientId = item?.client_id || null;
  const refresh = useCallback(async () => {
    if (!savedId || pendingRead.current?.id === savedId) return;
    const request = { id: savedId, epoch: readEpoch.current };
    pendingRead.current = request;
    try {
      const result = await loadAtlasAutomation({ id: savedId, app, clientId });
      const row = result?.data?.automation;
      if (!result?.available || row?.id !== savedId || row.app !== app || (row.client_id || null) !== clientId) throw new Error('Unavailable');
      if (request.epoch?.active) { setSnapshot(row); setSourceError(''); }
    } catch {
      if (request.epoch?.active) setSourceError('Não foi possível conferir o estado atual da automação.');
    } finally { if (pendingRead.current === request) pendingRead.current = null; }
  }, [savedId,app,clientId]);
  useEffect(() => {
    const epoch = { active: true }; readEpoch.current = epoch; setSnapshot(null); setSourceError(''); pendingRead.current = null;
    if (!savedId) return () => { epoch.active = false; };
    void refresh();
    const timer = setInterval(refresh,15000);
    return () => { epoch.active = false; clearInterval(timer); };
  }, [savedId,refresh,item?.revision,run?.id]);
  const current = snapshot?.id === savedId && snapshot?.app === app && (snapshot?.client_id || null) === clientId ? snapshot : null;
  const manual = (current?.recipe || item?.payload?.recipe) === 'squad_manual';
  const executable = manual && (proposed || current && !sourceError);
  const flow = !proposed && current?.flow || item?.preview?.flow;
  const name = current?.config?.name || item?.payload?.config?.name || item?.title || 'Nova automação';
  const state = sourceError ? null : current?.current_state || current?.state;
  const stateLabel = !item ? 'Rascunho' : proposed ? 'Aguardando revisão' : sourceError ? 'Estado não confirmado' : savedId && !current ? 'Conferindo estado…' :
    ({ active: 'Ativa', paused: 'Pausada', blocked: 'Bloqueada', saved: 'Salva', drifted: 'Alterada fora do chat', draft: 'Rascunho' }[state] || 'Confira a proposta');
  const graph = useMemo(() => {
    const progress = new Map((run?.steps || []).map(step => [step.node_id || step.id, step.state || step.status]));
    return ({
    nodes: (flow?.nodes || []).map((node, index) => ({ id: node.id, type: 'squad', position: { x: 80, y: index * 195 }, data: { ...node, state: progress.get(node.id) } })),
    edges: (flow?.edges || []).map((edge, index) => ({ id: 'edge-' + index, ...edge, type: 'smoothstep' })),
    });
  }, [flow, run]);
  return <section className="atlas-automation" aria-label="Construtor de automações">
    <header><div><h2>{name}</h2><span>{stateLabel}</span></div><div>
      <button type="button" disabled={busy || !executable} onClick={() => onRun({ ...(proposed ? { proposal_id: item.id, revision: item.revision } : { automation_id: current.id, revision: current.revision }), name })}><Play size={15} aria-hidden="true" />Executar agora</button>
      <button type="button" disabled={busy || !proposed} onClick={() => onSave({ id: item.id, revision: item.revision, decision: 'approve' })}><Save size={15} aria-hidden="true" />Salvar automação</button>
    </div></header>
    {graph.nodes.length ? <ReactFlow key={item.id + ':' + item.revision} nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView minZoom={0.25} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null} aria-label="Fluxo da automação"><Background gap={20} size={1} color="#c9cdd1" /><Controls showInteractive={false} aria-label="Zoom e enquadramento do fluxo" /></ReactFlow> : <div className="atlas-automation-empty"><GitBranch size={32} aria-hidden="true" /><h3>Descreva o que deve acontecer</h3><p>O Squad monta o fluxo aqui. Revise as etapas antes de salvar.</p><button type="button" disabled={busy} onClick={() => onPrompt('Monte um fluxo manual de demonstração que responda apenas Demonstração no resultado interno, sem ler clientes ou enviar mensagens. Prepare o rascunho para minha revisão.')}>Começar com um fluxo manual</button></div>}
    {sourceError && <p role="status" className="atlas-automation-note">{sourceError} <button type="button" onClick={refresh}>Atualizar</button></p>}
    {saved?.id && !manual && <div className="atlas-automation-native-actions"><button type="button" disabled={busy || !current || Boolean(sourceError)} onClick={() => onPrompt(`Confira o estado atual e prepare a ativação da automação “${name}” para minha revisão.`)}>Revisar ativação</button><button type="button" disabled={busy || !current || Boolean(sourceError)} onClick={() => onPrompt(`Confira o estado atual e prepare a pausa da automação “${name}” para minha revisão.`)}>Revisar pausa</button></div>}
    <p className="atlas-automation-note">Executar agora testa um fluxo manual de leitura e IA. Salvar registra a definição; ativar uma rotina é uma decisão separada.</p>
  </section>;
}
