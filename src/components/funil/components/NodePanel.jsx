import React, { useMemo } from 'react';
import { NODE_CONFIG } from '@/components/funil/nodeConfig';
import {
  isMetaConnectableNode,
  isMetaCampaignEditorNode,
  isMetaInheritedChildNode,
} from '@/lib/funilMetaLink';
import {
  isGoogleConnectableNode,
  isGoogleCampaignEditorNode,
} from '@/lib/funilGoogleLink';
import {
  getFunilNodeRole,
  getInheritedMetaLink,
  getInheritedGoogleLink,
  resolveEffectiveLink,
} from '@/lib/funilNodeGraph';
import FunilMetaConnectSection from '@/components/funil/components/FunilMetaConnectSection';
import FunilGoogleConnectSection from '@/components/funil/components/FunilGoogleConnectSection';
import FunilInheritedMetaSection from '@/components/funil/components/FunilInheritedMetaSection';
import FunilInheritedGoogleSection from '@/components/funil/components/FunilInheritedGoogleSection';
import FunilNodeMetricsSection from '@/components/funil/components/FunilNodeMetricsSection';
import FunilPixelMetaSection from '@/components/funil/components/FunilPixelMetaSection';
import FunilAudienceSection from '@/components/funil/components/FunilAudienceSection';
import { isPixelMetaNode } from '@/lib/funilNodeGraph';
import { isAudiencePickerNode } from '@/lib/funilAudienceMeta';
import FunilMetaAdsetSection from '@/components/funil/components/FunilMetaAdsetSection';
import { isMetaAdsetNode } from '@/lib/funilMetaAdset';
import FunilWhatsAppSection from '@/components/funil/components/FunilWhatsAppSection';
import { isWhatsAppNode } from '@/lib/funilWhatsApp';

