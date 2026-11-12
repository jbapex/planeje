import React, { useEffect, useRef, useState } from 'react';
import GestorIaDrawer from '@/components/gestor-ia/GestorIaDrawer';
import { useGestorRead } from '@/components/gestor-ia/gestorIaReads';
import { supabase } from '@/lib/customSupabaseClient';
import { invokeEdgeFunction } from '@/lib/supabaseFunctions';
import { whatsappGroupChannelLabel } from '@/lib/clienteWhatsappGrupo';
import { loadCsGroupRegistrationChannels, normalizeCsGroupId, registerCsGroup } from '@/lib/csIaGroupInventory';

const channelReadKey = 'canais-cadastro-grupo';
const readChannels = () => loadCsGroupRegistrationChannels(supabase);

function RegistrationDrawer({ store, onClose, onSaved }) {
  const [channelId, setChannel] = useState('');
  const [groupId, setGroupId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const channelRead = useGestorRead(store, channelReadKey, true, readChannels);
  useEffect(() => { void store.run(channelReadKey, readChannels, true); }, [store]);
  const loading = channelRead.refreshing || (!channelRead.error && !channelRead.data);
  const channels = loading || channelRead.error ? [] : channelRead.data;
  const selected = channels.some(({ id }) => id === channelId);
  const validGroup = normalizeCsGroupId(groupId);

  async function save(event) {
    event.preventDefault();
    if (busy || !selected || !validGroup || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await registerCsGroup(supabase, invokeEdgeFunction, { channelId, groupId, name });
      onSaved(result);
      onClose();
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  return <GestorIaDrawer label="CS IA · Grupos" title="Registrar grupo" close={onClose} busy={busy}>
    <form className="gia-stack" onSubmit={save}>
      <p>Escolha o canal que participa do grupo. O Planeje confere o ID no WhatsApp antes de registrar a conversa.</p>
      {loading && <p role="status">Carregando canais autorizados…</p>}
      {channelRead.error && <p role="alert">Não foi possível consultar os canais autorizados.</p>}
      {!loading && !channelRead.error && !channels.length && <p className="gia-empty">Nenhum canal do WhatsApp está disponível para esta sessão.</p>}
      <label className="cs-filter"><span>Canal do WhatsApp</span>
        <select value={selected ? channelId : ''} onChange={(event) => setChannel(event.target.value)} disabled={busy || !channels.length} required>
          <option value="">Escolha o canal</option>
          {channels.map((channel) => <option key={channel.id} value={channel.id}>
            {whatsappGroupChannelLabel({ channel_name: channel.channel_name, whatsapp_config_id: channel.id })}
          </option>)}
        </select>
      </label>
      <label className="cs-filter"><span>ID do grupo no WhatsApp</span>
        <input value={groupId} onChange={(event) => setGroupId(event.target.value)} maxLength={202}
          placeholder="120363000000000000@g.us" autoCapitalize="none" spellCheck={false} disabled={busy} required />
      </label>
      {groupId && !validGroup && <p className="gia-caption">Informe o ID completo do grupo, com final @g.us.</p>}
      <label className="cs-filter"><span>Nome do grupo no CS</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} disabled={busy} required />
      </label>
      {error && <p className="gia-notice" role="alert">{error}</p>}
      <div className="cs-actions">
        <button type="button" className="gia-action-link" onClick={onClose} disabled={busy}>Cancelar</button>
        {(channelRead.error || error) && <button type="button" className="gia-action-link" onClick={() => channelRead.reload()}
          disabled={busy || loading}>Atualizar canais</button>}
        <button type="submit" className="gia-action-link gia-primary-action" disabled={busy || !selected || !validGroup || !name.trim()}>
          {busy ? 'Confirmando grupo…' : 'Registrar grupo'}
        </button>
      </div>
    </form>
  </GestorIaDrawer>;
}

export default function CsIaGroupRegistration({ store, onSaved }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  return <>
    <button ref={trigger} type="button" className="gia-action-link gia-primary-action" aria-haspopup="dialog"
      onClick={() => setOpen(true)}>Registrar grupo</button>
    {open && <RegistrationDrawer store={store} onSaved={onSaved} onClose={() => {
      setOpen(false);
      requestAnimationFrame(() => trigger.current?.focus());
    }} />}
  </>;
}
