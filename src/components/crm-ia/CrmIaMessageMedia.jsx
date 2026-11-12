import React, { useEffect, useRef, useState } from 'react';
import { auditMediaKind, leadHttpsMediaUrl } from '@/lib/rastreamentoLeadConversa';

export default function CrmIaMessageMedia({ api, scope, message }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const kind = auditMediaKind(message.body, message.media_type);
  if (kind === 'text') return null;
  if (message.media_purged_at) return <p className="crm-ia-muted">Mídia fora do período de retenção.</p>;
  if (!message.download_id) return <p className="crm-ia-muted">Arquivo indisponível neste histórico.</p>;
  async function load() {
    setBusy(true); setError('');
    try {
      const result = await api('load_media', { ...scope, message_id: message.download_id, media_kind: kind });
      const url = leadHttpsMediaUrl(result.url) || (/^data:(image\/(png|jpeg|gif|webp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/(pdf|octet-stream));base64,/i.test(result.url || '') ? result.url : '');
      if (!url) throw new Error('Arquivo indisponível.');
      if (active.current) setFile({ ...result, url });
    } catch (failure) { if (active.current) setError(failure.message); }
    finally { if (active.current) setBusy(false); }
  }
  return <div className="crm-ia-message-media">{file ? <>
    {kind === 'audio' && <audio controls preload="metadata" src={file.url} aria-label="Áudio da mensagem" />}
    {kind === 'image' && <a href={file.url} target="_blank" rel="noopener noreferrer"><img src={file.url} alt={file.fileName || 'Imagem da mensagem'} /></a>}
    {kind === 'video' && <video controls preload="metadata" src={file.url} aria-label="Vídeo da mensagem" />}
    {kind === 'document' && <a href={file.url} download={file.fileName || 'documento'} target="_blank" rel="noopener noreferrer">Baixar {file.fileName || 'documento'}</a>}
  </> : <button type="button" disabled={busy} onClick={load}>{busy ? 'Carregando arquivo…' : kind === 'audio' ? 'Carregar áudio' : 'Abrir arquivo'}</button>}{error && <p role="alert">{error}</p>}</div>;
}
