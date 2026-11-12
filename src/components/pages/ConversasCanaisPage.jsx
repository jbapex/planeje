import React from 'react';
import ClienteCanaisPage from '@/components/pages/ClienteCanaisPage';
import { canManageCsIa } from '@/components/cs-ia/csIaData';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import '@/components/atendimento/Atendimento.css';

/** Conectar / vincular números WhatsApp aos canais — atalho a partir de Conversas. */
export default function ConversasCanaisPage() {
  const { profile } = useAuth();
  const modules = useModuleSettings()?.moduleSettings;
  return (
    <div className="wa-atendimento flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden">
      <div className="flex-1 overflow-y-auto min-h-0">
        <ClienteCanaisPage embeddedInConversas canConfigureCsGroups={canManageCsIa(profile, modules)} />
      </div>
    </div>
  );
}
