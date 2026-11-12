import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TrafegoVincularGrupoDialog from '@/components/traffic/TrafegoVincularGrupoDialog';
import {
  buildGrupoConversasUrl,
  clearClienteGrupo,
  loadClienteGrupo,
} from '@/lib/clienteWhatsappGrupo';
import { useToast } from '@/components/ui/use-toast';

export default function ClientWhatsappGrupoCard({ clientId, clientName }) {
  const { toast } = useToast();
  const [grupo, setGrupo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      setGrupo(await loadClienteGrupo(clientId));
    } catch (e) {
      console.warn('grupo WhatsApp do cliente', e);
      setGrupo(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const unlink = async () => {
    try {
      await clearClienteGrupo(clientId);
      setGrupo(null);
      toast({ title: 'Grupo desvinculado', description: clientName });
    } catch (e) {
      toast({ title: 'Erro', description: e?.message || String(e), variant: 'destructive' });
    }
  };

  const grupoUrl = buildGrupoConversasUrl(grupo);
  const row = { client: { id: clientId, empresa: clientName } };

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupo…
        </p>
      ) : grupo ? (
        <>
          <p className="text-sm font-medium">{grupo.display_name || grupo.chat_jid}</p>
          <p className="text-xs text-muted-foreground">Grupo da equipe com este cliente.</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum grupo vinculado. Escolha o WhatsApp da equipe + cliente — não o número da agência.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {grupoUrl ? (
          <Button size="sm" variant="outline" asChild>
            <Link to={grupoUrl}>
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              Abrir grupo
            </Link>
          </Button>
        ) : null}
        <Button size="sm" variant={grupo ? 'ghost' : 'outline'} onClick={() => setDialogOpen(true)}>
          {grupo ? 'Trocar grupo' : 'Vincular grupo'}
        </Button>
        {grupo ? (
          <Button size="sm" variant="ghost" onClick={unlink}>
            Desvincular
          </Button>
        ) : null}
      </div>
      <TrafegoVincularGrupoDialog
        row={row}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={reload}
      />
    </div>
  );
}
