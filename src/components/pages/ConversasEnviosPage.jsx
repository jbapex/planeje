import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAtendimentoMaterialLogGlobal } from '@/hooks/useAtendimentoMaterialLogGlobal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  BarChart3,
  ExternalLink,
  FileText,
  Image,
  Link2,
  Loader2,
  MessageSquare,
  Music,
  RefreshCw,
  Search,
  Send,
  Users,
  Video,
} from 'lucide-react';
import {
  CONVERSAS_DEFAULT_PATH,
  buildConversasUrl,
} from '@/lib/conversasRoutes';
import {
  AUDIENCE_FILTER_OPTIONS,
  PERIOD_FILTER_OPTIONS,
  SEND_KIND_FILTER_OPTIONS,
  formatMaterialLogTime,
  sendKindLabel,
} from '@/lib/atendimentoMaterialLog';
import '@/components/atendimento/Atendimento.css';

function KindIcon({ kind }) {
  const cls = 'h-4 w-4 shrink-0 text-[#54656f]';
  if (kind === 'image') return <Image className={cls} />;
  if (kind === 'document') return <FileText className={cls} />;
  if (kind === 'audio') return <Music className={cls} />;
  if (kind === 'video') return <Video className={cls} />;
  if (kind === 'link') return <Link2 className={cls} />;
  return <MessageSquare className={cls} />;
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`wa-envios-stat ${accent ? 'wa-envios-stat--accent' : ''}`}>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-[#667781] mt-1">{label}</p>
    </div>
  );
}

export default function ConversasEnviosPage() {
  const {
    effectiveClienteId,
    isAdminWithoutCliente,
    conversasAccessMissing,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
  } = useClienteWhatsAppConfig({ forConversas: true });

  const [days, setDays] = useState('30');
  const [sendKind, setSendKind] = useState('all');
  const [sentBy, setSentBy] = useState('all');
  const [audience, setAudience] = useState('all');
  const [search, setSearch] = useState('');

  const { entries, loading, stats, agents, reload } = useAtendimentoMaterialLogGlobal({
    clienteId: effectiveClienteId,
    days: Number(days),
    sendKind,
    sentBy,
    audience,
    search,
  });

  const typeBreakdown = useMemo(
    () =>
      SEND_KIND_FILTER_OPTIONS.filter((o) => o.value !== 'all' && stats[o.value] > 0).map((o) => ({
        ...o,
        count: stats[o.value],
      })),
    [stats]
  );

  if (conversasAccessMissing) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Seu usuário ainda não tem acesso ao atendimento. Peça ao superadmin para vincular você nas filas e canais da operação.
        </p>
      </div>
    );
  }

  if (!effectiveClienteId && !isAdminWithoutCliente) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Operação de atendimento não identificada.</p>
      </div>
    );
  }

  return (
    <div className="wa-atendimento wa-envios-page flex flex-col flex-1 min-h-0 h-full max-w-6xl mx-auto w-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 h-8" asChild>
            <Link to={CONVERSAS_DEFAULT_PATH}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar para Conversas
            </Link>
          </Button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[var(--wa-active)]" />
            Relatório de envios
          </h1>
          <p className="text-sm text-[#667781] mt-1">
            Tudo que a equipe mandou pelo WhatsApp — textos, links e arquivos.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {isAdminWithoutCliente && clientesForAdmin?.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Operação</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedClienteId || ''} onValueChange={(v) => setSelectedClienteId(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientesForAdmin.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.empresa || c.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        <StatCard label="Total de envios" value={stats.total || 0} accent />
        <StatCard label="Imagens" value={stats.image || 0} />
        <StatCard label="Documentos" value={stats.document || 0} />
        <StatCard label="Links" value={stats.link || 0} />
        <StatCard label="Textos" value={stats.text || 0} />
        <StatCard label="Áudios" value={stats.audio || 0} />
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>Refine por período, tipo, atendente ou clientes da base.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sendKind} onValueChange={setSendKind}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEND_KIND_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCE_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sentBy} onValueChange={setSentBy}>
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue placeholder="Atendente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos atendentes</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name || a.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contato ou material..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </CardContent>
      </Card>

      {typeBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {typeBreakdown.map((t) => (
            <Badge key={t.value} variant="secondary" className="text-xs">
              {t.label}: {t.count}
            </Badge>
          ))}
        </div>
      )}

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" />
            Envios ({entries.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-auto p-0">
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando envios…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16 px-4">
              Nenhum envio encontrado com estes filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="wa-envios-table w-full text-sm">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Contato</th>
                    <th>Tipo</th>
                    <th>Material</th>
                    <th>Atendente</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row) => {
                    const contactLabel =
                      row.contactName || row.chatJid?.replace(/@.*$/, '') || '—';
                    return (
                      <tr key={`${row.source}-${row.id}`}>
                        <td className="whitespace-nowrap text-[#667781] text-xs">
                          {formatMaterialLogTime(row.at)}
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 min-w-0">
                            {row.isGroup && <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                            <span className="truncate max-w-[140px] font-medium" title={contactLabel}>
                              {contactLabel}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <KindIcon kind={row.sendKind} />
                            {sendKindLabel(row.sendKind)}
                          </span>
                        </td>
                        <td>
                          <span className="truncate max-w-[220px] block text-foreground" title={row.fileName || row.label}>
                            {row.fileName || row.label}
                          </span>
                        </td>
                        <td className="text-xs text-[#667781] truncate max-w-[100px]">
                          {row.agentName || '—'}
                        </td>
                        <td className="text-right">
                          {row.chatJid && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                              <Link to={buildConversasUrl({ chatJid: row.chatJid })}>
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                Chat
                              </Link>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
