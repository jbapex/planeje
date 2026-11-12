import { Navigate } from 'react-router-dom';
import { buildLegacyRedirectPath } from '@/lib/superAdminHubs';

/** Redireciona rotas antigas do Super Admin para hubs com ?tab= */
const SuperAdminLegacyRedirect = ({ segment }) => {
  const target = buildLegacyRedirectPath(segment);
  if (!target) return <Navigate to="/super-admin" replace />;
  return <Navigate to={target} replace />;
};

export default SuperAdminLegacyRedirect;
