export const EXTENSAO_WHATSAPP_PATH = '/extensao-whatsapp';
export const EXTENSAO_WHATSAPP_ZIP_PATH = '/downloads/planeje-whatsapp-extensao.zip';
export const EXTENSAO_WHATSAPP_ZIP_NAME = 'planeje-whatsapp-extensao.zip';
export const EXTENSAO_WHATSAPP_ZIP_VERSION = '1.4.1';

export function extensaoWhatsAppZipHref() {
  return `${EXTENSAO_WHATSAPP_ZIP_PATH}?v=${encodeURIComponent(EXTENSAO_WHATSAPP_ZIP_VERSION)}`;
}

export async function downloadExtensaoWhatsAppZip() {
  const response = await fetch(extensaoWhatsAppZipHref(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Não foi possível baixar a extensão (${response.status}).`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = EXTENSAO_WHATSAPP_ZIP_NAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}
