import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { consultMensagens } from './messageHistory.js';
import { denyModule, loadModuleAccess, type McpActorLike } from './access.js';
import { type TableColumnMap, pickExistingColumns } from './introspect.js';

function jsonText(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true as const,
  };
}

const conversaStatusSchema = z.enum(['aguardando', 'em_atendimento', 'resolvido']).optional();

export function registerAtendimentoTools(
  mcp: McpServer,
  supabase: SupabaseClient,
  columns: TableColumnMap,
  actor?: McpActorLike
): void {
  mcp.registerTool(
    'listar_conversas',
    {
      title: 'Listar conversas de atendimento',
      description:
        'SELECT em atendimento_conversas. Filtros: cliente_id, status (aguardando|em_atendimento|resolvido), is_group, assigned_to, limite (padrão 50). Ordenação: last_message_at desc.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        status: conversaStatusSchema,
        is_group: z.boolean().optional(),
        assigned_to: z.string().uuid().optional(),
        limite: z.number().int().positive().max(500).optional(),
      }),
    },
    async ({ cliente_id, status, is_group, assigned_to, limite }) => {
      try {
        const n = limite ?? 50;
        const wanted = [
          'id',
          'cliente_id',
          'whatsapp_config_id',
          'chat_jid',
          'is_group',
          'display_name',
          'status',
          'fila_id',
          'assigned_to',
          'last_message_at',
          'last_customer_message_at',
          'first_response_at',
          'unread_count',
          'last_message_preview',
          'created_at',
          'archived_at',
        ];
        const selectStr =
          pickExistingColumns('atendimento_conversas', columns, wanted).join(',') || '*';

        let q = supabase.from('atendimento_conversas').select(selectStr);
        if ((columns.atendimento_conversas ?? []).includes('archived_at')) {
          q = q.is('archived_at', null);
        }
        if (cliente_id) q = q.eq('cliente_id', cliente_id);
        if (status) q = q.eq('status', status);
        if (is_group !== undefined) q = q.eq('is_group', is_group);
        if (assigned_to) q = q.eq('assigned_to', assigned_to);

        const { data, error } = await q.order('last_message_at', { ascending: false }).limit(n);
        if (error) throw new Error(`Supabase (listar_conversas): ${error.message}`);
        return jsonText({ total: data?.length ?? 0, conversas: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'ver_mensagens_conversa',
    {
      title: 'Ver mensagens de uma conversa',
      description: 'Histórico integral por conversation_id ou chat_jid + cliente_id. Sem teto total; limite é o tamanho da página. Siga cursor até paginacao.concluido=true. Mesmos filtros em todas as páginas; nenhuma nova autorização por página do mesmo escopo.',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      inputSchema: z.object({
        conversation_id: z.string().uuid().optional(),
        cliente_id: z.string().uuid(),
        chat_jid: z.string().optional(),
        limite: z.number().int().positive().max(500).optional(),
        cursor: z.string().max(12000).optional(),
        inicio: z.string().optional(),
        fim: z.string().optional(),
        canal: z.string().optional(),
        direcao: z.enum(['lead', 'equipe']).optional(),
        busca: z.string().optional(),
      }),
    },
    async ({ conversation_id, cliente_id, chat_jid, limite, cursor, inicio, fim, canal, direcao, busca }) => {
      try {
        const access = await loadModuleAccess(supabase, actor);
        const denied = denyModule(access, 'atendimento');
        if (denied) throw new Error(denied);
        if (!conversation_id && !chat_jid) throw new Error('Informe conversation_id ou chat_jid.');
        const result = await consultMensagens(supabase, {
          clienteId: cliente_id, conversationId: conversation_id, chatJid: chat_jid,
          limite, cursor, inicio, fim, canal, direcao, busca, actor, columns,
        });
        return jsonText({ ...result, mensagens: result.mensagens.map(({ texto, lado, registrada_em, ...message }) => ({
          ...message, body: texto, created_at: registrada_em, direcao: lado === 'lead' ? 'recebida' : 'enviada',
        })) });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'atualizar_conversa',
    {
      title: 'Atualizar conversa de atendimento',
      description:
        'UPDATE em atendimento_conversas por id. Campos: status, assigned_to (uuid ou null), fila_id (uuid ou null).',
      inputSchema: z.object({
        id: z.string().uuid(),
        status: conversaStatusSchema,
        assigned_to: z.string().uuid().nullable().optional(),
        fila_id: z.string().uuid().nullable().optional(),
      }),
    },
    async ({ id, status, assigned_to, fila_id }) => {
      try {
        const patch: Record<string, unknown> = {};
        if (status !== undefined) patch.status = status;
        if (assigned_to !== undefined) patch.assigned_to = assigned_to;
        if (fila_id !== undefined) patch.fila_id = fila_id;

        if (Object.keys(patch).length === 0) {
          throw new Error('Informe ao menos um campo: status, assigned_to ou fila_id.');
        }

        if ((columns.atendimento_conversas ?? []).includes('updated_at')) {
          patch.updated_at = new Date().toISOString();
        }
        if (status === 'resolvido' && (columns.atendimento_conversas ?? []).includes('resolved_at')) {
          patch.resolved_at = new Date().toISOString();
        }

        const { data, error } = await supabase
          .from('atendimento_conversas')
          .update(patch)
          .eq('id', id)
          .select()
          .maybeSingle();
        if (error) throw new Error(`Supabase (atualizar_conversa): ${error.message}`);
        if (!data) throw new Error('Conversa não encontrada.');
        return jsonText({ conversa: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_filas_atendimento',
    {
      title: 'Listar filas de atendimento',
      description: 'SELECT em atendimento_filas. Filtro opcional: cliente_id. Ordenação: sort_order.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
      }),
    },
    async ({ cliente_id }) => {
      try {
        const wanted = [
          'id',
          'cliente_id',
          'name',
          'sla_primeira_resposta_minutos',
          'sort_order',
          'created_at',
        ];
        const selectStr =
          pickExistingColumns('atendimento_filas', columns, wanted).join(',') || '*';
        let q = supabase.from('atendimento_filas').select(selectStr);
        if (cliente_id) q = q.eq('cliente_id', cliente_id);
        const { data, error } = await q.order('sort_order', { ascending: true });
        if (error) throw new Error(`Supabase (listar_filas_atendimento): ${error.message}`);
        return jsonText({ total: data?.length ?? 0, filas: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'analisar_conversa_grupo',
    {
      title: 'Analisar conversa de grupo com IA',
      description:
        'Dispara análise IA (edge function atendimento-group-analyze) para decidir se cliente aguarda resposta. Obrigatório: conversation_id, cliente_id. Opcionais: chat_jid, message_id, message_body, sender_name, sender_jid, message_at.',
      inputSchema: z.object({
        conversation_id: z.string().uuid(),
        cliente_id: z.string().uuid(),
        chat_jid: z.string().optional(),
        message_id: z.string().optional(),
        message_body: z.string().optional(),
        sender_name: z.string().optional(),
        sender_jid: z.string().optional(),
        message_at: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const supabaseUrl = process.env.SUPABASE_URL?.trim();
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!supabaseUrl || !serviceKey) {
          throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no MCP.');
        }
        const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/atendimento-group-analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(args),
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
        }
        return jsonText(data);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_analises_grupo',
    {
      title: 'Listar análises IA de grupos',
      description: 'Histórico em atendimento_grupo_analise_log. Filtros: conversation_id, cliente_id, limite (padrão 20).',
      inputSchema: z.object({
        conversation_id: z.string().uuid().optional(),
        cliente_id: z.string().uuid().optional(),
        limite: z.number().int().positive().max(200).optional(),
      }),
    },
    async ({ conversation_id, cliente_id, limite }) => {
      try {
        const n = limite ?? 20;
        let q = supabase.from('atendimento_grupo_analise_log').select('*');
        if (conversation_id) q = q.eq('conversation_id', conversation_id);
        if (cliente_id) q = q.eq('cliente_id', cliente_id);
        const { data, error } = await q.order('created_at', { ascending: false }).limit(n);
        if (error) throw new Error(`Supabase (listar_analises_grupo): ${error.message}`);
        return jsonText({ total: data?.length ?? 0, analises: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'listar_remetentes_internos_grupo',
    {
      title: 'Listar remetentes internos (IA grupos)',
      description:
        'Pessoas cadastradas como equipe interna em grupos — IA não marca aguardo quando reconhece. Sem cliente_id lista a equipe da agência (global).',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
      }),
    },
    async ({ cliente_id }) => {
      try {
        let query = supabase.from('atendimento_grupo_remetente_interno').select('*').order('label');
        query = cliente_id ? query.eq('cliente_id', cliente_id) : query.is('cliente_id', null);
        const { data, error } = await query;
        if (error) throw new Error(`Supabase: ${error.message}`);
        return jsonText({ total: data?.length ?? 0, remetentes: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  mcp.registerTool(
    'criar_remetente_interno_grupo',
    {
      title: 'Cadastrar remetente interno (IA grupos)',
      description:
        'INSERT em atendimento_grupo_remetente_interno. Obrigatório: label. Sem cliente_id cadastra equipe da agência (todos os grupos). Informe phone e/ou name_match.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        label: z.string().min(1),
        phone: z.string().optional(),
        name_match: z.string().optional(),
        sender_jid: z.string().optional(),
        notes: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const phone = args.phone?.replace(/\D/g, '') || null;
        const name = args.name_match?.trim() || null;
        if (!phone && !name) {
          throw new Error('Informe phone ou name_match para reconhecer o remetente.');
        }
        const { data, error } = await supabase
          .from('atendimento_grupo_remetente_interno')
          .insert({
            cliente_id: args.cliente_id || null,
            label: args.label.trim(),
            phone,
            name_match: name,
            sender_jid: args.sender_jid?.trim() || (phone ? `${phone}@s.whatsapp.net` : null),
            notes: args.notes?.trim() || (args.cliente_id ? null : 'Equipe da agência nos grupos'),
          })
          .select()
          .maybeSingle();
        if (error) throw new Error(`Supabase: ${error.message}`);
        return jsonText({ remetente: data });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
