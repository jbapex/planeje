import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Plus, Video, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/customSupabaseClient';
import {
  PENDING_REUNIAO_KEY,
  formatFalaClock,
  groupFalas,
  meetUrl,
  parseMeetCode,
  reuniaoStatusLabel,
  speakerNames,
  transcriptText,
} from '@/lib/clienteReunioes';

function formatWhen(value) {
  if (!value) return '';
  try {
    return format(parseISO(value), "d 'de' MMM, HH:mm", { locale: ptBR });
  } catch {
    return '';
  }
}

const SPEAKER_TONES = ['#7c3aed', '#0f766e', '#c2410c', '#1d4ed8', '#be185d', '#4d7c0f', '#b45309', '#0e7490'];

function toneMap(speakers) {
  const map = new Map();
  [...speakers].map((speaker) => speaker.nome).sort().forEach((nome, index) => map.set(nome, SPEAKER_TONES[index % SPEAKER_TONES.length]));
  return map;
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function durationLabel(start, end) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 60000) return '';
  const minutes = Math.round(ms / 60000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

function defaultWhen() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function publishPending(reuniao, clienteId) {
  const payload = {
    id: reuniao.id,
    clienteId,
    titulo: reuniao.titulo,
    at: Date.now(),
  };
  localStorage.setItem(PENDING_REUNIAO_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event('planeje-reuniao-pendente'));
}

function clearPending(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_REUNIAO_KEY) || 'null');
    if (!id || raw?.id === id) {
      localStorage.removeItem(PENDING_REUNIAO_KEY);
      window.dispatchEvent(new Event('planeje-reuniao-pendente'));
    }
  } catch {
    localStorage.removeItem(PENDING_REUNIAO_KEY);
  }
}

