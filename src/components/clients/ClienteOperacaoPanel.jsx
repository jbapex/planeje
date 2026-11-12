import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Loader2, MessageSquare, Pencil, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ClienteMetaResumoCell from '@/components/traffic/ClienteMetaResumoCell';
import TrafegoVincularGrupoDialog from '@/components/traffic/TrafegoVincularGrupoDialog';
import { formatAtendimentoTime } from '@/hooks/useAtendimentoConversations';
import { buildClientEditUrl, buildClientTrafficUrl } from '@/lib/clientHubRoutes';
import { cn } from '@/lib/utils';

export default function ClienteOperacaoPanel({ client, operacao }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { loading, grupo, grupoConv, grupoUrl, metaLabel, meta, reload } = operacao || {};
  const row = { client: { id: client.id, empresa: client.empresa } };

  return (
    <section className="planeje-client-hub-ops">
      <div className={cn('planeje-client-hub-ops-card', !grupoUrl && 'is-warn')}>
        <p className="planeje-client-hub-kpi-label">Grupo WhatsApp</p>
        {loading ? (
          <p className="planeje-client-hub-ops-loading">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : grupoUrl ? (
          <>
            <p className="planeje-client-hub-kpi-value planeje-client-hub-ops-title">
              {grupo.display_name || 'Grupo vinculado'}
            </p>
            <p className="planeje-client-hub-kpi-sub">
              {grupoConv?.last_message_preview
                ? `${grupoConv.last_message_preview}${grupoConv.last_message_at ? ` · ${formatAtendimentoTime(grupoConv.last_message_at)}` : ''}`
                : 'Grupo da equipe com este cliente'}
            </p>
            <div className="planeje-client-hub-ops-actions">
              <Button size="sm" variant="outline" asChild>
                <Link to={grupoUrl}>
                  <MessageSquare className="h-3.5 w-3.5 mr-1" />
                  Abrir grupo
                </Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialogOpen(true)}>
                Trocar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="planeje-client-hub-kpi-value planeje-client-hub-ops-title">Nenhum grupo</p>
            <p className="planeje-client-hub-kpi-sub">Escolha o WhatsApp da equipe com este cliente.</p>
            <div className="planeje-client-hub-ops-actions">
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                Vincular grupo
              </Button>
            </div>
          </>
        )}
      </div>

      <div className={cn('planeje-client-hub-ops-card', metaLabel.tone === 'danger' && 'is-danger', metaLabel.tone === 'warn' && 'is-warn')}>
        <p className="planeje-client-hub-kpi-label">Meta Ads (mês)</p>
        {loading && metaLabel.tone === 'muted' ? (
          <p className="planeje-client-hub-ops-loading">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : (
          <>
            <p className="planeje-client-hub-kpi-value planeje-client-hub-ops-title">{metaLabel.title}</p>
            <p className="planeje-client-hub-kpi-sub">{metaLabel.sub}</p>
            {meta?.snapshot ? <ClienteMetaResumoCell snapshot={meta.snapshot} compact /> : null}
            <div className="planeje-client-hub-ops-actions">
              <Button size="sm" variant="outline" asChild>
                <Link to={buildClientTrafficUrl(client.id)}>
                  <Rocket className="h-3.5 w-3.5 mr-1" />
                  Campanhas
                </Link>
              </Button>
              {!operacao?.meta?.accounts?.length ? (
                <Button size="sm" variant="ghost" asChild>
                  <Link to={buildClientEditUrl(client.id)} state={{ backOnClose: true }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Vincular conta
                  </Link>
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <TrafegoVincularGrupoDialog
        row={row}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={reload}
      />
    </section>
  );
}
