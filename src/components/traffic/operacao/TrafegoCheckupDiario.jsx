import { useEffect, useMemo, useState } from 'react';
import { CHECKUP_OUTCOMES, checkupOutcomeLabel } from '@/lib/centralTrafegoCheckup';
import { formatOperationalUpdatedAt } from '@/lib/centralTrafego';
import {
  ActionLink,
  EmptyState,
  HealthBadge,
  MoneyText,
  SeverityIcon,
  clientHref,
  useIsCompact,
} from '@/components/traffic/operacao/TrafegoOperacaoBits';

function CheckupForm({ client, onConfirm, sticky, ops }) {
  const [result, setResult] = useState(client.checkup.result || '');
  const [note, setNote] = useState(client.checkup.note || '');
  const [problem, setProblem] = useState(client.checkup.problem || '');
  const [due, setDue] = useState('');
  const confirmed = Boolean(client.checkup.result);

  const submit = () => onConfirm?.(client, { result, note, problem, due });

  return (
    <>
      <div className={sticky ? 'trafego-sheet-body' : 'trafego-conference-body'}>
        <div className="trafego-line" style={{ borderTop: 0, paddingTop: 0 }}>
          <SeverityIcon health={client.health} />
          <div>
            <p>{client.empresa}</p>
            <small>{client.gestorName || 'Sem gestor'}</small>
          </div>
          <HealthBadge health={client.health} />
        </div>
        <div className="trafego-kpis4">
          <div className="trafego-kpi">
            <span>Campanhas</span>
            <strong>
              {client.requireActiveCampaign === false && !client.activeCampaigns ? 'Não esperada' : client.activeCampaigns}
            </strong>
          </div>
          <div className="trafego-kpi">
            <span>Investido</span>
            <strong>
              <MoneyText metric={client.spendMonth} />
            </strong>
          </div>
          <div className="trafego-kpi">
            <span>Orçamento / saldo</span>
            <strong>
              {client.budget.available ? (
                <>
                  <MoneyText metric={client.budget} />
                  {client.remaining.available ? (
                    <>
                      {' · '}
                      <MoneyText metric={client.remaining} />
                    </>
                  ) : null}
                </>
              ) : (
                'Dados indisponíveis'
              )}
            </strong>
          </div>
          <div className="trafego-kpi">
            <span>Ritmo</span>
            <strong>{client.pace.label || 'Dados indisponíveis'}</strong>
          </div>
        </div>
        <p className="trafego-muted">
          Indicador {client.primaryIndicator || 'Dados indisponíveis'} · Atualização {formatOperationalUpdatedAt(client.lastUpdate)} · Próxima ação{' '}
          {client.nextAction?.title || 'Nenhuma'}
        </p>
        {client.exceptions.length ? (
          <ul style={{ margin: '8px 0 0', paddingLeft: '1.1rem', color: '#991b1b', fontSize: 13 }}>
            {client.exceptions.map((e) => (
              <li key={e.code}>{e.problem}</li>
            ))}
          </ul>
        ) : null}
        {confirmed ? (
          <p className="trafego-muted" style={{ marginTop: 12 }}>
            {checkupOutcomeLabel(client.checkup.result)} · {client.checkup.actorName || 'gestor'}
            {client.checkup.problem ? ` · ${client.checkup.problem}` : ''}
          </p>
        ) : (
          <div className="trafego-form">
            <select value={result} onChange={(e) => setResult(e.target.value)}>
              <option value="">Resultado do check-up</option>
              {CHECKUP_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <textarea rows={2} placeholder="Observação" value={note} onChange={(e) => setNote(e.target.value)} />
            {result === 'needs_attention' ? (
              <>
                <textarea rows={2} placeholder="Problema. O responsável é o gestor da conta." value={problem} onChange={(e) => setProblem(e.target.value)} />
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </>
            ) : null}
          </div>
        )}
      </div>
      <div className={sticky ? 'trafego-sheet-foot' : 'trafego-conference-foot'}>
        {client.nextAction?.task_id ? (
          <ActionLink
            onClick={() =>
              ops?.openComplete?.({
                clientId: client.clientId,
                taskId: client.nextAction.task_id,
                taskTitle: client.nextAction.title,
                code: 'next_action_overdue',
              })
            }
          >
            Concluir demanda
          </ActionLink>
        ) : (
          <ActionLink onClick={() => ops?.openDemand?.(client.clientId, { demandType: 'ajuste' })}>Criar demanda</ActionLink>
        )}
        {!confirmed ? (
          <button type="button" className="trafego-btn" onClick={submit} disabled={!result}>
            Confirmar
          </button>
        ) : null}
        <ActionLink onClick={() => ops?.openConta?.(client.clientId)}>Ajustar conta</ActionLink>
      </div>
    </>
  );
}

export default function TrafegoCheckupDiario({ model, onConfirm, basePath, ops }) {
  const compact = useIsCompact();
  const list = useMemo(
    () => [...(model.checkup.expanded || []), ...(model.checkup.compactOk || [])],
    [model.checkup.expanded, model.checkup.compactOk]
  );
  const [selectedId, setSelectedId] = useState(list[0]?.clientId || null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const selected = list.find((c) => c.clientId === selectedId) || list[0];
  const summary = model.checkup.summary;

  useEffect(() => {
    if (!list.some((c) => c.clientId === selectedId)) {
      setSelectedId(list[0]?.clientId || null);
    }
  }, [list, selectedId]);

  if (!summary.total) {
    return <EmptyState title="Nenhum cliente no check-up de hoje">Fora do dia configurado não entra nesta rotina.</EmptyState>;
  }

  const openClient = (id) => {
    setSelectedId(id);
    if (compact) setSheetOpen(true);
  };

  const listEl = (
    <div className="trafego-list">
      {list.map((client) => (
        <button
          key={client.clientId}
          type="button"
          className={client.clientId === selectedId && !compact ? 'is-on' : ''}
          onClick={() => openClient(client.clientId)}
        >
          <SeverityIcon health={client.health} />
          <div>
            <p>{client.empresa}</p>
            <small>
              {client.checkup.result ? checkupOutcomeLabel(client.checkup.result) : 'Não revisado'} · {client.gestorName || 'Sem gestor'}
            </small>
          </div>
          <HealthBadge health={client.health} />
        </button>
      ))}
    </div>
  );

  if (compact) {
    return (
      <div>
        <p className="trafego-muted" style={{ margin: '0 0 8px' }}>
          {summary.reviewed}/{summary.total} revisados · toque para conferir uma conta
        </p>
        {listEl}
        {sheetOpen && selected ? (
          <div className="trafego-sheet">
            <div className="trafego-sheet-head">
              <strong>{selected.empresa}</strong>
              <button type="button" className="trafego-btn-ghost" onClick={() => setSheetOpen(false)}>
                Fechar
              </button>
            </div>
            <CheckupForm key={selected.clientId} client={selected} onConfirm={onConfirm} ops={ops} sticky />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="trafego-split">
      {listEl}
      <section className="trafego-conference">
        {selected ? (
            <CheckupForm key={selected.clientId} client={selected} onConfirm={onConfirm} ops={ops} />
        ) : (
          <EmptyState title="Selecione um cliente">A conferência abre à direita, uma conta por vez.</EmptyState>
        )}
        {selected ? (
          <div style={{ padding: '0 16px 12px' }}>
            <ActionLink to={clientHref(basePath, selected.clientId)}>Abrir ficha</ActionLink>
          </div>
        ) : null}
      </section>
    </div>
  );
}
