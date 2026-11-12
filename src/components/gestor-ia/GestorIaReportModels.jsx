import React, { useId, useState } from 'react';
import { FileText, Plus, Settings2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_REPORT_MODEL, GESTOR_REPORT_WINDOWS, loadClientReportModel, loadReportModels, saveClientReportModel, saveReportModel } from '@/lib/gestorIaReportModels';
import { REPORT_METRICS } from '@/lib/trafficPerformanceReport';
import GestorIaDrawer from './GestorIaDrawer';
import { useGestorRead } from './gestorIaReads';

const modelOptions = [
  ['compare_previous', 'Comparar com o período anterior'],
  ['include_creatives', 'Incluir criativos'],
  ['include_routine', 'Usar a rotina semanal no rascunho do Atlas'],
];

function useModels(store, enabled) {
  return useGestorRead(store, 'relatorio-modelos', enabled, () => loadReportModels(supabase));
}

export function useClientReportModel(store, clientId, enabled) {
  const models = useModels(store, enabled);
  const binding = useGestorRead(store, JSON.stringify(['modelo-relatorio', clientId]), enabled, () => loadClientReportModel(supabase, clientId));
  const model = models.data?.find(({ id }) => id === binding.data?.model_id);
  return { models, binding, model, pending: enabled && (!(models.data || models.error) || !(binding.data || binding.error)) };
}

