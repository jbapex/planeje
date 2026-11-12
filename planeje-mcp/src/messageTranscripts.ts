import type { SupabaseClient } from '@supabase/supabase-js';
import { loadModuleAccess, denyModule, type McpActorLike } from './access.js';
import type { NormalMessage } from './messageNormalize.js';

type EvidenceMessage = NormalMessage & { evidencias: { fonte: string; id: string }[] };
type Transcript = { status: string; texto: string | null; automatica: true; fonte: string | null; inbox_id: string | null; gerada_em: string | null };
export const transcriptKey = (m: NormalMessage) => `${m.fonte}:${m.id}:${m.evento_indice}`;

/** Existing owner-private transcripts only; never enqueue or transcribe. */
export async function messageTranscripts(db: SupabaseClient, client: string, actor: McpActorLike | undefined, messages: EvidenceMessage[]) {
  const result = new Map<string, Transcript>();
  const audio = messages.filter(m => m.tipo === 'audio');
  if (!audio.length) return result;
  const empty = (status: string): Transcript => ({ status, texto: null, automatica: true, fonte: null, inbox_id: null, gerada_em: null });
  for (const m of audio) result.set(transcriptKey(m), empty('nao_disponivel'));
  if (actor?.type !== 'user') return result;
  const { data: settings, error } = await db.from('atlas_settings').select('owner_id,enabled').eq('id', 'atlas').maybeSingle();
  if (error) throw new Error('Não foi possível validar o acesso às transcrições.');
  if (!settings?.enabled || settings.owner_id !== actor.user_id) return result;
  const access = await loadModuleAccess(db, actor);
  if (denyModule(access, 'assistant')) return result;
  for (const m of audio) {
    if (m.midia_expurgada || !m.is_group || !m.conversation_id) continue;
    const { data: conversation, error: conversationError } = await db.from('atendimento_conversas')
      .select('id').eq('id', m.conversation_id).eq('cliente_id', client).eq('is_group', true)
      .eq('bloqueada', false).is('archived_at', null).maybeSingle();
    if (conversationError) throw new Error('Não foi possível validar a conversa da transcrição.');
    if (!conversation) continue;
    for (const ref of m.evidencias.filter(e => e.fonte === 'cliente_whatsapp_inbox')) {
      const { data: source, error: sourceError } = await db.from('cliente_whatsapp_inbox').select('id,media_purged_at')
        .eq('id', ref.id).eq('cliente_id', client).eq('conversation_id', m.conversation_id).eq('is_group', true).maybeSingle();
      if (sourceError) throw new Error('Não foi possível validar a fonte da transcrição.');
      if (!source || source.media_purged_at) continue;
      const { data: transcript, error: transcriptError } = await db.from('atlas_audio_transcripts')
        .select('inbox_id,status,transcript,finished_at').eq('inbox_id', ref.id).eq('owner_id', actor.user_id)
        .eq('conversation_id', m.conversation_id).maybeSingle();
      if (transcriptError) throw new Error('Não foi possível ler a transcrição; análise de áudio incompleta.');
      if (!transcript) continue;
      result.set(transcriptKey(m), { status: transcript.status, texto: transcript.status === 'completed' ? transcript.transcript : null,
        automatica: true, fonte: 'atlas_audio_transcripts', inbox_id: transcript.inbox_id, gerada_em: transcript.finished_at });
      break;
    }
  }
  return result;
}
