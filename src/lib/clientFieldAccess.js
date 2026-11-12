export const CLIENT_VALOR_FIELD = 'valor';

export function rolePermissionMap(rows) {
  const map = {};
  (rows || []).forEach((row) => {
    if (!row?.role || !row?.field_name) return;
    if (!map[row.role]) map[row.role] = {};
    map[row.role][row.field_name] = row.can_view === true;
  });
  return map;
}

export function roleCanViewField(rolePermissions, role, fieldName = CLIENT_VALOR_FIELD) {
  if (role === 'superadmin') return true;
  const roleMap = rolePermissions?.[role];
  if (roleMap && Object.prototype.hasOwnProperty.call(roleMap, fieldName)) {
    return roleMap[fieldName] === true;
  }
  return true;
}

export function userCanViewClientValor({ role, roleCanView, override }) {
  if (role === 'superadmin') return true;
  if (override === true || override === false) return override;
  return roleCanView !== false;
}

export function usersWhoCanViewValor(users, rolePermissions, overridesByUserId) {
  return (users || []).filter((user) => {
    const roleDefault = roleCanViewField(rolePermissions, user?.role, CLIENT_VALOR_FIELD);
    const override = overridesByUserId?.[user?.id];
    return userCanViewClientValor({
      role: user?.role,
      roleCanView: roleDefault,
      override,
    });
  });
}

export function valorRoleSummary(rolePermissions) {
  const admin = roleCanViewField(rolePermissions, 'admin', CLIENT_VALOR_FIELD);
  const colaborador = roleCanViewField(rolePermissions, 'colaborador', CLIENT_VALOR_FIELD);
  return `Padrão do papel: Admin ${admin ? 'vê' : 'oculto'} · Colaborador ${colaborador ? 'vê' : 'oculto'}`;
}
