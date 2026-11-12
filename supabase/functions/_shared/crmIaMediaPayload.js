export async function crmIaMediaDescriptor(payload) {
  const file = typeof payload?.file === 'string' ? payload.file.replace(/^data:[^;]+;base64,/, '') : '';
  if (!file || file.length > 5592408 || file.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file)) throw new Error('Anexo inválido. Limite de 4 MB.');
  const size = atob(file).length;
  const mediaType = payload.media_type;
  const mimetype = String(payload.mimetype || 'application/octet-stream');
  const caption = String(payload.caption || '').trim();
  if (caption.length > 4000) throw new Error('A legenda deve ter até 4.000 caracteres.');
  if (!['image', 'video', 'audio', 'ptt', 'document'].includes(mediaType) || size < 1 || size > 4194304 ||
      !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mimetype)) throw new Error('Tipo de arquivo inválido.');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file));
  return { hash: [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join(''),
    size, media_type: mediaType, mimetype, file_name: String(payload.doc_name || 'arquivo').replace(/[\/\\\x00-\x1f]/g, '').slice(0, 200),
    caption };
}
