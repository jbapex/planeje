import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTrafegoOperacao } from '@/hooks/useTrafegoOperacao';
import TrafegoShell from '@/components/traffic/operacao/TrafegoShell';
import TrafegoVisaoGeral, { TrafegoCentralOperacoes, TrafegoAlertas } from '@/components/traffic/operacao/TrafegoVisaoGeral';
import TrafegoCheckupDiario from '@/components/traffic/operacao/TrafegoCheckupDiario';
import {
  TrafegoClientes,
  TrafegoClienteFicha,
  TrafegoTarefasBoard,
  TrafegoCriativos,
  TrafegoRelatorios,
} from '@/components/traffic/operacao/TrafegoClientes';
import { EmptyState } from '@/components/traffic/operacao/TrafegoOperacaoBits';
import CentralTrafegoDemandaForm from '@/components/traffic/CentralTrafegoDemandaForm';
import CentralTrafegoConcluirDialog from '@/components/traffic/CentralTrafegoConcluirDialog';
import CentralTrafegoCheckupSettingsDialog from '@/components/traffic/CentralTrafegoCheckupSettingsDialog';
import TrafegoContaDialog from '@/components/traffic/operacao/TrafegoContaFields';
import { checkupSettingsClient, demandClientOptions } from '@/lib/trafegoAcoes';
import '@/components/traffic/TrafegoOperacao.css';

function resolveTask(row, model) {
  if (!row?.taskId) return null;
  const found = (model.clients || [])
    .flatMap((c) => c.tasks || [])
    .find((t) => t.id === row.taskId);
  if (found) return found;
  return {
    id: row.taskId,
    title: row.taskTitle,
    demand_type: 'ajuste',
    client_id: row.clientId,
    clientId: row.clientId,
  };
}

export default function TrafegoOperacaoApp({
  tab,
  basePath,
  preview = false,
  clientId = null,
  previewLoader = null,
}) {
  const { model, loading, error, confirmCheckup, saveClientOps, saveBudget, reload, team, campaigns } = useTrafegoOperacao({
    preview,
    previewLoader,
  });
  const [demand, setDemand] = useState({ open: false, clientId: null, demandType: 'ajuste', title: '' });
  const [completeRow, setCompleteRow] = useState(null);
  const [conta, setConta] = useState({ clientId: null, focus: null });
  const [settingsId, setSettingsId] = useState(null);

  const ops = useMemo(
    () => ({
      basePath,
      team,
      saveClientOps,
      saveBudget,
      openDemand: (id, opts = {}) =>
        setDemand({
          open: true,
          clientId: id || null,
          demandType: opts.demandType || 'ajuste',
          title: opts.title || '',
        }),
      openComplete: (row) => setCompleteRow(row),
      openConta: (id, focus) => setConta({ clientId: id, focus: focus || null }),
      openSettings: (id) => setSettingsId(id),
      onPause: async (row) => {
        const client = model.clients.find((c) => c.clientId === row.clientId);
        if (!client) return;
        await confirmCheckup(client, { result: 'planned_pause', note: 'Pausa confirmada pela Central', problem: '', due: '' });
      },
    }),
    [basePath, team, saveClientOps, saveBudget, model.clients, confirmCheckup]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando a operação de tráfego…
      </div>
    );
  }

  if (error) {
    return <p className="central-trafego-error">{error}</p>;
  }

  const onConfirm = async (client, payload) => {
    const result = await confirmCheckup(client, payload);
    if (!result.ok && result.error) {
      window.alert(result.error);
    }
  };

  let body = <EmptyState title="Tela indisponível">Esta seção ainda não está neste recorte.</EmptyState>;
  if (tab === 'visao') body = <TrafegoVisaoGeral model={model} basePath={basePath} ops={ops} />;
  else if (tab === 'operacoes') body = <TrafegoCentralOperacoes model={model} basePath={basePath} ops={ops} />;
  else if (tab === 'checkup') body = <TrafegoCheckupDiario model={model} onConfirm={onConfirm} basePath={basePath} ops={ops} />;
  else if (tab === 'clientes' && clientId) {
    const client = model.clients.find((c) => c.clientId === clientId);
    body = <TrafegoClienteFicha client={client} basePath={basePath} ops={ops} />;
  } else if (tab === 'clientes') body = <TrafegoClientes model={model} basePath={basePath} />;
  else if (tab === 'tarefas') body = <TrafegoTarefasBoard model={model} ops={ops} />;
  else if (tab === 'alertas') body = <TrafegoAlertas model={model} ops={ops} />;
  else if (tab === 'criativos') body = <TrafegoCriativos model={model} />;
  else if (tab === 'relatorios') body = <TrafegoRelatorios model={model} />;

  const contaClient = model.clients.find((c) => c.clientId === conta.clientId) || null;
  const settingsClient = model.clients.find((c) => c.clientId === settingsId) || null;
  const completeTask = resolveTask(completeRow, model);

  const primaryAction =
    tab === 'visao' || tab === 'checkup' || tab === 'operacoes' ? (
      <Link className="trafego-btn" to={`${basePath}/checkup`}>
        Continuar check-up
      </Link>
    ) : null;

  return (
    <TrafegoShell tab={tab === 'clientes' ? 'clientes' : tab} basePath={basePath} overview={model.overview} primaryAction={primaryAction}>
      {body}
      <CentralTrafegoDemandaForm
        open={demand.open}
        onOpenChange={(open) => setDemand((prev) => ({ ...prev, open }))}
        clients={demandClientOptions(model.clients)}
        campaigns={campaigns}
        team={team}
        presetClientId={demand.clientId}
        presetDemandType={demand.demandType}
        presetTitle={demand.title}
        onSaved={reload}
      />
      <CentralTrafegoConcluirDialog
        open={Boolean(completeTask)}
        onOpenChange={(v) => !v && setCompleteRow(null)}
        task={completeTask}
        campaigns={
          completeTask?.client_id || completeTask?.clientId
            ? campaigns.filter((c) => c.client_id === (completeTask.client_id || completeTask.clientId))
            : campaigns
        }
        team={team}
        onSaved={() => {
          setCompleteRow(null);
          reload();
        }}
      />
      <TrafegoContaDialog
        open={Boolean(contaClient)}
        onOpenChange={(v) => !v && setConta({ clientId: null, focus: null })}
        client={contaClient}
        team={team}
        onSaveOps={saveClientOps}
        onSaveBudget={saveBudget}
        focus={conta.focus}
      />
      <CentralTrafegoCheckupSettingsDialog
        open={Boolean(settingsClient)}
        onOpenChange={(v) => !v && setSettingsId(null)}
        client={checkupSettingsClient(settingsClient)}
        team={team}
        onSaved={reload}
      />
    </TrafegoShell>
  );
}
