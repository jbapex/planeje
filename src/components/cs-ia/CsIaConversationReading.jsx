import React, { useState } from 'react';
import { dateTime, conversationSignals, READING_TONE, SIGNAL } from './csIaPresentation';

const statusText = {
  disabled: 'Leitura desativada.', waiting: 'Aguardando leitura. O Atlas usa janelas com pelo menos uma hora sem atividade.',
  processing: 'Leitura em andamento.', completed: 'Leitura concluída para a última janela disponível.',
  failed: 'A leitura desta janela falhou.', unavailable: 'A leitura está indisponível para este vínculo.',
  channel_paused: 'Acompanhamento pausado em Configurações → Conexões.',
  global_paused: 'Leitura pausada em Configurações → Leitura das conversas.',
  no_text: 'Nenhum texto elegível nesta janela.', budget_wait: 'Aguardando disponibilidade no teto de análises do Atlas.',
};

export default function CsIaConversationReading({ reading, linked, loading, error, onReload, onSave }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const enabled = draft?.enabled ?? (reading?.enabled === true || reading?.can_pause === true);
  const includeAudio = draft?.include_audio ?? (reading?.include_audio === true);
  const transcribe = draft?.transcribe_new_audio ?? (reading?.transcribe_new_audio === true);
  const canConfigure = reading?.can_configure === true;
  const paused = reading?.status === 'channel_paused';
  const signals = reading?.status === 'completed' ? conversationSignals(reading) : [];

  function change(nextEnabled, nextAudio, nextTranscribe = transcribe) {
    setDraft({ enabled: nextEnabled, include_audio: nextEnabled && nextAudio,
      transcribe_new_audio: nextEnabled && nextAudio && nextTranscribe, conversation_id: reading.conversation_id });
    setFeedback(null);
  }

  async function save(event) {
    event.preventDefault();
    if (!draft || !canConfigure || busy || paused && draft.enabled) return;
    setFeedback(null);
    setBusy(true);
    try {
      await onSave(draft);
      setDraft(null);
      setFeedback({ text: 'Opções de leitura salvas.' });
    } catch (failure) {
      setFeedback({ text: failure.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return <section className="gia-panel gia-stack" aria-label="Leitura das conversas por IA">
    <div className="gia-section-heading"><h2>Leitura das conversas por IA</h2>
      <button className="gia-action-link" type="button" onClick={onReload} disabled={loading || busy}>Atualizar leitura</button></div>
    {loading && <p role="status">Consultando a leitura…</p>}
    {error && <p role="alert" className="gia-notice">{error}</p>}
    {!loading && !error && <p>{statusText[reading?.status] || statusText.unavailable}</p>}
    {!loading && !error && reading?.transcription_paused && <p className="gia-caption">Transcrição de áudios pausada em Configurações → Leitura das conversas.</p>}
    {reading?.status === 'completed' && <div className="gia-stack">
      <dl className="cs-facts">
        <div><dt>Tom observado</dt><dd>{READING_TONE[reading.tone] || READING_TONE.unknown}</dd></div>
        <div><dt>Janela até</dt><dd>{dateTime(reading.source_at)}</dd></div>
        <div><dt>Mensagens consideradas</dt><dd>{reading.message_count}</dd></div>
      </dl>
      {signals.length > 0 && <ul className="cs-summary">{signals.map((signal) => <li key={signal}>{SIGNAL[signal]}</li>)}</ul>}
      {!signals.length && <p className="gia-caption">Nenhum sinal nesta janela.</p>}
      {signals.includes('retorno_cliente') && <p className="gia-caption">A leitura identificou na última mensagem um pedido da equipe que aguarda retorno do cliente no grupo.</p>}
      {reading.audio_missing > 0 && <p className="gia-caption">Cobertura parcial. {reading.audio_missing} áudio(s) sem texto disponível na janela.</p>}
      <p className="gia-caption">Confira a conversa antes de agir sobre os sinais.</p>
    </div>}
    {canConfigure && <form className="gia-stack" onSubmit={save}>
      {!paused && <p className="gia-caption">Ao ativar, o provedor do Atlas processa uma janela de mensagens novas deste grupo após uma hora sem atividade. A leitura usa o teto diário do Atlas.</p>}
      <label className="cs-checkbox"><input type="checkbox" checked={enabled} disabled={busy || (!linked || paused) && !enabled}
        onChange={(event) => change(event.target.checked, includeAudio)} />Ler automaticamente as novas conversas deste grupo</label>
      {!paused && <><label className="cs-checkbox"><input type="checkbox" checked={includeAudio} disabled={!linked || !enabled || busy}
        onChange={(event) => change(enabled, event.target.checked)} />Incluir transcrições disponíveis no Atlas</label>
      <label className="cs-checkbox"><input type="checkbox" checked={transcribe} disabled={!linked || !enabled || !includeAudio || busy}
        aria-describedby="cs-audio-consent-note" onChange={(event) => change(enabled, includeAudio, event.target.checked)} />Transcrever novos áudios deste grupo</label>
      <p id="cs-audio-consent-note" className="gia-caption">O provedor do Atlas recebe o áudio e o Atlas guarda a transcrição. Pode gerar custo. O CS reserva até cinco áudios por dia, somando os grupos autorizados, no horário de Brasília. Só entram áudios novos recebidos após a autorização.</p></>}
      <div className="cs-actions">
        {draft && <button type="button" className="gia-action-link" onClick={() => { setDraft(null); setFeedback(null); }} disabled={busy}>Descartar alterações</button>}
        <button type="submit" className="gia-action-link gia-primary-action" disabled={!draft || busy || (!linked || paused) && enabled}>{busy ? 'Salvando…' : 'Salvar opções de leitura'}</button>
      </div>
    </form>}
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'gia-notice' : 'cs-success'}>{feedback.text}</p>}
  </section>;
}