function Field({ label, value, onChange, multiline, placeholder }) {
  return (
    <div className="np-field">
      <label className="np-label">{label}</label>
      {multiline ? (
        <textarea
          className="np-textarea"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
        />
      ) : (
        <input
          className="np-input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

export default function NodePanel({
  node,
  nodes = [],
  edges = [],
  onUpdate,
  onClose,
  clienteId,
  onUpdateMetaLink,
  onUpdateGoogleLink,
  onUpdateLinkOverride,
  onClearInheritance,
  onRequestLinkAccounts,
  onRequestLinkGoogleAccounts,
  metricsDateRange,
  onViewContacts,
  onUpdatePixelMeta,
  onUpdateAudienceMeta,
  onUpdateWhatsAppChannel,
}) {
  if (!node) return null;

  const cfg = NODE_CONFIG[node.data?.type] || {};
  const d = node.data;
  const upd = (key) => (val) => onUpdate(node.id, key, val);
  const role = getFunilNodeRole(d.type);

  const effective = useMemo(
    () => resolveEffectiveLink(node, nodes, edges),
    [node, nodes, edges]
  );

  const showMetaCampaignEditor =
    isMetaConnectableNode(node) && isMetaCampaignEditorNode(node);
  const showMetaAdset = isMetaAdsetNode(node);
  const showMetaInherited =
    !showMetaCampaignEditor &&
    !showMetaAdset &&
    isMetaConnectableNode(node) &&
    (isMetaInheritedChildNode(node) || role === 'channel' || role === 'creative');
  const showGoogleCampaignEditor =
    isGoogleConnectableNode(node) && isGoogleCampaignEditorNode(node);
  const showGoogleInherited =
    isGoogleConnectableNode(node) &&
    d.linkSource?.parentNodeId &&
    !showGoogleCampaignEditor &&
    (role === 'channel' || role === 'creative' || getInheritedGoogleLink(node, nodes, edges));

  const metricsData = useMemo(
    () => ({
      ...d,
      metrics: d.metrics,
      metaLink: effective.metaLink,
      googleLink: effective.googleLink,
    }),
    [d, effective]
  );

  const showPixelMeta = isPixelMetaNode(node);
  const showAudiencePicker = isAudiencePickerNode(node);
  const showCreative = ['Tráfego', 'Criativos'].includes(cfg.category);
  const showUrl = ['Tráfego', 'Criativos', 'Páginas'].includes(cfg.category);

  const handleClearInheritance = () => {
    onClearInheritance?.(node.id);
  };

  return (
    <aside className="node-panel">
      <div className="node-panel__header">
        <div className="node-panel__type">
          <span className="node-panel__dot" style={{ background: cfg.bg || '#94A3B8' }} />
          <span className="node-panel__type-name">{cfg.label || 'Nó'}</span>
        </div>
        <button className="node-panel__close" onClick={onClose} title="Fechar painel">
          ✕
        </button>
      </div>

      <div className="node-panel__body">
        <Field label="Nome" value={d.label} onChange={upd('label')} placeholder="Nome do nó" />
        <Field
          label="Subtítulo"
          value={d.subtitle}
          onChange={upd('subtitle')}
          placeholder="Breve descrição"
        />

        {showMetaCampaignEditor && (
          <FunilMetaConnectSection
            clienteId={clienteId}
            metaLink={d.metaLink}
            onMetaLinkChange={(metaLink) => onUpdateMetaLink(node.id, metaLink)}
            onRequestLinkAccounts={onRequestLinkAccounts}
          />
        )}

        {showMetaAdset && (
          <FunilMetaAdsetSection
            node={node}
            nodes={nodes}
            edges={edges}
            onLinkOverrideChange={(override) => onUpdateLinkOverride?.(node.id, override)}
          />
        )}

        {showPixelMeta && (
          <FunilPixelMetaSection
            node={node}
            nodes={nodes}
            edges={edges}
            clienteId={clienteId}
            pixelMeta={d.pixelMeta}
            onPixelMetaChange={(pixelMeta) => onUpdatePixelMeta?.(node.id, pixelMeta)}
          />
        )}

        {showAudiencePicker && (
          <FunilAudienceSection
            node={node}
            nodes={nodes}
            edges={edges}
            nodeType={d.type}
            audienceMeta={d.audienceMeta}
            onAudienceMetaChange={(meta) => onUpdateAudienceMeta?.(node.id, meta)}
          />
        )}

        {showMetaInherited && (
          <FunilInheritedMetaSection
            node={node}
            nodes={nodes}
            edges={edges}
            onLinkOverrideChange={(override) => onUpdateLinkOverride?.(node.id, override)}
            onClearInheritance={d.linkSource ? handleClearInheritance : undefined}
          />
        )}

        {showGoogleCampaignEditor && (
          <FunilGoogleConnectSection
            clienteId={clienteId}
            googleLink={d.googleLink}
            nodeType={d.type}
            onGoogleLinkChange={(googleLink) => onUpdateGoogleLink(node.id, googleLink)}
            onRequestLinkAccounts={onRequestLinkGoogleAccounts}
          />
        )}

        {showGoogleInherited && (
          <FunilInheritedGoogleSection
            node={node}
            nodes={nodes}
            edges={edges}
            onLinkOverrideChange={(override) => onUpdateLinkOverride?.(node.id, override)}
            onClearInheritance={d.linkSource ? handleClearInheritance : undefined}
          />
        )}

        <FunilNodeMetricsSection
          nodeData={metricsData}
          dateRange={metricsDateRange}
          onViewContacts={onViewContacts}
        />

        {showCreative && (
          <Field
            label="Criativo"
            value={d.creative}
            onChange={upd('creative')}
            placeholder="Ex: Vídeo 3 — Micro Trator 2024"
          />
        )}

        {showUrl && (
          <Field label="URL / Link" value={d.url} onChange={upd('url')} placeholder="https://..." />
        )}

        <Field
          label="Copy / Mensagem"
          value={d.copy}
          onChange={upd('copy')}
          multiline
          placeholder="Texto do anúncio, email ou página..."
        />

        <Field
          label="Observações"
          value={d.notes}
          onChange={upd('notes')}
          multiline
          placeholder="Notas internas, pendências, ideias..."
        />
      </div>

      {(d.creative ||
        d.url ||
        d.copy ||
        d.notes ||
        effective.metaLink?.campaignId ||
        effective.googleLink?.campaignId ||
        d.pixelMeta?.pixelId ||
        d.audienceMeta?.customAudienceId ||
        d.linkSource) && (
        <div className="node-panel__footer">
          <span className="node-panel__filled">
            {[
              d.linkSource && 'Herdado',
              d.pixelMeta?.pixelId && 'Pixel',
              d.audienceMeta?.customAudienceId && 'Público',
              (d.linkOverride?.adSetId || effective.metaLink?.adSetId) && 'Conjunto',
              effective.metaLink?.campaignId && 'Meta',
              effective.googleLink?.campaignId && 'Google',
              effective.metaLink?.adId && 'Anúncio',
              d.creative && 'Criativo',
              d.url && 'URL',
              d.copy && 'Copy',
              d.notes && 'Obs',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      )}
    </aside>
  );
}
