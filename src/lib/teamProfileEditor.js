export const TEAM_PROFILE_STATUSES = [
  { value: 'active', label: 'Ativo' },
  { value: 'pending', label: 'Pendente' },
  { value: 'inactive', label: 'Inativo' },
];

const roles = new Set(['superadmin', 'admin', 'colaborador']);
const statuses = new Set(TEAM_PROFILE_STATUSES.map(status => status.value));

export const teamProfileStatusLabel = status => TEAM_PROFILE_STATUSES.find(option => option.value === status)?.label || 'Não definido';

export function buildTeamProfilePatch(original, draft) {
  if (!original?.id) throw new Error('Selecione um cadastro para editar.');
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(draft, 'role') && draft.role !== original.role) {
    if (!roles.has(draft.role)) throw new Error('Selecione uma permissão válida.');
    patch.role = draft.role;
  }
  if (Object.prototype.hasOwnProperty.call(draft, 'status') && draft.status !== original.status) {
    if (!statuses.has(draft.status)) throw new Error('Selecione uma situação de cadastro válida.');
    patch.status = draft.status;
  }
  return patch;
}

export async function saveTeamProfileEdit(original, draft, updateProfile) {
  const patch = buildTeamProfilePatch(original, draft);
  if (!Object.keys(patch).length) return { changed: false, profile: original };
  const { data, error } = await updateProfile(original.id, patch);
  if (error) throw error;
  if (!data || data.id !== original.id || Object.keys(patch).some(field => data[field] !== patch[field])) {
    throw new Error('Não foi possível confirmar a alteração. Atualize a lista e confira o cadastro.');
  }
  return { changed: true, profile: data };
}
