import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2, Loader2, UserCheck, UserMinus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isBaseClientContext,
  markConversationAsBaseClient,
  unmarkConversationAsBaseClient,
} from '@/lib/markClienteBase';

export default function MarkBaseClientButton({
  clienteId,
  conversation,
  context,
  onDone,
  compact = false,
  className,
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  if (!conversation || context?.isGroup || !clienteId) return null;

  const isBase = isBaseClientContext(context);

  const handleClick = async () => {
    setSaving(true);
    try {
      if (isBase) {
        await unmarkConversationAsBaseClient({ clienteId, conversation, context });
        toast({ title: 'Removido da base', description: 'Contato não aparece mais no filtro Base.' });
      } else {
        await markConversationAsBaseClient({
          clienteId,
          conversation,
          context,
          showToast: toast,
        });
        toast({
          title: 'Cliente da base',
          description: 'Marcado como comprou. Aparece no filtro Base.',
        });
      }
      onDone?.();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar',
        description: err?.message || 'Tente novamente.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (compact) {
    return (
      <Button
        type="button"
        variant={isBase ? 'outline' : 'default'}
        size="sm"
        className={cn(
          'h-7 wa-text-caption shrink-0',
          !isBase && 'bg-emerald-600 hover:bg-emerald-700 text-white',
          className
        )}
        disabled={saving}
        onClick={handleClick}
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isBase ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Na base
          </>
        ) : (
          <>
            <UserCheck className="h-3.5 w-3.5 mr-1" />
            Marcar base
          </>
        )}
      </Button>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        type="button"
        variant={isBase ? 'outline' : 'default'}
        size="sm"
        className={cn('w-full justify-start', !isBase && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
        disabled={saving}
        onClick={handleClick}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : isBase ? (
          <UserMinus className="h-4 w-4 mr-2" />
        ) : (
          <UserCheck className="h-4 w-4 mr-2" />
        )}
        {isBase ? 'Remover da base' : 'Marcar como cliente da base'}
      </Button>
      {isBase && (
        <p className="wa-text-caption">
          Este contato está no filtro <strong>Base</strong> e tratado como cliente ativo.
        </p>
      )}
    </div>
  );
}
