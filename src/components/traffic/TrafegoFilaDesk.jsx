import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTrafegoFila } from '@/hooks/useTrafegoFila';
import TrafegoDiarioDialog from '@/components/traffic/TrafegoDiarioDialog';
import TrafegoVincularGrupoDialog from '@/components/traffic/TrafegoVincularGrupoDialog';
import { buildGrupoConversasUrl } from '@/lib/clienteWhatsappGrupo';
import { formatMoney, lastDiaryPreview, visitLabel } from '@/lib/trafegoFila';
import './TrafegoFila.css';

function metricsLoadingText(row) {
  if (row.metrics === null) return 'Sem número da Meta nesta conta';
  if (row.metrics === undefined) return 'Carregando gasto…';
  return 'Sem gasto no mês';
}

function ClientRow({ row, index, onDiary, onLinkGroup }) {
  const c = row.client;
  const lastNote = lastDiaryPreview(row.diary);
  const grupoUrl = buildGrupoConversasUrl(row.grupo);
  return (
    <div className="trafego-fila-card">
      <div className="trafego-fila-card-top">
        <span className="trafego-fila-num">{index}</span>
        <div className="min-w-0 flex-1">
          <p className="trafego-fila-card-name">{c.empresa}</p>
          <p className="trafego-fila-card-why">{row.why}</p>
          <p className="trafego-fila-card-meta">
            {row.metrics ? `${formatMoney(row.metrics.spend)} gastos no mês` : metricsLoadingText(row)}
            {c.limite_meta ? ` · limite ${formatMoney(c.limite_meta)}` : ''}
            {' · '}
            {visitLabel(row.days)}
          </p>
          {lastNote ? <p className="trafego-fila-card-meta trafego-fila-card-note">Último registro: {lastNote}</p> : null}
        </div>
      </div>
      <div className="trafego-fila-actions">
        <Button size="sm" onClick={() => onDiary(row)}>
          Registrar visita
        </Button>
        {grupoUrl ? (
          <Button size="sm" variant="outline" asChild>
            <Link to={grupoUrl}>
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              Abrir grupo
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onLinkGroup(row)}>
            Vincular grupo
          </Button>
        )}
      </div>
    </div>
  );
}

export default function TrafegoFilaDesk() {
  const { loading, refreshing, error, metricsLoading, hoje, resto, semGrupoRows, ownerStats, reload } =
    useTrafegoFila();
  const [diaryRow, setDiaryRow] = useState(null);
  const [groupRow, setGroupRow] = useState(null);
  const [showResto, setShowResto] = useState(false);
  const todayLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[280px] gap-2 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Carregando clientes de tráfego…</p>
      </div>
    );
  }

  return (
    <div className="trafego-fila">
      <section className="trafego-fila-hero">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h1>Trabalho de hoje</h1>
            <p>
              {todayLabel}. Esta tela não é o Ads Manager. Aqui você só vê quem olhar e registra que olhou.
              {metricsLoading ? ' Atualizando números…' : ''}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={reload} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Atualizar
          </Button>
        </div>
        <ol className="trafego-fila-steps">
          <li>
            <strong>Abra o grupo</strong>
            <span>só se precisar do contexto do cliente</span>
          </li>
          <li>
            <strong>Mexa na Meta</strong>
            <span>no Ads Manager, como você já faz</span>
          </li>
          <li>
            <strong>Volte e registre</strong>
            <span>uma linha do que fez. Sem isso, a visita não conta</span>
          </li>
        </ol>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <p className="trafego-fila-status">
        {hoje.length === 0
          ? `Ninguém pendente nesta lista. ${ownerStats.today} de ${ownerStats.total} contas já têm visita registrada hoje.`
          : `${hoje.length} conta${hoje.length === 1 ? '' : 's'} para olhar agora. ${ownerStats.today} de ${ownerStats.total} já registradas hoje.`}
      </p>

      <section className="trafego-fila-col">
        <header className="trafego-fila-col-head">
          <div>
            <h2>Olhe estes, um por um</h2>
            <p>Termine um cliente (Meta + registrar) antes de ir para o próximo.</p>
          </div>
        </header>
        <div className="trafego-fila-col-body">
          {hoje.length === 0 ? (
            <p className="trafego-fila-empty">Lista de hoje vazia. O restante da carteira pode esperar.</p>
          ) : (
            hoje.map((row, i) => (
              <ClientRow
                key={row.client.id}
                row={row}
                index={i + 1}
                onDiary={setDiaryRow}
                onLinkGroup={setGroupRow}
              />
            ))
          )}
        </div>
      </section>

      {semGrupoRows.length > 0 ? (
        <section className="trafego-fila-col">
          <header className="trafego-fila-col-head">
            <div>
              <h2>Só uma vez: vincular o WhatsApp</h2>
              <p>
                {semGrupoRows.length} cliente{semGrupoRows.length === 1 ? '' : 's'} ainda sem grupo. Isso não é o
                trabalho do dia — é para o botão “Abrir grupo” funcionar.
              </p>
            </div>
          </header>
          <div className="trafego-fila-vincular">
            {semGrupoRows.map((row) => (
              <div key={row.client.id} className="trafego-fila-vincular-row">
                <span>{row.client.empresa}</span>
                <Button size="sm" variant="outline" onClick={() => setGroupRow(row)}>
                  Escolher grupo
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {resto.length > 0 && (
        <section>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowResto((v) => !v)}>
            {showResto ? 'Esconder' : 'Ver'} contas que podem esperar ({resto.length})
          </Button>
          {showResto ? (
            <div className="trafego-fila-col-body mt-2">
              {resto.map((row, i) => (
                <ClientRow
                  key={row.client.id}
                  row={row}
                  index={i + 1}
                  onDiary={setDiaryRow}
                  onLinkGroup={setGroupRow}
                />
              ))}
            </div>
          ) : null}
        </section>
      )}

      <TrafegoDiarioDialog
        row={diaryRow}
        open={Boolean(diaryRow)}
        onOpenChange={(v) => {
          if (!v) setDiaryRow(null);
        }}
        onSaved={reload}
      />
      <TrafegoVincularGrupoDialog
        row={groupRow}
        open={Boolean(groupRow)}
        onOpenChange={(v) => {
          if (!v) setGroupRow(null);
        }}
        onSaved={reload}
      />
    </div>
  );
}
