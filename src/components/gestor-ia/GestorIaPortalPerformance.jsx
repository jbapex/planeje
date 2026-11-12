import React, { useEffect, useId, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { PortalPerformanceSummary } from '@/components/client/ClientPortalPerformance';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/customSupabaseClient';
import { loadPortalPerformance, loadPortalPerformanceSetting, PORTAL_PERFORMANCE_OBJECTIVES, savePortalPerformanceSetting } from '@/lib/gestorIaPortalPerformance';
import GestorIaDrawer from './GestorIaDrawer';

function ShareNumbersForm({ client, initial, save, close, reload }) {
  const toggleId = useId();
  const [shared, setShared] = useState(true);
  const suggested = Object.hasOwn(PORTAL_PERFORMANCE_OBJECTIVES, client.objetivo_meta) ? client.objetivo_meta : '';
  const [objective, setObjective] = useState(initial.objective || suggested);
  const [preview, setPreview] = useState(null);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const unchanged = shared === initial.shared && (objective || null) === initial.objective;

  async function view() {
    setPending('preview');
    setPreview(null);
    setError('');
    try { setPreview(await loadPortalPerformance(supabase, client.id, objective)); }
    catch (failure) { setError(failure.message); }
    finally { setPending(''); }
  }

  async function submit(event) {
    event.preventDefault();
    if (pending || unchanged || uncertain || shared && !objective) return;
    setPending('save');
    setError('');
    try { save(await savePortalPerformanceSetting(supabase, client.id, shared, objective || null, initial.revision)); }
    catch (failure) { setError(failure.message); setUncertain(true); }
    finally { setPending(''); }
  }

  return <GestorIaDrawer label="Janela do cliente" title="Números no portal" close={close} busy={Boolean(pending)}>
    <form className="gia-stack gia-model-binding" onSubmit={submit}>
      <p>{client.empresa}</p>
      <div className="gia-media-flag">
        <label htmlFor={toggleId}>Compartilhar números</label>
        <Switch id={toggleId} checked={shared} disabled={Boolean(pending)} onCheckedChange={setShared} />
      </div>
      {shared && <>
        <label className="gia-media-label">Indicador de resultado<select value={objective} disabled={Boolean(pending)} onChange={(e) => { setObjective(e.target.value); setPreview(null); setError(''); }}>
          <option value="">Escolha um indicador</option>
          {Object.entries(PORTAL_PERFORMANCE_OBJECTIVES).map(([key, spec]) => <option key={key} value={key}>{spec.volume}</option>)}
        </select></label>
        <p className="gia-caption">Os logins com acesso ao Dashboard veem investimento, resultado, custo e evolução semanal das leituras salvas.</p>
        <div><button className="gia-action-link" type="button" disabled={!objective || Boolean(pending)} onClick={view}>{pending === 'preview' ? 'Consultando…' : 'Ver prévia dos números'}</button></div>
        {preview && <div className="rounded-lg border p-3"><PortalPerformanceSummary result={preview} /></div>}
      </>}
      {error && <p className="gia-notice" role="alert">{error}</p>}
      <div className="gia-header-actions">
        <button className="gia-action-link" type="button" onClick={close} disabled={Boolean(pending)}>Cancelar</button>
        {uncertain ? <button className="gia-action-link" type="button" onClick={reload}>Atualizar configuração</button>
          : <button className="gia-action-link gia-primary-action" type="submit" disabled={Boolean(pending) || unchanged || shared && !objective}>
            {pending === 'save' ? 'Salvando…' : 'Salvar visibilidade'}
          </button>}
      </div>
    </form>
  </GestorIaDrawer>;
}

export default function GestorIaPortalPerformance({ client }) {
  const [reading, setReading] = useState(null);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    loadPortalPerformanceSetting(supabase, client.id).then((state) => { if (active) setReading(state); })
      .catch(() => { if (active) setReading({ error: true }); });
    return () => { active = false; };
  }, [client.id, revision]);
  const reload = () => { setOpen(false); setReading(null); setRevision((value) => value + 1); };
  if (!reading) return <p className="gia-caption" role="status">Consultando a Janela do cliente…</p>;
  if (reading.error) return <div className="gia-header-actions"><p role="alert" className="gia-caption">Visibilidade dos números indisponível.</p>
    <button className="gia-action-link" type="button" onClick={reload}>Tentar novamente</button></div>;
  return <div className="gia-section-heading mt-3 border-t border-[var(--gia-line)] pt-3">
    <div><h3>Números de desempenho</h3><p className="gia-caption" role="status">{reading.shared ? `Visíveis no Dashboard · ${PORTAL_PERFORMANCE_OBJECTIVES[reading.objective].volume}` : 'Internos'}</p></div>
    <button className="gia-action-link" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}><BarChart3 aria-hidden="true" />{reading.shared ? 'Editar visibilidade' : 'Compartilhar números'}</button>
    {open && <ShareNumbersForm client={client} initial={reading} close={() => setOpen(false)} reload={reload}
      save={(state) => { setReading(state); setOpen(false); }} />}
  </div>;
}
