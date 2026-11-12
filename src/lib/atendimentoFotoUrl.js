/** Foto já copiada para o nosso storage. Link do WhatsApp expira e o navegador recebe erro. */
export function storedPhotoIsStale(url) {
  const value = String(url || '').trim();
  if (!value) return true;
  if (value.includes('/atendimento-fotos/')) return false;
  return /whatsapp\.net|fbcdn\.net/i.test(value);
}
