import React, { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFunilPixelMeta } from '@/hooks/useFunilPixelMeta';
import { getInheritedMetaAccount, getParentNode } from '@/lib/funilNodeGraph';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function FunilPixelMetaSection({
  node,
  nodes,
  edges,
  clienteId,
  pixelMeta,
  onPixelMetaChange,
}) {
  const parent = getParentNode(node.id, nodes, edges);
  const inheritedAccount = useMemo(
    () => getInheritedMetaAccount(node, nodes, edges),
    [node, nodes, edges]
  );

  const accountId = inheritedAccount?.accountId;
  const selectedPixelId = pixelMeta?.pixelId || '';

  const {
    pixels,
    loadingPixels,
    pixelsError,
    fetchPixels,
    syncing,
    syncError,
    syncPixelMeta,
  } = useFunilPixelMeta({
    clienteId,
    adAccountId: accountId,
    pixelId: selectedPixelId,
  });

  useEffect(() => {
    if (accountId) fetchPixels();
  }, [accountId, fetchPixels]);

  const handlePixelSelect = (pixelId) => {
    const px = pixels.find((p) => p.id === pixelId);
    onPixelMetaChange?.({
      ...(pixelMeta || {}),
      pixelId,
      pixelName: px?.name || pixelId,
    });
  };

  const handleSync = async () => {
    if (!selectedPixelId) return;
    const px = pixels.find((p) => p.id === selectedPixelId);
    try {
      const next = await syncPixelMeta(selectedPixelId, px?.name || pixelMeta?.pixelName);
      onPixelMetaChange?.(next);
    } catch {
      /* syncError no hook */
    }
  };

  if (!parent) {
    return (
      <div className="funil-inherited-connect funil-inherited-connect--warn">
        <p className="text-xs text-muted-foreground">
          Conecte este nó à campanha Meta, canal ou criativo (ex.: Meta → Criativo → Pixel Meta).
        </p>
      </div>
    );
  }

  if (!accountId) {
    return (
      <div className="funil-inherited-connect funil-inherited-connect--warn">
        <p className="text-xs text-muted-foreground">
          O nó pai precisa ter conta Meta configurada na campanha.
        </p>
      </div>
    );
  }

  const events = pixelMeta?.events || [];
  const audiences = pixelMeta?.customAudiences || [];
  const leadEvent = events.find((e) => e.key === 'Lead');

  return (
    <div className="funil-inherited-connect funil-pixel-meta">
      <div className="funil-inherited-connect__head">
        <BarChart2 className="h-4 w-4 text-[#1877F2]" />
        <span className="funil-inherited-connect__title">Pixel Meta</span>
      </div>

      <div className="funil-inherited-connect__summary text-xs text-muted-foreground space-y-1">
        <div>
          <span className="font-medium text-foreground/80">Conta:</span>{' '}
          {inheritedAccount.accountName || inheritedAccount.accountId}
        </div>
        {inheritedAccount.campaignName && (
          <div>
            <span className="font-medium text-foreground/80">Campanha:</span>{' '}
            {inheritedAccount.campaignName}
          </div>
        )}
        <div>
          <span className="font-medium text-foreground/80">Pai:</span> {parent.data?.label || '—'}
        </div>
      </div>

      <div className="space-y-2 mt-3">
        <Label className="text-xs">Pixel da conta</Label>
        <Select
          value={selectedPixelId || undefined}
          onValueChange={handlePixelSelect}
          disabled={loadingPixels || !pixels.length}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={loadingPixels ? 'Carregando…' : 'Selecione o pixel'} />
          </SelectTrigger>
          <SelectContent>
            {pixels.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {p.lastFiredAt ? ` · ${formatDate(p.lastFiredAt)}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pixelsError && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{pixelsError}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 text-xs"
          disabled={!selectedPixelId || syncing}
          onClick={handleSync}
        >
          {syncing ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1" />
          )}
          Atualizar pixel
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" asChild>
          <Link to="/client-area/crm/canais">
            <ExternalLink className="h-3 w-3 mr-1" />
            CAPI WhatsApp
          </Link>
        </Button>
      </div>

      {syncError && (
        <p className="text-xs text-destructive mt-2">{syncError}</p>
      )}

      {pixelMeta?.fetchedAt && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Atualizado: {formatDate(pixelMeta.fetchedAt)}
        </p>
      )}

      {events.length > 0 && (
        <div className="mt-4">
          <Label className="text-xs mb-2 block">Eventos registrados</Label>
          <div className="funil-pixel-meta__table-wrap">
            <table className="funil-pixel-meta__table text-xs w-full">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Status</th>
                  <th>Último disparo</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.key}>
                    <td>{ev.label || ev.key}</td>
                    <td>
                      <span
                        className={
                          ev.status === 'active'
                            ? 'text-emerald-600'
                            : 'text-muted-foreground'
                        }
                      >
                        {ev.status === 'active' ? 'Ativo' : '—'}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{formatDate(ev.lastFiredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!leadEvent?.lastFiredAt && leadEvent?.status !== 'active' && (
            <p className="text-[10px] text-amber-600 mt-1">
              Lead ainda sem disparo registrado — confira pixel no site e CAPI em Canais.
            </p>
          )}
        </div>
      )}

      {audiences.length > 0 && (
        <div className="mt-4">
          <Label className="text-xs mb-2 block">
            Públicos personalizados ({audiences.length})
          </Label>
          <div className="funil-pixel-meta__table-wrap max-h-40 overflow-y-auto">
            <table className="funil-pixel-meta__table text-xs w-full">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {audiences.map((a) => (
                  <tr key={a.id}>
                    <td className="truncate max-w-[120px]" title={a.name}>
                      {a.name}
                    </td>
                    <td>{a.subtype || '—'}</td>
                    <td>
                      {a.approximateCount != null
                        ? `~${Number(a.approximateCount).toLocaleString('pt-BR')}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