export default function ClienteReunioesPanel({ clientId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openForm, setOpenForm] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [quando, setQuando] = useState(defaultWhen);
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [falas, setFalas] = useState([]);
  const [falasLoading, setFalasLoading] = useState(false);
  const [pasteById, setPasteById] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const linesRef = useRef(null);
  const stickRef = useRef(true);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('cliente_reunioes')
      .select('id, titulo, marcada_para, meet_code, status, created_at, iniciada_em, encerrada_em')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })
      .limit(40);
    if (loadError) {
      setError(loadError.message || 'Não foi possível carregar as reuniões.');
      return;
    }
    setError('');
    setRows(data || []);
    (data || []).forEach((row) => {
      if (row.meet_code) clearPending(row.id);
    });
  }, [clientId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const waiting = rows.some((row) => !row.meet_code && Date.now() - new Date(row.created_at).getTime() < 3 * 60 * 60 * 1000);

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [waiting, load]);

  async function loadFalas(reuniaoId, silent) {
    setSelectedId(reuniaoId);
    if (!silent) setFalasLoading(true);
    const { data, error: falasError } = await supabase
      .from('cliente_reuniao_falas')
      .select('id, ordem, nome, texto, inicio_em')
      .eq('reuniao_id', reuniaoId)
      .order('ordem', { ascending: true });
    if (!silent) setFalasLoading(false);
    if (falasError) {
      setError(falasError.message || 'Não foi possível abrir a transcrição.');
      setFalas([]);
      return;
    }
    setFalas(data || []);
  }

  useEffect(() => {
    if (selectedId || !rows.length) return;
    const live = rows.find((row) => row.status === 'em_andamento') || rows[0];
    loadFalas(live.id, true);
  }, [rows, selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const timer = setInterval(() => loadFalas(selectedId, true), 2000);
    return () => clearInterval(timer);
  }, [selectedId]);

  async function createReuniao(mode) {
    const title = titulo.trim();
    const code = parseMeetCode(link);
    if (title.length < 2) {
      setError('Dê um título para a reunião.');
      return;
    }
    if (mode === 'link' && !code) {
      setError('Cole um link do Meet, no formato meet.google.com/abc-defg-hij.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      cliente_id: clientId,
      titulo: title,
      marcada_para: quando ? new Date(quando).toISOString() : null,
      meet_code: mode === 'link' ? code : null,
      status: 'marcada',
    };
    const { data, error: insertError } = await supabase
      .from('cliente_reunioes')
      .insert(payload)
      .select('id, titulo, marcada_para, meet_code, status, created_at, iniciada_em, encerrada_em')
      .single();
    setSaving(false);
    if (insertError) {
      const duplicate = insertError.code === '23505' || /meet_code/i.test(insertError.message || '');
      setError(duplicate ? 'Este link já está em outra reunião.' : (insertError.message || 'Não foi possível criar a reunião.'));
      return;
    }
    setRows((current) => [data, ...current]);
    setTitulo('');
    setLink('');
    setOpenForm(false);
    if (mode === 'sala') {
      publishPending(data, clientId);
      window.open('https://meet.google.com/new', '_blank', 'noopener');
    }
  }

  async function attachLink(reuniaoId) {
    const code = parseMeetCode(pasteById[reuniaoId] || '');
    if (!code) {
      setError('Cole um link do Meet válido.');
      return;
    }
    setError('');
    const { data, error: updateError } = await supabase
      .from('cliente_reunioes')
      .update({ meet_code: code })
      .eq('id', reuniaoId)
      .is('meet_code', null)
      .select('id, titulo, marcada_para, meet_code, status, created_at, iniciada_em, encerrada_em')
      .maybeSingle();
    if (updateError) {
      const duplicate = updateError.code === '23505' || /meet_code|já foi definido/i.test(updateError.message || '');
      setError(duplicate ? 'Este link já está em uso.' : (updateError.message || 'Não foi possível gravar o link.'));
      return;
    }
    if (!data) {
      setError('O link desta reunião já foi definido.');
      return;
    }
    clearPending(reuniaoId);
    setRows((current) => current.map((row) => (row.id === reuniaoId ? data : row)));
    setPasteById((current) => ({ ...current, [reuniaoId]: '' }));
  }

  async function copyTranscript(reuniao) {
    const { data } = await supabase
      .from('cliente_reuniao_falas')
      .select('ordem, nome, texto, inicio_em')
      .eq('reuniao_id', reuniao.id)
      .order('ordem', { ascending: true });
    const text = transcriptText(reuniao, data || []);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(reuniao.id);
      setTimeout(() => setCopiedId((current) => (current === reuniao.id ? null : current)), 1800);
    } catch {
      setError('Não foi possível copiar a transcrição.');
    }
  }

  const selected = rows.find((row) => row.id === selectedId) || null;
  const groups = groupFalas(falas);
  const speakers = speakerNames(falas);
  const tones = toneMap(speakers);
  const speakerTone = (nome) => tones.get(nome) || SPEAKER_TONES[0];
  const selectedUrl = selected ? meetUrl(selected.meet_code) : '';
  const firstAt = falas[0]?.inicio_em;
  const lastAt = falas[falas.length - 1]?.inicio_em;

  useEffect(() => {
    const box = linesRef.current;
    if (box && stickRef.current) box.scrollTop = box.scrollHeight;
  }, [falas.length, selectedId]);

  useEffect(() => {
    stickRef.current = true;
  }, [selectedId]);

  function onLinesScroll(event) {
    const box = event.currentTarget;
    stickRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  }

  return (
    <section className="planeje-client-hub-panel planeje-reuniao">
      <div className="planeje-client-hub-panel-head">
        <div className="planeje-reuniao-heading">
          <span className="planeje-reuniao-heading-icon"><Video className="w-4 h-4" /></span>
          <div>
            <h2 className="planeje-client-hub-panel-title">Reuniões</h2>
            <p className="planeje-reuniao-subtitle">Transcrição do Meet, salva neste cliente</p>
          </div>
        </div>
        <div className="planeje-reuniao-head-actions">
          <a href="/downloads/planeje-meet-extensao.zip" className="planeje-reuniao-btn planeje-reuniao-btn--ghost" title="Extensão do Chrome que transcreve o Meet">
            <Download className="w-3.5 h-3.5" />
            Extensão
          </a>
          <button type="button" className="planeje-reuniao-btn planeje-reuniao-btn--solid" onClick={() => setOpenForm((open) => !open)}>
            {openForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {openForm ? 'Fechar' : 'Nova reunião'}
          </button>
        </div>
      </div>

      <div className="planeje-reuniao-body">
        {openForm && (
          <div className="planeje-reuniao-form">
            <label className="planeje-reuniao-field">
              Título
              <input value={titulo} onChange={(event) => setTitulo(event.target.value)} maxLength={140} placeholder="Alinhamento de setembro" />
            </label>
            <label className="planeje-reuniao-field">
              Quando
              <input type="datetime-local" value={quando} onChange={(event) => setQuando(event.target.value)} />
            </label>
            <label className="planeje-reuniao-field planeje-reuniao-field--wide">
              Link do Meet, se a sala já existir
              <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://meet.google.com/abc-defg-hij" />
            </label>
            <div className="planeje-reuniao-actions">
              <button type="button" className="planeje-reuniao-btn planeje-reuniao-btn--solid" disabled={saving} onClick={() => createReuniao('sala')}>
                <Video className="w-3.5 h-3.5" />
                Criar e abrir sala
              </button>
              <button type="button" className="planeje-reuniao-btn" disabled={saving} onClick={() => createReuniao('link')}>
                Criar com este link
              </button>
              <span className="planeje-reuniao-hint">Entre na sala com a extensão ligada neste Chrome e com o Planeje aberto.</span>
            </div>
          </div>
        )}

        {error && <p className="planeje-reuniao-error">{error}</p>}

        {loading ? (
          <p className="planeje-client-hub-empty">Carregando reuniões…</p>
        ) : rows.length === 0 ? (
          <div className="planeje-reuniao-empty">
            <Video className="w-5 h-5" />
            <p>Nenhuma reunião deste cliente ainda.</p>
            <span>Crie em Nova reunião e abra a sala; a conversa aparece aqui enquanto acontece.</span>
          </div>
        ) : (
          <div className="planeje-reuniao-layout">
            <div className="planeje-reuniao-list">
              {rows.map((row) => {
                const url = meetUrl(row.meet_code);
                const active = row.id === selectedId;
                return (
                  <div key={row.id} className={`planeje-reuniao-card${active ? ' is-active' : ''}`}>
                    <button type="button" className="planeje-reuniao-card-main" onClick={() => loadFalas(row.id)}>
                      <span className="planeje-reuniao-card-title">{row.titulo}</span>
                      <span className="planeje-reuniao-card-meta">
                        <span className={`planeje-reuniao-status planeje-reuniao-status--${row.status || 'marcada'}`}>
                          {reuniaoStatusLabel(row.status)}
                        </span>
                        {formatWhen(row.marcada_para || row.created_at)}
                      </span>
                    </button>
                    {!url && (
                      <div className="planeje-reuniao-paste">
                        <input
                          value={pasteById[row.id] || ''}
                          onChange={(event) => setPasteById((current) => ({ ...current, [row.id]: event.target.value }))}
                          placeholder="Cole o link do Meet"
                        />
                        <button type="button" className="planeje-reuniao-btn" onClick={() => attachLink(row.id)}>Salvar</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="planeje-reuniao-viewer">
              {selected ? (
                <>
                  <div className="planeje-reuniao-viewer-head">
                    <div className="min-w-0">
                      <p className="planeje-reuniao-viewer-title">{selected.titulo}</p>
                      <p className="planeje-reuniao-viewer-meta">
                        <span className={`planeje-reuniao-status planeje-reuniao-status--${selected.status || 'marcada'}`}>
                          {reuniaoStatusLabel(selected.status)}
                        </span>
                        {formatWhen(selected.marcada_para || selected.created_at)}
                        {firstAt && lastAt && durationLabel(firstAt, lastAt) ? ` · ${durationLabel(firstAt, lastAt)}` : ''}
                        {groups.length ? ` · ${falas.length} ${falas.length === 1 ? 'fala' : 'falas'}` : ''}
                      </p>
                    </div>
                    <div className="planeje-reuniao-viewer-actions">
                      {selectedUrl && (
                        <a href={selectedUrl} target="_blank" rel="noreferrer" className="planeje-reuniao-btn">
                          <ExternalLink className="w-3.5 h-3.5" />
                          Abrir Meet
                        </a>
                      )}
                      <button type="button" className="planeje-reuniao-btn" disabled={!groups.length} onClick={() => copyTranscript(selected)}>
                        {copiedId === selected.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedId === selected.id ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  {speakers.length > 0 && (
                    <div className="planeje-reuniao-speakers">
                      {speakers.map((speaker) => (
                        <span key={speaker.nome} className="planeje-reuniao-speaker-chip">
                          <i style={{ background: speakerTone(speaker.nome) }} />
                          {speaker.nome}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="planeje-reuniao-lines" ref={linesRef} onScroll={onLinesScroll}>
                    {falasLoading ? (
                      <p className="planeje-client-hub-empty">Carregando transcrição…</p>
                    ) : groups.length === 0 ? (
                      <div className="planeje-reuniao-empty planeje-reuniao-empty--inline">
                        <p>Ainda não há falas nesta reunião.</p>
                        <span>Com a extensão ligada na sala, cada fala aparece aqui com o nome de quem falou.</span>
                      </div>
                    ) : (
                      groups.map((group) => (
                        <div key={group.key} className="planeje-reuniao-group">
                          <span className="planeje-reuniao-avatar" style={{ background: speakerTone(group.nome) }}>{initials(group.nome)}</span>
                          <div className="min-w-0">
                            <p className="planeje-reuniao-group-head">
                              <strong style={{ color: speakerTone(group.nome) }}>{group.nome}</strong>
                              <span>{formatFalaClock(group.inicio)}</span>
                            </p>
                            {group.textos.map((texto, index) => (
                              <p key={index} className="planeje-reuniao-group-text">{texto}</p>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="planeje-reuniao-empty planeje-reuniao-empty--inline">
                  <p>Escolha uma reunião ao lado.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
