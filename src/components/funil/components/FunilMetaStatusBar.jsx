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
import ClientMetaAccountsManager from '@/components/forms/ClientMetaAccountsManager';
import { useFunilMetaOptions } from '@/hooks/useFunilMetaOptions';

export default function FunilMetaStatusBar({
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
    useFunilMetaOptions(clienteId);

  const handleDialogChange = (open) => {
    setDialogOpen(open);
    if (!open) fetchLinkedAccounts();
  };

  if (!clienteId) return null;

  return (
    <>
      <div className={`funil-meta-status ${compact ? 'funil-meta-status--compact' : ''}`}>
        {loadingAccounts ? (
          <Badge variant="secondary" className="font-normal">
            Verificando Meta…
          </Badge>
        ) : hasLinkedAccounts ? (
          <Badge variant="default" className="font-normal gap-1 bg-[#1877F2] hover:bg-[#1877F2]/90">
            <CheckCircle2 className="h-3 w-3" />
            Meta conectado · {linkedAccounts.length} conta{linkedAccounts.length !== 1 ? 's' : ''}
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal gap-1 text-amber-700 border-amber-300 bg-amber-50">
            <AlertCircle className="h-3 w-3" />
            Nenhuma conta Meta vinculada
          </Badge>
        )}

        {connectedNodesCount > 0 && !compact && (
          <span className="funil-meta-status__count">
            {connectedNodesCount} nó{connectedNodesCount !== 1 ? 's' : ''} vinculado{connectedNodesCount !== 1 ? 's' : ''} ao Meta
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
          {hasLinkedAccounts ? 'Gerenciar contas' : 'Vincular contas Meta'}
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contas Meta do cliente</DialogTitle>
            <DialogDescription>
              {clienteName
                ? `Vincule contas de anúncio para ${clienteName} e depois conecte campanhas nos nós do funil.`
                : 'Vincule contas de anúncio para conectar campanhas nos nós do funil.'}
            </DialogDescription>
          </DialogHeader>
          <ClientMetaAccountsManager clientId={clienteId} clientName={clienteName} />
        </DialogContent>
      </Dialog>
    </>
  );
}
