import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/customSupabaseClient';
import { ATENDIMENTO_UPLOAD_CHUNK_BYTES, encodeTusMetadata } from '@/lib/atendimentoMediaSend';

export const ATENDIMENTO_ENVIOS_BUCKET = 'atendimento-envios';
const SIGNED_URL_SECONDS = 6 * 60 * 60;

export class UploadCancelledError extends Error {
  constructor() {
    super('Envio interrompido.');
    this.name = 'UploadCancelledError';
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new UploadCancelledError();
}

function safeObjectName(clienteId, fileName) {
  const id = String(clienteId || '').replace(/[^a-zA-Z0-9-]/g, '') || 'loja';
  const base = String(fileName || 'arquivo')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80) || 'arquivo';
  const stamp = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${id}/${stamp}-${base}`;
}

async function readFailure(res) {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return json.message || json.error || json.msg || text;
  } catch {
    return text || `Falha ${res.status}`;
  }
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey,
  };
}

function resolveUploadUrl(location) {
  if (!location) return '';
  if (/^https?:\/\//i.test(location)) return location;
  const origin = String(supabaseUrl || '').replace(/\/$/, '');
  return `${origin}${location.startsWith('/') ? '' : '/'}${location}`;
}

/**
 * Sobe o arquivo em partes de 6 MB e devolve um link temporário para a uazapi baixar.
 * Não envia o arquivo no JSON da função.
 */
export async function uploadAtendimentoArquivo(file, { clienteId, onProgress, onStarted, signal } = {}) {
  if (!file?.size) throw new Error('Arquivo vazio.');
  throwIfAborted(signal);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre de novo para enviar o arquivo.');

  const objectName = safeObjectName(clienteId, file.name);
  onStarted?.({ path: objectName });
  const endpoint = `${String(supabaseUrl).replace(/\/$/, '')}/storage/v1/upload/resumable`;
  let created;
  try {
    created = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        ...authHeaders(token),
        'x-upsert': 'false',
        'tus-resumable': '1.0.0',
        'upload-length': String(file.size),
        'upload-metadata': encodeTusMetadata({
          bucketName: ATENDIMENTO_ENVIOS_BUCKET,
          objectName,
          contentType: file.type || 'application/octet-stream',
          cacheControl: '3600',
        }),
      },
    });
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') throw new UploadCancelledError();
    throw err;
  }
  if (!created.ok) {
    const detail = await readFailure(created);
    if (created.status === 413) {
      throw new Error('O armazenamento recusou o tamanho. Máximo 1 GB.');
    }
    throw new Error(detail || 'Não foi possível preparar o envio do arquivo.');
  }

  const uploadUrl = resolveUploadUrl(created.headers.get('location'));
  if (!uploadUrl) throw new Error('O armazenamento não devolveu o endereço do envio.');

  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + ATENDIMENTO_UPLOAD_CHUNK_BYTES, file.size);
    const slice = file.slice(offset, end);
    let patch;
    try {
      patch = await fetch(uploadUrl, {
        method: 'PATCH',
        signal,
        headers: {
          ...authHeaders(token),
          'tus-resumable': '1.0.0',
          'upload-offset': String(offset),
          'content-type': 'application/offset+octet-stream',
        },
        body: slice,
      });
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') throw new UploadCancelledError();
      throw err;
    }
    if (!patch.ok) {
      const detail = await readFailure(patch);
      throw new Error(detail || 'Falha ao enviar uma parte do arquivo.');
    }
    const next = Number(patch.headers.get('upload-offset'));
    offset = Number.isFinite(next) && next > offset ? next : end;
    onProgress?.(offset, file.size);
  }

  throwIfAborted(signal);
  const { data, error } = await supabase.storage
    .from(ATENDIMENTO_ENVIOS_BUCKET)
    .createSignedUrl(objectName, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Não foi possível liberar o arquivo para o WhatsApp.');
  }
  const url = /^https?:\/\//i.test(data.signedUrl)
    ? data.signedUrl
    : resolveUploadUrl(data.signedUrl);
  return { url, path: objectName };
}
