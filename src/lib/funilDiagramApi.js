import { supabase } from '@/lib/customSupabaseClient';
import { CLIENTE_DEFAULT_FUNIL } from '@/components/funil/data/defaultClienteTemplate';

function mapDiagramRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    nodes: row.nodes || [],
    edges: row.edges || [],
    isPublished: !!row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFunilDiagrams(clienteId) {
  const { data, error } = await supabase
    .from('cliente_funil_diagrama')
    .select('id, name, is_published, created_at, updated_at')
    .eq('cliente_id', clienteId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapDiagramRow);
}

export async function getFunilDiagram(id) {
  const { data, error } = await supabase
    .from('cliente_funil_diagrama')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return mapDiagramRow(data);
}

export async function createFunilDiagram(clienteId, { name, nodes, edges, isPublished }) {
  const { data, error } = await supabase
    .from('cliente_funil_diagrama')
    .insert({
      cliente_id: clienteId,
      name: name || 'Sem título',
      nodes: nodes || [],
      edges: edges || [],
      is_published: !!isPublished,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapDiagramRow(data);
}

export async function updateFunilDiagram(id, { name, nodes, edges, isPublished }) {
  const patch = {
    updated_at: new Date().toISOString(),
  };
  if (name !== undefined) patch.name = name;
  if (nodes !== undefined) patch.nodes = nodes;
  if (edges !== undefined) patch.edges = edges;
  if (isPublished !== undefined) patch.is_published = isPublished;

  const { data, error } = await supabase
    .from('cliente_funil_diagrama')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapDiagramRow(data);
}

/** Marca este diagrama como publicado (métricas/hub) e despublica os demais do cliente. */
export async function publishFunilDiagram(clienteId, diagramId) {
  await supabase
    .from('cliente_funil_diagrama')
    .update({ is_published: false })
    .eq('cliente_id', clienteId);

  return updateFunilDiagram(diagramId, { isPublished: true });
}

export async function getPublishedFunilDiagram(clienteId) {
  const { data, error } = await supabase
    .from('cliente_funil_diagrama')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('is_published', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return mapDiagramRow(data);
}

export async function deleteFunilDiagram(id) {
  const { error } = await supabase.from('cliente_funil_diagrama').delete().eq('id', id);
  if (error) throw error;
}

/** Cria o funil padrão do backup quando o cliente ainda não tem nenhum. */
export async function ensureDefaultFunilForCliente(clienteId) {
  const list = await listFunilDiagrams(clienteId);
  if (list.length > 0) return list;

  const created = await createFunilDiagram(clienteId, CLIENTE_DEFAULT_FUNIL);
  return [created];
}

export { CLIENTE_DEFAULT_FUNIL };
