import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng, toSvg } from 'html-to-image';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import {
  createFunilDiagram,
  deleteFunilDiagram,
  ensureDefaultFunilForCliente,
  getFunilDiagram,
  listFunilDiagrams,
  updateFunilDiagram,
  publishFunilDiagram,
  CLIENTE_DEFAULT_FUNIL,
} from '@/lib/funilDiagramApi';
import { useFunilNodeMetrics } from '@/hooks/useFunilNodeMetrics';
import { validateFunilDiagram } from '@/lib/funilValidation';
import FunilEditorChrome from '@/components/funil/components/FunilEditorChrome';
import CustomNode from '@/components/funil/components/CustomNode';
import Sidebar from '@/components/funil/components/Sidebar';
import Toolbar from '@/components/funil/components/Toolbar';
import NodePanel from '@/components/funil/components/NodePanel';
import { JORNADA_TEMPLATE, CAMPANHAS_TEMPLATE } from '@/components/funil/data/template';
import { NODE_CONFIG } from '@/components/funil/nodeConfig';
import { buildColoredEdge, colorizeEdges, getNodeEdgeColor } from '@/components/funil/funilEdgeUtils';
import { countNodesWithMetaLink } from '@/lib/funilMetaLink';
import { countNodesWithGoogleLink } from '@/lib/funilGoogleLink';
import {
  canConnect,
  applyLinkInheritanceOnConnect,
  migrateDiagramLinkSources,
  getParentNode,
  clearLinkInheritance,
} from '@/lib/funilNodeGraph';
import './Funil.css';

const NODE_TYPES = { custom: CustomNode };

const DEFAULT_EDGE_OPTIONS = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8', width: 14, height: 14 },
  style: { stroke: '#94A3B8', strokeWidth: 2 },
};

