import { AtlasError } from './atlasCore.js';

async function ledgerCall(rpc, name, args, milliseconds, signal) {
  if (signal?.aborted) throw new AtlasError('CANCELLED', 'Execução interrompida antes da chamada de modelo.', 408);
  const controller = new AbortController();
  let rejectWait;
  const stopped = new Promise((_resolve, reject) => { rejectWait = reject; });
  const abort = () => { controller.abort(); rejectWait(new AtlasError('CANCELLED', 'Execução interrompida; a reserva será conciliada pelo histórico.', 408)); };
  const timer = setTimeout(() => {
    controller.abort();
    rejectWait(new AtlasError('BUDGET_LEDGER_UNAVAILABLE', 'A contabilização não foi confirmada no prazo. A reserva foi preservada para conciliação.', 503));
  }, milliseconds);
  signal?.addEventListener('abort', abort, { once: true });
  try { return await Promise.race([Promise.resolve().then(() => rpc(name, args, { signal: controller.signal })), stopped]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function budgetedAtlasExecutorModel({ run, rpc, callModel }, payload) {
  const id = crypto.randomUUID();
  let media = false;
  const messages = payload.messages?.map(message => !Array.isArray(message.content) ? message : { ...message, content: message.content.map(part => {
    if (['image_url', 'file'].includes(part.type)) { media = true; return { type: part.type }; }
    if (part.type !== 'text' || typeof part.text !== 'string') throw new AtlasError('INVALID_INPUT', 'Formato de anexo não suportado no orçamento.');
    return part;
  }) });
  // A full 128k input group covers up to four bounded media files. Base64 bytes are transport, not tokens.
  const estimate = new TextEncoder().encode(JSON.stringify({ messages, tools: payload.tools })).length + (media ? 128000 : 0) + (payload.maxTokens || 2400) + 300;
  const reservation = await ledgerCall(rpc, 'atlas_executor_model_reserve', { p_run: run.id, p_call: id, p_estimate: estimate }, 10000, payload.signal);
  if (!reservation?.reserved) throw new AtlasError('DAILY_BUDGET_WAIT', 'O teto diário foi atingido. O pedido foi preservado para nova tentativa.', 429);
  let answer;
  try { answer = await callModel(payload); return answer; }
  finally { await ledgerCall(rpc, 'atlas_model_finish', { p_call: id, p_usage: answer?.usage || null }, 8000); }
}
