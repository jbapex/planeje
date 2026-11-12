import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { googleDeliveryLabel, googleDeliveryState, googleEventLabel, googleEventMetadata } from '@/lib/rastreamentoEventosGoogle';
import { formatEventosWhen } from '@/lib/rastreamentoEventosMeta';

export function GoogleEventStatus({ row }) {
  const state = googleDeliveryState(row);
  return <span className={`eventos-chip eventos-chip--${state === 'uncertain' ? 'failed' : state}`}>{googleDeliveryLabel(state)}</span>;
}

export default function RastreamentoGoogleEventHistory({ group, onClose }) {
  return (
    <Dialog open={Boolean(group)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="google-event-history max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico do evento Google</DialogTitle>
          <DialogDescription>{group?.leadName} · {googleEventLabel(group?.eventName)}. Tentativas carregadas no período selecionado.</DialogDescription>
        </DialogHeader>
        {group ? <>
          <p className="text-sm text-muted-foreground">Uma conversão, {group.attempts.length} tentativa{group.attempts.length === 1 ? '' : 's'}. Falhas anteriores são preservadas para consulta.</p>
          <ol className="grid gap-3">
            {group.attempts.map((row, index) => {
              const meta = googleEventMetadata(row);
              return <li key={row.id} className="rounded-xl border p-3 grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">Tentativa {group.attempts.length - index}{row.id === group.current.id ? ' · Resultado atual' : ''}</strong>
                  <GoogleEventStatus row={row} />
                </div>
                <time className="text-xs text-muted-foreground">{formatEventosWhen(row.created_at)}</time>
                {row.error_message ? <p className="text-sm whitespace-pre-wrap break-words">{row.error_message}</p> : null}
                {meta?.lastCheckError ? <p className="text-sm">Última consulta: {meta.lastCheckError}</p> : null}
                {meta?.retryOf ? <small>Reenvio de uma tentativa anterior.</small> : null}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Identificadores e processamento</summary>
                  <dl className="mt-2 grid gap-2 break-words">
                    <div><dt>Registro</dt><dd>{row.id}</dd></div>
                    <div><dt>Conta Google Ads</dt><dd>{row.customer_id || 'Não informada'}</dd></div>
                    <div><dt>Ação de conversão</dt><dd>{row.conversion_action || 'Não informada'}</dd></div>
                    <div><dt>GCLID</dt><dd>{row.gclid || 'Não informado'}</dd></div>
                    {meta?.requestId ? <div><dt>Pedido no Google</dt><dd>{meta.requestId}</dd></div> : null}
                    {meta?.nextCheckAt && meta.phase === 'processing' ? <div><dt>Próxima consulta a partir de</dt><dd>{formatEventosWhen(meta.nextCheckAt)}</dd></div> : null}
                  </dl>
                </details>
              </li>;
            })}
          </ol>
        </> : null}
      </DialogContent>
    </Dialog>
  );
}