function FlowEditor({ clienteId, clienteName, onViewContacts }) {
  const flowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const { toast } = useToast();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [diagramName, setDiagramName] = useState('Novo Funil');
  const [currentId, setCurrentId] = useState(null);
  const [savedDiagrams, setSavedDiagrams] = useState([]);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metaAccountsDialogOpen, setMetaAccountsDialogOpen] = useState(false);
  const [googleAccountsDialogOpen, setGoogleAccountsDialogOpen] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const suppressUnsavedRef = useRef(true);
  const autosaveTimerRef = useRef(null);

  const {
    dateRange,
    setDateRange,
    metricsByNodeId,
    contactCountsByNodeId,
    loadingMetrics,
    loadingAttribution,
    lastFetchedAt,
    metricsError,
    refreshAll,
    applyMetricsToNodes,
  } = useFunilNodeMetrics(clienteId);

  const showToast = useCallback(
    (title, variant = 'default') => {
      toast({ title, variant: variant === 'error' ? 'destructive' : 'default' });
    },
    [toast]
  );

  const fetchDiagrams = useCallback(async () => {
    if (!clienteId) {
      setSavedDiagrams([]);
      return;
    }
    try {
      const list = await listFunilDiagrams(clienteId);
      setSavedDiagrams(list);
    } catch (error) {
      showToast(error.message || 'Erro ao carregar diagramas.', 'error');
    }
  }, [clienteId, showToast]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      suppressUnsavedRef.current = true;
      setCurrentId(null);
      setSelectedNodeId(null);
      setNodes([]);
      setEdges([]);
      setDiagramName('Novo Funil');
      setSaveStatus('saved');

      if (!clienteId) {
        setSavedDiagrams([]);
        setLoading(false);
        return;
      }

      try {
        const list = await ensureDefaultFunilForCliente(clienteId);
        if (cancelled) return;
        setSavedDiagrams(list);

        const active = list[0];
        if (active?.id) {
          const latest = active.nodes ? active : await getFunilDiagram(active.id);
          if (cancelled) return;
          const rawEdges = latest.edges || [];
          const rawNodes = migrateDiagramLinkSources(latest.nodes || [], rawEdges);
          setNodes(rawNodes);
          setEdges(colorizeEdges(rawEdges, rawNodes));
          setDiagramName(latest.name);
          setCurrentId(latest.id);
          setIsPublished(!!latest.isPublished);
          setSaveStatus('saved');
        }
      } catch (error) {
        if (!cancelled) {
          showToast(error.message || 'Erro ao carregar funil.', 'error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          requestAnimationFrame(() => {
            suppressUnsavedRef.current = false;
          });
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [clienteId, setNodes, setEdges, showToast]);

  useEffect(() => {
    if (loading || suppressUnsavedRef.current) return;
    setSaveStatus('unsaved');
  }, [nodes, edges, diagramName, loading]);

  const onConnect = useCallback(
    (params) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);
      if (!sourceNode || !targetNode) return;

      const check = canConnect(sourceNode, targetNode);
      if (!check.ok) {
        showToast(check.reason, 'error');
        return;
      }

      const newEdge = buildColoredEdge(params, nodes);
      const nextEdges = [...edges, newEdge];

      setEdges((eds) => addEdge(buildColoredEdge(params, nodes), eds));
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== params.target) return n;
          const nextData = applyLinkInheritanceOnConnect(sourceNode, n, nds, nextEdges);
          return { ...n, data: nextData };
        })
      );
      setSelectedNodeId(params.target);
      showToast(`"${targetNode.data?.label}" herdou da campanha acima.`);
    },
    [setEdges, setNodes, nodes, edges, showToast]
  );

  const handleEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  useEffect(() => {
    if (loading || suppressUnsavedRef.current) return;
    setNodes((nds) => {
      let changed = false;
      const updated = nds.map((node) => {
        if (!node.data?.linkSource?.parentNodeId) return node;
        const parent = getParentNode(node.id, nds, edges);
        if (!parent || parent.id !== node.data.linkSource.parentNodeId) {
          changed = true;
          return { ...node, data: clearLinkInheritance(node.data) };
        }
        return node;
      });
      return changed ? updated : nds;
    });
  }, [edges, loading, setNodes]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/reactflow');
      if (!type || !NODE_CONFIG[type]) return;

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const cfg = NODE_CONFIG[type];

      setNodes((nds) =>
        nds.concat({
          id: `node_${Date.now()}`,
          type: 'custom',
          position,
          data: {
            type,
            label: cfg.label,
            subtitle: cfg.description,
          },
        })
      );
    },
    [screenToFlowPosition, setNodes]
  );

  const applyDiagramState = useCallback(
    ({ id, name, nodes: nextNodes, edges: nextEdges, status = 'saved', isPublished: published }) => {
      suppressUnsavedRef.current = true;
      const rawEdges = nextEdges || [];
      const safeNodes = migrateDiagramLinkSources(nextNodes || [], rawEdges);
      setNodes(safeNodes);
      setEdges(colorizeEdges(rawEdges, safeNodes));
      setDiagramName(name || 'Novo Funil');
      setCurrentId(id ?? null);
      if (published !== undefined) setIsPublished(!!published);
      setSaveStatus(status);
      requestAnimationFrame(() => {
        suppressUnsavedRef.current = false;
      });
    },
    [setNodes, setEdges]
  );

  const saveDiagram = useCallback(async ({ silent } = {}) => {
    if (!clienteId) return;
    setSaveStatus('saving');
    const payload = { name: diagramName, nodes, edges, isPublished };
    try {
      const saved = currentId
        ? await updateFunilDiagram(currentId, payload)
        : await createFunilDiagram(clienteId, payload);

      setCurrentId(saved.id);
      setIsPublished(!!saved.isPublished);
      setSaveStatus('saved');
      if (!silent) showToast('Funil salvo com sucesso!');
      fetchDiagrams();
    } catch (error) {
      setSaveStatus('error');
      if (!silent) showToast(error.message || 'Erro ao salvar funil.', 'error');
    }
  }, [clienteId, currentId, diagramName, nodes, edges, isPublished, fetchDiagrams, showToast]);

  useEffect(() => {
    if (loading || suppressUnsavedRef.current || !currentId || saveStatus !== 'unsaved') return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      saveDiagram({ silent: true });
    }, 3000);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [nodes, edges, diagramName, loading, currentId, saveStatus, saveDiagram]);

  useEffect(() => {
    if (!metricsByNodeId && !contactCountsByNodeId) return;
    const hasMetrics = Object.keys(metricsByNodeId || {}).length > 0;
    const hasCounts = Object.keys(contactCountsByNodeId || {}).length > 0;
    if (!hasMetrics && !hasCounts) return;
    setNodes((nds) => applyMetricsToNodes(nds, metricsByNodeId, contactCountsByNodeId));
  }, [metricsByNodeId, contactCountsByNodeId, applyMetricsToNodes, setNodes]);

  const handleTogglePublished = useCallback(async () => {
    if (!clienteId || !currentId) {
      showToast('Salve o diagrama antes de publicar.', 'error');
      return;
    }
    try {
      if (!isPublished) {
        await publishFunilDiagram(clienteId, currentId);
        setIsPublished(true);
        showToast('Funil publicado — usado para métricas no hub.');
      } else {
        await updateFunilDiagram(currentId, { isPublished: false });
        setIsPublished(false);
        showToast('Funil despublicado.');
      }
      fetchDiagrams();
    } catch (error) {
      showToast(error.message || 'Erro ao alterar publicação.', 'error');
    }
  }, [clienteId, currentId, isPublished, fetchDiagrams, showToast]);

  const handleRefreshMetrics = useCallback(() => {
    refreshAll(nodes, edges);
  }, [refreshAll, nodes, edges]);

  const validationIssues = useMemo(() => {
    if (!isPublished) return [];
    return validateFunilDiagram(nodes, edges);
  }, [nodes, edges, isPublished]);

  const clearNodeInheritance = useCallback(
    (nodeId) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: clearLinkInheritance(n.data) } : n
        )
      );
    },
    [setNodes]
  );

  const loadDiagram = useCallback(
    async (id) => {
      try {
        const diagram = await getFunilDiagram(id);
        applyDiagramState({
          ...diagram,
          isPublished: diagram.isPublished,
        });
        showToast(`"${diagram.name}" carregado.`);
      } catch (error) {
        showToast(error.message || 'Erro ao carregar diagrama.', 'error');
      }
    },
    [applyDiagramState, showToast]
  );

  const deleteDiagram = useCallback(
    async (id) => {
      if (!window.confirm('Deseja deletar este funil?')) return;
      try {
        await deleteFunilDiagram(id);
        if (currentId === id) {
          applyDiagramState({ id: null, name: 'Novo Funil', nodes: [], edges: [] });
        }
        fetchDiagrams();
        showToast('Funil deletado.');
      } catch (error) {
        showToast(error.message || 'Erro ao deletar.', 'error');
      }
    },
    [currentId, fetchDiagrams, applyDiagramState, showToast]
  );

  const newDiagram = () => {
    applyDiagramState({ id: null, name: 'Novo Funil', nodes: [], edges: [], status: 'unsaved' });
  };

  const loadTemplate = () => {
    applyDiagramState({
      id: null,
      name: CLIENTE_DEFAULT_FUNIL.name,
      nodes: CLIENTE_DEFAULT_FUNIL.nodes,
      edges: CLIENTE_DEFAULT_FUNIL.edges,
      status: 'unsaved',
    });
    showToast('Template padrão do cliente carregado.');
  };

  const loadJornadaTemplate = () => {
    applyDiagramState({
      id: null,
      name: JORNADA_TEMPLATE.name,
      nodes: JORNADA_TEMPLATE.nodes,
      edges: JORNADA_TEMPLATE.edges,
      status: 'unsaved',
    });
    showToast('Jornada completa carregada.');
  };

  const loadCampanhasTemplate = () => {
    applyDiagramState({
      id: null,
      name: CAMPANHAS_TEMPLATE.name,
      nodes: CAMPANHAS_TEMPLATE.nodes,
      edges: CAMPANHAS_TEMPLATE.edges,
      status: 'unsaved',
    });
    showToast('Funil de mídia paga carregado.');
  };

  const exportPng = useCallback(async () => {
    const el = flowWrapper.current?.querySelector('.react-flow');
    if (!el) return;
    try {
      const url = await toPng(el, { backgroundColor: '#F8FAFC', pixelRatio: 2 });
      const a = document.createElement('a');
      a.download = `${diagramName.replace(/\s+/g, '_')}.png`;
      a.href = url;
      a.click();
      showToast('PNG exportado!');
    } catch {
      showToast('Falha ao exportar PNG.', 'error');
    }
  }, [diagramName, showToast]);

  const exportSvg = useCallback(async () => {
    const el = flowWrapper.current?.querySelector('.react-flow');
    if (!el) return;
    try {
      const url = await toSvg(el, { backgroundColor: '#F8FAFC' });
      const a = document.createElement('a');
      a.download = `${diagramName.replace(/\s+/g, '_')}.svg`;
      a.href = url;
      a.click();
      showToast('SVG exportado!');
    } catch {
      showToast('Falha ao exportar SVG.', 'error');
    }
  }, [diagramName, showToast]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const onNodeClick = useCallback((_, node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const updateNodeData = useCallback(
    (nodeId, key, value) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n))
      );
    },
    [setNodes]
  );

  const updateNodeMetaLink = useCallback(
    (nodeId, metaLink) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const nextData = { ...n.data };
          if (metaLink == null) {
            delete nextData.metaLink;
          } else {
            nextData.metaLink = metaLink;
          }
          return { ...n, data: nextData };
        })
      );
    },
    [setNodes]
  );

  const updateNodeAudienceMeta = useCallback(
    (nodeId, audienceMeta) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const nextData = { ...n.data };
          if (audienceMeta == null) {
            delete nextData.audienceMeta;
          } else {
            nextData.audienceMeta = audienceMeta;
          }
          return { ...n, data: nextData };
        })
      );
    },
    [setNodes]
  );

  const updateNodePixelMeta = useCallback(
    (nodeId, pixelMeta) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const nextData = { ...n.data };
          if (pixelMeta == null) {
            delete nextData.pixelMeta;
          } else {
            nextData.pixelMeta = pixelMeta;
          }
          return { ...n, data: nextData };
        })
      );
    },
    [setNodes]
  );

  const updateNodeWhatsAppChannel = useCallback(
    (nodeId, whatsappChannel) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const nextData = { ...n.data };
          if (whatsappChannel == null) {
            delete nextData.whatsappChannel;
          } else {
            nextData.whatsappChannel = whatsappChannel;
            if (whatsappChannel.waUrl) nextData.url = whatsappChannel.waUrl;
          }
          return { ...n, data: nextData };
        })
      );
    },
    [setNodes]
  );

  const updateNodeGoogleLink = useCallback(
    (nodeId, googleLink) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const nextData = { ...n.data };
          if (googleLink == null) {
            delete nextData.googleLink;
          } else {
            nextData.googleLink = googleLink;
          }
          return { ...n, data: nextData };
        })
      );
    },
    [setNodes]
  );

  const updateNodeLinkOverride = useCallback(
    (nodeId, linkOverride) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const nextData = { ...n.data };
          if (!linkOverride) {
            delete nextData.linkOverride;
          } else {
            nextData.linkOverride = { ...(nextData.linkOverride || {}), ...linkOverride };
          }
          if (linkOverride?.adId && nextData.linkSource) {
            nextData.metaLink = {
              ...(nextData.metaLink || {}),
              adId: linkOverride.adId,
              adName: linkOverride.adName,
            };
          }
          if (linkOverride?.creativeThumbnailUrl !== undefined) {
            if (linkOverride.creativeThumbnailUrl) {
              nextData.creativeThumbnailUrl = linkOverride.creativeThumbnailUrl;
              nextData.creativeThumbnailUrlAdId = linkOverride.adId || nextData.creativeThumbnailUrlAdId;
            } else {
              delete nextData.creativeThumbnailUrl;
              delete nextData.creativeThumbnailUrlAdId;
            }
          }
          if (linkOverride?.adGroupId && nextData.linkSource) {
            nextData.googleLink = {
              ...(nextData.googleLink || {}),
              adGroupId: linkOverride.adGroupId,
              adGroupName: linkOverride.adGroupName,
            };
          }
          return { ...n, data: nextData };
        })
      );
    },
    [setNodes]
  );

  const connectedMetaNodesCount = useMemo(() => countNodesWithMetaLink(nodes), [nodes]);
  const connectedGoogleNodesCount = useMemo(() => countNodesWithGoogleLink(nodes), [nodes]);

  const miniMapColor = useCallback((node) => getNodeEdgeColor(node), []);

  if (loading) {
    return (
      <div className="funil-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="funil-app">
      <Toolbar
        diagramName={diagramName}
        clienteName={clienteName}
        onNameChange={setDiagramName}
        onSave={() => saveDiagram()}
        onExportPng={exportPng}
        onExportSvg={exportSvg}
        onNew={newDiagram}
        onLoadTemplate={loadTemplate}
        onLoadJornada={loadJornadaTemplate}
        onLoadCampanhas={loadCampanhasTemplate}
        saveStatus={saveStatus}
        isPublished={isPublished}
        onTogglePublished={handleTogglePublished}
      />

      <FunilEditorChrome
        clienteId={clienteId}
        clienteName={clienteName}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onRefreshMetrics={handleRefreshMetrics}
        loadingMetrics={loadingMetrics || loadingAttribution}
        lastFetchedAt={lastFetchedAt}
        metricsError={metricsError}
        connectedMetaNodesCount={connectedMetaNodesCount}
        connectedGoogleNodesCount={connectedGoogleNodesCount}
        metaAccountsDialogOpen={metaAccountsDialogOpen}
        onMetaAccountsDialogOpenChange={setMetaAccountsDialogOpen}
        googleAccountsDialogOpen={googleAccountsDialogOpen}
        onGoogleAccountsDialogOpenChange={setGoogleAccountsDialogOpen}
        validationIssues={validationIssues}
      />

      <div className="funil-app-body">
        <Sidebar
          savedDiagrams={savedDiagrams}
          onLoadDiagram={loadDiagram}
          onDeleteDiagram={deleteDiagram}
          currentId={currentId}
          clienteName={clienteName}
        />

        <div
          className="funil-flow-wrapper"
          ref={flowWrapper}
          style={selectedNodeId ? { marginRight: 0 } : {}}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode="Shift"
            selectionOnDrag={false}
            panOnDrag={[1, 2]}
          >
            <Background color="#CBD5E1" gap={24} size={1} variant="dots" />
            <Controls showInteractive />
            <MiniMap
              nodeColor={miniMapColor}
              maskColor="rgba(241,245,249,0.85)"
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
            />
          </ReactFlow>
        </div>

        <NodePanel
          node={selectedNode}
          nodes={nodes}
          edges={edges}
          onUpdate={updateNodeData}
          onClose={() => setSelectedNodeId(null)}
          clienteId={clienteId}
          onUpdateMetaLink={updateNodeMetaLink}
          onUpdatePixelMeta={updateNodePixelMeta}
          onUpdateAudienceMeta={updateNodeAudienceMeta}
          onUpdateGoogleLink={updateNodeGoogleLink}
          onUpdateLinkOverride={updateNodeLinkOverride}
          onClearInheritance={clearNodeInheritance}
          onRequestLinkAccounts={() => setMetaAccountsDialogOpen(true)}
          onRequestLinkGoogleAccounts={() => setGoogleAccountsDialogOpen(true)}
          metricsDateRange={dateRange}
          onViewContacts={onViewContacts}
        />
      </div>
    </div>
  );
}

export default function FunilEditor({ clienteId, clienteName, onViewContacts }) {
  if (!clienteId) {
    return (
      <Card className="rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-card shadow-sm">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Selecione um cliente no topo para ver o funil desta conta.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="funil-shell rounded-lg border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-card shadow-sm overflow-hidden min-w-0 flex-1 min-h-0 flex flex-col">
      <ReactFlowProvider>
        <FlowEditor
          clienteId={clienteId}
          clienteName={clienteName}
          onViewContacts={onViewContacts}
        />
      </ReactFlowProvider>
    </div>
  );
}
