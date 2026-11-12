import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/customSupabaseClient';
import { googleDataProductErrorCopy, mapTagManagerInventory } from '@/lib/googleDataInsightsView';

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR').format(Number(value));
}

function InventoryTable({ title, hint, columns, rows, render }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {rows.length === 0 ? <p className="ga-detail-empty">Nada publicado nesta lista.</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => <TableHead key={column}>{column}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>{rows.map(render)}</TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function GoogleTagBoard({ clienteId }) {
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [inventory, setInventory] = useState(null);

  const load = useCallback(async () => {
    if (!clienteId || clienteId === 'all') {
      setInventory(null);
      setMissing(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: links, error: linkError } = await supabase
        .from('cliente_google_tag_containers')
        .select('account_id, container_id, public_id, container_name')
        .eq('cliente_id', clienteId)
        .eq('is_active', true)
        .limit(1);
      if (linkError) throw linkError;
      const link = links?.[0];
      if (!link?.account_id || !link?.container_id) {
        setMissing(true);
        setInventory(null);
        return;
      }
      setMissing(false);
      const { data, error: fnError } = await supabase.functions.invoke('google-data-api', {
        body: {
          action: 'get-tagmanager-overview',
          accountId: link.account_id,
          containerId: link.container_id,
        },
      });
      if (fnError) throw fnError;
      if (data?.error?.message) throw new Error(googleDataProductErrorCopy(data.error.message));
      setInventory(mapTagManagerInventory({
        ...data,
        publicId: data?.publicId || link.public_id,
        containerName: data?.containerName || link.container_name,
      }));
    } catch (err) {
      setInventory(null);
      setError(err.message || 'Não foi possível ler o Tag Manager.');
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => { void load(); }, [load]);

  if (!clienteId || clienteId === 'all') {
    return <p className="ga-board-note">Escolha o cliente. O Tag Manager lê o contêiner vinculado a ele.</p>;
  }
  if (loading) {
    return <p className="ga-board-note"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Lendo o Tag Manager…</p>;
  }
  if (missing) {
    return <p className="ga-board-note">Este cliente não tem contêiner do Tag Manager vinculado. O vínculo fica em Rastreamento → Integrações → Analytics.</p>;
  }
  if (error) return <p className="ga-board-note">{error}</p>;
  if (!inventory) return null;

  return (
    <div className="space-y-4">
      <p className="ga-board-note">
        {inventory.containerName || 'Tag Manager'}
        {inventory.publicId ? ` · ${inventory.publicId}` : ''}
        {inventory.versionName ? ` · ${inventory.versionName}` : ' · versão publicada'}
        . Tags, acionadores e variáveis que estão no ar. A data de cima não muda esta lista.
        {inventory.tagManagerUrl ? (
          <>
            {' '}
            <a href={inventory.tagManagerUrl} target="_blank" rel="noreferrer">Abrir no Tag Manager</a>
          </>
        ) : null}
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ['Tags', formatNumber(inventory.tags)],
          ['Ativas', formatNumber(inventory.activeTags)],
          ['Pausadas', formatNumber(inventory.pausedTags)],
          ['Acionadores', formatNumber(inventory.triggers)],
          ['Variáveis', formatNumber(inventory.variables)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{value}</p></CardContent>
          </Card>
        ))}
      </div>
      {inventory.typeCounts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {inventory.typeCounts.map((item) => (
            <span key={item.label} className="ga-type-chip">{item.label} · {item.count}</span>
          ))}
        </div>
      ) : null}
      <InventoryTable
        title="Tags publicadas"
        hint="Cada tag com o tipo, o acionador e um recorte do identificador ou do HTML publicado."
        columns={['Tag', 'Tipo', 'Estado', 'Dispara em', 'Detalhe']}
        rows={inventory.tagList}
        render={(row) => (
          <TableRow key={`${row.name}-${row.type}`}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>{row.typeLabel}</TableCell>
            <TableCell>
              <Badge variant={row.paused ? 'secondary' : 'default'}>{row.paused ? 'Pausada' : 'Ativa'}</Badge>
            </TableCell>
            <TableCell className="max-w-[360px]">{row.fires.length ? row.fires.join(', ') : '—'}</TableCell>
            <TableCell className="max-w-[280px] text-xs text-muted-foreground">
              {row.measurementId ? <span className="block text-foreground">{row.measurementId}</span> : null}
              {row.snippet || row.notes?.length ? (row.snippet || row.notes.join(' · ')) : (row.measurementId ? null : '—')}
            </TableCell>
          </TableRow>
        )}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <InventoryTable
          title="Acionadores"
          columns={['Acionador', 'Tipo']}
          rows={inventory.triggerList}
          render={(row) => (
            <TableRow key={`${row.name}-${row.type}`}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>{row.typeLabel}</TableCell>
            </TableRow>
          )}
        />
        <InventoryTable
          title="Variáveis"
          hint="As variáveis criadas no contêiner. As embutidas do Google não entram nesta lista."
          columns={['Variável', 'Tipo']}
          rows={inventory.variableList}
          render={(row) => (
            <TableRow key={`${row.name}-${row.type}`}>
              <TableCell className="font-medium">
                {row.name}
                {row.value ? <span className="block text-xs text-muted-foreground">{row.value}</span> : null}
              </TableCell>
              <TableCell>{row.typeLabel}</TableCell>
            </TableRow>
          )}
        />
      </div>
    </div>
  );
}
