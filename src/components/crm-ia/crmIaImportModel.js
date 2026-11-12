import { leadPayload, named } from './crmIaPresentation.js';
import { profileKey, publishedLeadProfiles } from './crmIaLeadModel.js';

const COLUMNS = [['nome', 'Nome', ['nome', 'name']], ['whatsapp', 'Telefone', ['whatsapp', 'telefone', 'phone']], ['email', 'Email', ['email']], ['valor', 'Valor', ['valor', 'value']], ['origem', 'Origem', ['origem', 'origin']], ['etiquetas', 'Etiquetas', ['etiquetas', 'tags']], ['stage_id', 'Etapa', ['etapa', 'stage', 'stage_id']], ['responsavel_id', 'Responsável', ['responsavel', 'atendente', 'owner', 'owner_id', 'responsavel_id']], ['profile', 'Perfil', ['perfil', 'profile', 'profile_id']], ['observacoes', 'Observações', ['observacoes', 'observacao', 'notes']]];
const normalizeHeader = value => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
export function crmImportColumns(workspace) {
  return [...COLUMNS, ...(workspace.config.data.custom_fields?.fields || []).filter(field => field.active !== false).map(field => [`field:${field.key}`, field.name, [field.key, field.name].map(normalizeHeader), field])];
}
export function crmImportMapping(headers, columns) {
  const normalized = headers.map(normalizeHeader);
  return Object.fromEntries(columns.map(([key, , aliases]) => {
    const indexes = normalized.flatMap((header, index) => aliases.includes(header) ? [index] : []);
    return [key, indexes.length === 1 ? String(indexes[0]) : ''];
  }));
}
function resolve(value, rows, label) {
  const input = String(value || '').trim();
  if (!input) return null;
  const byId = rows.filter(row => row.id === input || profileKey(row) === input);
  const matches = byId.length ? byId : rows.filter(row => named(row).trim().toLocaleLowerCase('pt-BR') === input.toLocaleLowerCase('pt-BR'));
  if (matches.length !== 1) throw new Error(matches.length ? `${label} ambíguo. Informe o ID exato.` : `${label} indisponível neste cliente e funil.`);
  return matches[0];
}
function number(value) {
  const source = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  if (!/^-?\d+(\.\d+)?$/.test(source) || !Number.isFinite(Number(source))) throw new Error('Informe um número válido.');
  return Number(source);
}
function customValue(value, field) {
  if (field.type === 'number') return number(value);
  if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`Informe uma data válida em ${field.name}.`);
  if (field.type === 'select' && !field.options?.includes(value)) throw new Error(`Opção inválida em ${field.name}.`);
  return value;
}
export function prepareCrmImport(table, mapping, defaults, workspace) {
  if (mapping.nome == null || mapping.nome === '' || mapping.whatsapp == null || mapping.whatsapp === '') throw new Error('Mapeie as colunas de nome e telefone.');
  if (!table.rows.length || table.rows.length > 1000) throw new Error('Importe de 1 a 1.000 leads por lote.');
  const columns = crmImportColumns(workspace);
  const pipelines = new Set(workspace.pipelines.map(item => item.id));
  return table.rows.map((values, index) => {
    try {
      if (defaults.pipeline_id && !pipelines.has(defaults.pipeline_id)) throw new Error('Funil indisponível neste cliente.');
      const value = key => mapping[key] == null || mapping[key] === '' ? '' : String(values[Number(mapping[key])] || '').trim();
      const draft = Object.fromEntries(COLUMNS.map(([key]) => [key, value(key)]));
      draft.pipeline_id = defaults.pipeline_id || null;
      const stage = resolve(draft.stage_id || defaults.stage_id, workspace.stages.filter(item => pipelines.has(item.pipeline_id) && (!draft.pipeline_id || item.pipeline_id === draft.pipeline_id)), 'Etapa');
      draft.stage_id = stage?.id || null;
      draft.pipeline_id ||= stage?.pipeline_id || null;
      draft.responsavel_id = resolve(draft.responsavel_id || defaults.responsavel_id, workspace.people, 'Responsável')?.id || null;
      const profile = resolve(draft.profile || defaults.profile, publishedLeadProfiles(workspace, draft.pipeline_id), 'Perfil');
      if (profile) draft.profile = profile; else delete draft.profile;
      if (draft.valor) draft.valor = number(draft.valor);
      draft.etiquetas = draft.etiquetas.split(/[|,;]/).join('\n');
      const fields = Object.fromEntries(columns.filter(([, , , field]) => field).flatMap(([key, , , field]) => value(key) ? [[field.key, customValue(value(key), field)]] : []));
      if (Object.keys(fields).length) draft.crm_ia_fields = fields;
      return leadPayload(draft);
    } catch (failure) { throw new Error(`Linha ${index + 2}: ${failure.message}`); }
  });
}
