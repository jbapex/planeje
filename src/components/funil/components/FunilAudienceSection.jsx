import React, { useMemo } from 'react';
import { Users } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getParentNode, getUpstreamPixelMeta } from '@/lib/funilNodeGraph';

export default function FunilAudienceSection({
  node,
  nodes,
  edges,
  audienceMeta,
  onAudienceMetaChange,
  nodeType,
}) {
  const parent = getParentNode(node.id, nodes, edges);
  const upstream = useMemo(
    () => getUpstreamPixelMeta(node, nodes, edges),
    [node, nodes, edges]
  );

  const audiences = upstream?.pixelMeta?.customAudiences || [];
  const selectedId = audienceMeta?.customAudienceId || '';

  const handleSelect = (audienceId) => {
    const aud = audiences.find((a) => a.id === audienceId);
    onAudienceMetaChange?.({
      customAudienceId: audienceId,
      customAudienceName: aud?.name || audienceId,
      subtype: aud?.subtype || null,
      approximateCount: aud?.approximateCount ?? null,
      sourcePixelNodeId: upstream?.pixelNode?.id || null,
      sourcePixelName: upstream?.pixelMeta?.pixelName || upstream?.pixelLabel || null,
      selectedAt: new Date().toISOString(),
    });
  };

  const handleClear = () => {
    onAudienceMetaChange?.(null);
  };

  const isLookalike = nodeType === 'lookalike';

  if (!parent) {
    return (
      <div className="funil-inherited-connect funil-inherited-connect--warn">
        <p className="text-xs text-muted-foreground">
          Arraste a aresta <strong>do Pixel Meta para este nó</strong> (não o contrário).
          Ex.: Meta → Pixel Meta → {isLookalike ? 'Lookalike' : 'Audiência Custom'}.
        </p>
      </div>
    );
  }

  if (!upstream) {
    return (
      <div className="funil-inherited-connect funil-inherited-connect--warn">
        <p className="text-xs text-muted-foreground">
          Na cadeia acima precisa existir um nó <strong>Pixel Meta</strong> (ex.: Meta → Pixel →
          este nó).
        </p>
      </div>
    );
  }

  if (!upstream.pixelMeta?.pixelId) {
    return (
      <div className="funil-inherited-connect funil-inherited-connect--warn">
        <p className="text-xs text-muted-foreground">
          No nó &quot;{upstream.pixelLabel}&quot; selecione o pixel e clique em{' '}
          <strong>Atualizar pixel</strong> para carregar os públicos.
        </p>
      </div>
    );
  }

  if (audiences.length === 0) {
    return (
      <div className="funil-inherited-connect funil-inherited-connect--warn">
        <p className="text-xs text-muted-foreground">
          Nenhum público listado no Pixel &quot;{upstream.pixelMeta.pixelName}&quot;. Atualize o pixel
          de novo ou crie públicos no Gerenciador de Anúncios.
        </p>
      </div>
    );
  }

  return (
    <div className="funil-inherited-connect funil-audience-pick">
      <div className="funil-inherited-connect__head">
        <Users className="h-4 w-4 text-[#7C3AED]" />
        <span className="funil-inherited-connect__title">
          {isLookalike ? 'Público base (Lookalike)' : 'Público personalizado Meta'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mt-1">
        Fonte: Pixel &quot;{upstream.pixelMeta.pixelName}&quot; · {audiences.length}{' '}
        {audiences.length === 1 ? 'público disponível' : 'públicos disponíveis'}
      </p>

      <div className="space-y-2 mt-3">
        <Label className="text-xs">Qual público vamos usar</Label>
        <Select value={selectedId || undefined} onValueChange={handleSelect}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Selecione o público" />
          </SelectTrigger>
          <SelectContent>
            {audiences.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
                {a.subtype ? ` · ${a.subtype}` : ''}
                {a.approximateCount != null
                  ? ` · ~${Number(a.approximateCount).toLocaleString('pt-BR')}`
                  : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedId && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={handleClear}
          >
            Limpar seleção
          </button>
        )}
      </div>

      {selectedId && audienceMeta?.customAudienceName && (
        <div className="mt-2 text-xs text-muted-foreground rounded-md bg-violet-50 dark:bg-violet-950/30 px-2 py-1.5 border border-violet-200/80">
          <span className="font-medium text-violet-900 dark:text-violet-200">Escolhido:</span>{' '}
          {audienceMeta.customAudienceName}
          {audienceMeta.subtype && (
            <span className="text-muted-foreground"> ({audienceMeta.subtype})</span>
          )}
        </div>
      )}
    </div>
  );
}
