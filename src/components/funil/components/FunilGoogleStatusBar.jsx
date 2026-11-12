import React, { useState } from 'react';
import { Link2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import ClientGoogleAdsAccountsManager from '@/components/forms/ClientGoogleAdsAccountsManager';
import { useFunilGoogleOptions } from '@/hooks/useFunilGoogleOptions';

export default function FunilGoogleStatusBar({
  compact = false,
  clienteId,
  clienteName,
  connectedNodesCount,
  dialogOpen: controlledOpen,
  onDialogOpenChange,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setDialogOpen = onDialogOpenChange || setInternalOpen;

  const { linkedAccounts, loadingAccounts, fetchLinkedAccounts, hasLinkedAccounts } =
    useFunilGoogleOptions(clienteId);

  const handleDialogChange = (open) => {
    setDialogOpen(open);
    if (!open) fetchLinkedAccounts();
  };

  if (!clienteId) return null;

  return (
    <>
      <div className={`funil-google-status ${compact ? 'funil-google-status--compact' : ''}`}>
        {loadingAccounts ? (
          <Badge variant="secondary" className="font-normal">
            Verificando Google…
          </Badge>
        ) : hasLinkedAccounts ? (
          <Badge variant="default" className="font-normal gap-1 bg-[#4285F4] hover:bg-[#4285F4]/90">
            <CheckCircle2 className="h-3 w-3" />
            Google conectado · {linkedAccounts.length} conta{linkedAccounts.length !== 1 ? 's' : ''}
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal gap-1 text-emerald-800 border-emerald-300 bg-emerald-50">
            <AlertCircle className="h-3 w-3" />
            Nenhuma conta Google vinculada
          </Badge>
        )}

        {connectedNodesCount > 0 && !compact && (
          <span className="funil-google-status__count">
            {connectedNodesCount} nó{connectedNodesCount !== 1 ? 's' : ''} vinculado{connectedNodesCount !== 1 ? 's' : ''} ao Google
          </span>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`${compact ? 'h-7 text-[10px] px-2' : 'h-8 text-xs'} ml-auto shrink-0`}
          onClick={() => setDialogOpen(true)}
        >
          <Link2 className="h-3 w-3 mr-1.5" />
          {hasLinkedAccounts ? 'Gerenciar contas' : 'Vincular contas Google'}
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contas Google Ads do cliente</DialogTitle>
            <DialogDescription>
              {clienteName
                ? `Vincule contas Google Ads para ${clienteName} e depois conecte campanhas nos nós do funil.`
                : 'Vincule contas Google Ads para conectar campanhas nos nós do funil.'}
            </DialogDescription>
          </DialogHeader>
          <ClientGoogleAdsAccountsManager clientId={clienteId} clientName={clienteName} />
        </DialogContent>
      </Dialog>
    </>
  );
}
