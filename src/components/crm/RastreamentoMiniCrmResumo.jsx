import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { fetchMiniCrmSummary } from '@/lib/rastreamentoMiniCrmResumo';
import { statusInk } from '@/lib/miniCrm';
import { Button } from '@/components/ui/button';

export default function RastreamentoMiniCrmResumo({ clienteId, contactId, open }) {
  const [state, setState] = useState(null);
  const [version, setVersion] = useState(0);
  const scope = `${clienteId || ''}:${contactId || ''}`;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState(null);
    void fetchMiniCrmSummary(supabase, { clienteId, contactId }).then((fields) => {
      if (!cancelled) setState({ scope, fields });
    }).catch(() => {
      if (!cancelled) setState({ scope, error: true });
    });
    return () => { cancelled = true; };
  }, [open, clienteId, contactId, scope, version]);
  const current = state?.scope === scope ? state : null;
  return <section className="rt-lead-ficha__mark" aria-label="Mini CRM">
    <div className="flex items-center justify-between gap-2">
      <h3>Mini CRM</h3>
      <Button type="button" size="sm" variant="ghost" onClick={() => setVersion((value) => value + 1)} disabled={!current}>Atualizar dados</Button>
    </div>
    {!current ? <p role="status" className="text-sm text-muted-foreground">Carregando Mini CRM…</p>
      : current.error ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar o Mini CRM. Tente atualizar os dados.</p>
        : !current.fields.length ? <p className="text-sm text-muted-foreground">Nenhuma ficha de Mini CRM vinculada a este contato.</p>
          : <dl className="rt-lead-ficha__mark-grid mt-2">
            {current.fields.map((field) => <div key={field.key} className={`rt-lead-ficha__mark-cell ${['observacao', 'proxima_acao'].includes(field.key) ? 'col-span-2' : ''}`}>
              <dt className="text-xs font-semibold text-muted-foreground">{field.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                {field.color ? <span className="rt-lead-ficha__mini-status" style={{ '--mini-crm-status': field.color, '--mini-crm-status-ink': statusInk(field.color) }}>{field.value}</span> : field.value}
              </dd>
            </div>)}
          </dl>}
  </section>;
}
