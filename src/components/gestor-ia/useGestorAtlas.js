import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { supabase } from '@/lib/customSupabaseClient';
import { canStartGestorAtlas } from './gestorIaMemoryData';
import { useGestorRead } from './gestorIaReads';

export function useGestorAtlasContext(clientId, readStore) {
  const { profile } = useAuth();
  const { moduleSettings } = useModuleSettings();
  const scope = { ownerId: profile?.id, clientId };
  const allowed = Boolean(clientId) && moduleSettings?.assistant === true && profile?.status === 'active';
  const access = useGestorRead(readStore, `atlas:${scope.ownerId}:${clientId}`, allowed, () => canStartGestorAtlas(supabase, scope));
  return access.data === true ? scope : null;
}
