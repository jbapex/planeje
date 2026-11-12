import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { McpActorLike } from './access.js';
import { consultMetaTraffic, compareMetaTraffic, clean } from './metaTraffic.js';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pagination = { limite: z.number().int().min(1).max(100).default(50), cursor: z.string().max(12000).optional().describe('proximo_cursor da mesma consulta; válido por uma hora ou até reinício') };
const common = { cliente_id: z.string().uuid(), conta_id: z.string().regex(/^act_\d+$/).optional().describe('Conta vinculada ao cliente; obrigatória se houver várias ativas'), campanha_id: z.string().regex(/^\d+$/).optional(), ...pagination };
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
function result(data: any) { const safe = clean(data); return { content: [{ type: 'text' as const, text: JSON.stringify(safe) }], structuredContent: safe }; }
function error(e: unknown) { return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Falha na consulta de tráfego.' }], isError: true as const }; }
export function registerMetaTrafficTools(mcp: McpServer, supabase: SupabaseClient, actor?: McpActorLike) {
  mcp.registerTool('consultar_trafego_meta', {
    title: 'Consultar tráfego Meta completo (somente leitura)',
    description: 'Contas vinculadas, métricas diárias/acumuladas, campanhas, conjuntos com segmentação, anúncios/criativos/UTMs ou histórico Meta. Filtra cliente/conta/período/campanha e pagina com cursor. Métricas ausentes=null; objetivo e tipo de resultado explícitos. Configuração atual não é histórico. Sem editar Meta ou CRM.',
    annotations,
    outputSchema: z.object({ versao_schema: z.literal('1.0'), origem: z.string() }).passthrough(),
    inputSchema: z.object({ ...common, recurso: z.enum(['contas','metricas','campanhas','conjuntos','anuncios','historico']).default('metricas'), inicio: date.optional().describe('Obrigatório em metricas/historico; não usar no catálogo atual'), fim: date.optional().describe('Obrigatório em metricas/historico; não usar no catálogo atual'), nivel: z.enum(['conta','campanha','conjunto','anuncio']).default('campanha'), granularidade: z.enum(['dia','periodo']).default('periodo'), categoria_historico: z.enum(['CAMPAIGN','AD_SET','AD','BUDGET','TARGETING','STATUS','AUDIENCE']).optional().describe('Filtro Meta de categoria no histórico') }),
  }, async args => { try { return result(await consultMetaTraffic(supabase,actor,args)); } catch(e) { return error(e); } });
  mcp.registerTool('comparar_periodos_meta', {
    title: 'Comparar períodos equivalentes de tráfego Meta',
    description: 'Compara períodos com igual número de dias. Investimento, custo por resultado, conversas, visitas, ranking de campanhas e campanhas criadas. Separa objetivo/otimização/tipo de resultado/moeda/atribuição e público personalizado (potencial remarketing). Histórico de alterações e cobertura explícita; pagina campanhas, totais calculados em todas as páginas Meta até o limite declarado. Sem inferir causa comercial nem editar anúncios.',
    annotations,
    outputSchema: z.object({ versao_schema: z.literal('1.0'), origem: z.string() }).passthrough(),
    inputSchema: z.object({ ...common, inicio_anterior: date, fim_anterior: date, inicio_atual: date, fim_atual: date }),
  }, async args => { try { return result(await compareMetaTraffic(supabase,actor,args)); } catch(e) { return error(e); } });
}
