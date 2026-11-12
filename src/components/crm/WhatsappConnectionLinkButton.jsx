import React, { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Link, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { useToast } from '@/components/ui/use-toast';
import { manageWhatsappConnectionLink, whatsappConnectionUrl, canManageWhatsappConnection } from '@/lib/whatsappConnection';

export default function WhatsappConnectionLinkButton({ clienteId, instance }) {
  const { profile } = useAuth();
  const { moduleSettings } = useModuleSettings();
  const { toast } = useToast();
  const [open, setOpen] = useState(false), [pending, setPending] = useState('');
  const [active, setActive] = useState(null), [link, setLink] = useState(''), [error, setError] = useState('');
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!canManageWhatsappConnection(profile, moduleSettings.rastreamento) || (instance.provider && instance.provider !== 'uazapi')) return null;

  const run = async (action) => {
    if (busy.current) return;
    busy.current = true;
    setPending(action); setError('');
    try {
      const data = await manageWhatsappConnectionLink(action, clienteId, instance.id);
      if (!mounted.current) return;
      if (action === 'issue') {
        setActive(data); setLink(whatsappConnectionUrl(window.location.origin, data.token));
      } else if (action === 'revoke') {
        setActive(null); setLink(''); toast({ title: 'Link revogado' });
      } else { setActive(data.link); }
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { busy.current = false; if (mounted.current) setPending(''); }
  };

  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => { setOpen(true); void run('inspect'); }}>
      <Link className="mr-1 h-3.5 w-3.5" />Gerar link de conexão
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp por link</DialogTitle>
          <DialogDescription>Envie o link para o responsável pelo canal {instance.name || 'WhatsApp'}. Ele poderá ler o QR code ou conectar usando um código pelo número.</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">O link vale por 24 horas e encerra o pareamento ao conectar. Ele libera somente a conexão deste canal. Envie apenas ao responsável pelo WhatsApp.</p>
        {active ? <p className="text-sm">{active.completed_at ? 'Este link já concluiu a conexão.' : 'Há um link válido para este canal.'} Válido até {new Date(active.expires_at).toLocaleString('pt-BR')}.</p> : null}
        {link ? <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor={`connection-link-${instance.id}`}>Link para enviar</label>
          <Input id={`connection-link-${instance.id}`} readOnly value={link} onFocus={(event) => event.target.select()} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={async () => {
              try { await navigator.clipboard.writeText(link); toast({ title: 'Link copiado' }); }
              catch { setError('Selecione o link acima e copie manualmente.'); }
            }}><Copy className="mr-2 h-4 w-4" />Copiar link</Button>
            <Button type="button" variant="outline" asChild><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir página</a></Button>
          </div>
        </div> : null}
        {active ? <p className="text-xs text-muted-foreground">Gerar outro link desativa o anterior. Para copiar novamente depois de fechar esta página, gere um novo link.</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          {active ? <Button type="button" variant="outline" disabled={!!pending} onClick={() => void run('revoke')}>Revogar link</Button> : null}
          <Button type="button" disabled={!!pending} onClick={() => void run('issue')}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link className="mr-2 h-4 w-4" />}
            {active ? 'Gerar novo link' : 'Gerar link'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