function ModelForm({ model, close, reload }) {
  const formId = useId();
  const [draft, setDraft] = useState(model);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const set = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (busy || failure?.conflict) return;
    setBusy(true);
    setFailure(null);
    try {
      await saveReportModel(supabase, draft);
      await reload();
      close();
    } catch (error) {
      setFailure(error);
      if (error.conflict) void reload();
    } finally {
      setBusy(false);
    }
  };
  return <GestorIaDrawer label="Modelos de relatório" title={model.id ? 'Editar modelo' : 'Novo modelo'} close={close} busy={busy}>
    <form className="gia-media-form" onSubmit={submit}>
      <div className="gia-media-fields">
        <fieldset disabled={busy}>
          <legend className="sr-only">Identificação do modelo</legend>
          <label className="gia-media-label">Nome<input required maxLength={80} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex. Tráfego semanal" /></label>
          <label className="gia-media-label">Janela de dados<select value={draft.window_key} onChange={(e) => set('window_key', e.target.value)}>
            {Object.entries(GESTOR_REPORT_WINDOWS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select></label>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Indicadores</legend>
          <div className="gia-media-objectives">
            {REPORT_METRICS.map(({ key, label }) => <button className="gia-action-link" type="button" key={key} aria-pressed={draft.metrics.includes(key)}
              onClick={() => set('metrics', draft.metrics.includes(key) ? draft.metrics.filter((metric) => metric !== key) : [...draft.metrics, key])}>{label}</button>)}
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Conteúdo</legend>
          {modelOptions.map(([key, label]) => <div className="gia-media-flag" key={key}>
            <label htmlFor={`${formId}-${key}`}>{label}</label>
            <Switch id={`${formId}-${key}`} checked={draft[key]} disabled={busy} onCheckedChange={(value) => set(key, value)} />
          </div>)}
          <label className="gia-media-label">Tom do resumo do Atlas<textarea rows={3} maxLength={240} value={draft.tone}
            onChange={(e) => set('tone', e.target.value)} placeholder="Ex. Direto, em linguagem simples" /></label>
        </fieldset>
        {failure && <p className="gia-notice" role="alert">{failure.message}</p>}
      </div>
      <div className="gia-media-save"><div className="gia-goal-actions">
        <button className="gia-action-link" type="button" onClick={close} disabled={busy}>Cancelar</button>
        <button className="gia-action-link gia-primary-action" type="submit" disabled={busy || failure?.conflict || !draft.name.trim() || !draft.metrics.length}>{busy ? 'Salvando…' : 'Salvar modelo'}</button>
      </div></div>
    </form>
  </GestorIaDrawer>;
}

export function ClientReportModel({ client, model, models, binding }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const close = () => setDraft(null);
  const submit = async (event) => {
    event.preventDefault();
    if (busy || failure?.conflict) return;
    setBusy(true);
    setFailure(null);
    try {
      await saveClientReportModel(supabase, client.id, draft.id || null, draft.revision);
      await binding.reload();
      close();
    } catch (error) {
      setFailure(error);
      if (error.conflict) void binding.reload();
    } finally {
      setBusy(false);
    }
  };
  return <>
    <button className="gia-action-link" type="button" aria-haspopup="dialog" onClick={() => {
      setFailure(null);
      setDraft({ id: binding.data?.model_id || '', revision: binding.data?.revision });
    }}><Settings2 aria-hidden="true" />{model ? `Modelo · ${model.name}` : 'Modelo do cliente'}</button>
    {draft && <GestorIaDrawer label="Relatório" title="Modelo do cliente" close={close} busy={busy}>
      <form className="gia-stack gia-model-binding" onSubmit={submit}>
        <p>{client.empresa}</p>
        {models.error || binding.error ? <>
          <p role="alert">{(models.error || binding.error).message}</p>
          <button className="gia-action-link" type="button" onClick={() => { void models.reload(); void binding.reload(); close(); }}>Tentar novamente</button>
        </> : <>
          <label className="gia-media-label">Modelo padrão<select value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} disabled={busy}>
            <option value="">Sem modelo</option>
            {models.data.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
          </select></label>
          {!models.data.length && <p className="gia-caption">Crie um modelo em Relatórios → Modelos.</p>}
          {failure && <p className="gia-notice" role="alert">{failure.message}</p>}
          <div className="gia-header-actions">
            <button className="gia-action-link" type="button" onClick={close} disabled={busy}>Cancelar</button>
            <button className="gia-action-link gia-primary-action" type="submit" disabled={busy || failure?.conflict || (draft.id || null) === binding.data.model_id}>{busy ? 'Salvando…' : 'Salvar padrão'}</button>
          </div>
        </>}
      </form>
    </GestorIaDrawer>}
  </>;
}

export default function GestorIaReportModels({ readStore }) {
  const models = useModels(readStore, true);
  const [open, setOpen] = useState(null);
  return <section className="gia-panel gia-stack gia-report-models">
    <div className="gia-section-heading"><div className="gia-inline-icon"><FileText aria-hidden="true" /><h2>Modelos de relatório</h2></div>
      <button className="gia-action-link gia-primary-action" type="button" aria-haspopup="dialog" disabled={!models.data || Boolean(models.error)}
        onClick={() => setOpen(DEFAULT_REPORT_MODEL)}><Plus aria-hidden="true" />Novo modelo</button>
    </div>
    {models.error ? <div className="gia-section-heading"><p role="alert">{models.error.message}</p>
      <button className="gia-action-link" type="button" onClick={() => models.reload()}>Tentar novamente</button></div>
      : !models.data ? <p role="status" className="gia-empty">Consultando modelos…</p>
        : models.data.length ? <div className="gia-table-wrap gia-table-frame"><table>
          <caption className="sr-only">Modelos de relatório Meta</caption>
          <thead><tr><th scope="col">Nome</th><th scope="col">Janela de dados</th><th scope="col">Indicadores</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{models.data.map((model) => <tr key={model.id}><td><strong>{model.name}</strong></td><td>{GESTOR_REPORT_WINDOWS[model.window_key]}</td>
            <td>{REPORT_METRICS.filter(({ key }) => model.metrics.includes(key)).map(({ label }) => label).join(' · ')}</td>
            <td><button className="gia-action-link" type="button" aria-label={`Editar ${model.name}`} aria-haspopup="dialog" onClick={() => setOpen(model)}>Editar</button></td></tr>)}</tbody>
        </table></div> : <p className="gia-empty">Nenhum modelo criado.</p>}
    {open && <ModelForm model={open} close={() => setOpen(null)} reload={models.reload} />}
  </section>;
}
