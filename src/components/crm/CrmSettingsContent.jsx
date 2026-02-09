import React, { useState, useEffect, useRef } from 'react';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PipelineEditor from '@/components/crm/PipelineEditor';
import ClientUserManager from '@/components/admin/ClientUserManager';
import { Loader2, Plus, Trash2, Info, Pencil, Check, Users } from 'lucide-react';

const maskToken = (token) => {
  if (!token || typeof token !== 'string') return '••••••••';
  if (token.length <= 4) return '••••••••';
  return '••••••••' + token.slice(-4);
};

/** Lista read-only dos membros (usuários do cliente) para o cliente ver quem tem acesso; só superadmin pode gerenciar. */
function ClientMembersCard({ effectiveClienteId, cardClass, headerClass, titleClass, descClass }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!effectiveClienteId) return;
    setLoading(true);
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('cliente_id', effectiveClienteId)
      .eq('role', 'cliente')
      .order('full_name')
      .then(({ data, error }) => {
        setLoading(false);
        if (!error) setMembers(data || []);
      });
  }, [effectiveClienteId]);

  if (!effectiveClienteId) return null;

  return (
    <Card className={cardClass}>
      <CardHeader className={headerClass}>
        <CardTitle className={titleClass}>Membros da equipe</CardTitle>
        <CardDescription className={descClass}>
          Pessoas com acesso a esta área. Você pode atribuir qualquer um deles como responsável nos leads (ao criar ou editar um lead).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-3 sm:p-4 pt-0">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando...</span>
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum membro vinculado a esta conta.</p>
        ) : (
          <ul className="space-y-1.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{m.full_name || 'Sem nome'}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function CrmSettingsContent() {
  const { profile } = useAuth();
  const { settings, loading, saving, updateSettings, fetchSettings } = useClienteCrmSettings();
  const { toast } = useToast();
  const [statuses, setStatuses] = useState([]);
  const [tags, setTags] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [whatsappSubdomain, setWhatsappSubdomain] = useState('');
  const [whatsappToken, setWhatsappToken] = useState('');
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [whatsappTokenMasked, setWhatsappTokenMasked] = useState('');
  const existingTokenRef = useRef(null);

  useEffect(() => {
    if (settings) {
      setStatuses(Array.isArray(settings.statuses) ? settings.statuses.map((s) => ({ ...s })) : []);
      setTags(Array.isArray(settings.tags) ? settings.tags.map((t) => ({ ...t })) : []);
      setOrigins(Array.isArray(settings.origins) ? [...settings.origins] : []);
      setSellers(Array.isArray(settings.sellers) ? [...settings.sellers] : []);
    }
  }, [settings]);

  const effectiveClienteId = profile?.cliente_id;
  const {
    pipelines,
    pipeline,
    stages,
    loading: pipelineLoading,
    currentPipelineId,
    setCurrentPipelineId,
    refetch: refetchPipeline,
    createPipeline,
    updatePipeline,
    createStage,
    updateStage,
    reorderStages,
    deletePipeline,
    deleteStage,
  } = useCrmPipeline();
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [editorPipeline, setEditorPipeline] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showUserManager, setShowUserManager] = useState(false);
  const [clientEmpresa, setClientEmpresa] = useState('');

  useEffect(() => {
    if (!effectiveClienteId) return;
    let cancelled = false;
    supabase
      .from('clientes')
      .select('empresa')
      .eq('id', effectiveClienteId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setClientEmpresa(data.empresa || '');
      });
    return () => { cancelled = true; };
  }, [effectiveClienteId]);

  useEffect(() => {
    if (!effectiveClienteId) return;
    let cancelled = false;
    setWhatsappLoading(true);
    supabase
      .from('cliente_whatsapp_config')
      .select('subdomain, token')
      .eq('cliente_id', effectiveClienteId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setWhatsappLoading(false);
        if (error) {
          toast({ variant: 'destructive', title: 'Erro ao carregar WhatsApp', description: error.message });
          return;
        }
        if (data) {
          setWhatsappSubdomain(data.subdomain || '');
          setWhatsappConfigured(!!(data.subdomain || data.token));
          existingTokenRef.current = data.token || null;
          setWhatsappTokenMasked(data.token ? maskToken(data.token) : '');
        } else {
          setWhatsappConfigured(false);
          existingTokenRef.current = null;
          setWhatsappTokenMasked('');
        }
      });
    return () => { cancelled = true; };
  }, [effectiveClienteId, toast]);

  const handleSaveWhatsapp = async () => {
    if (!effectiveClienteId) {
      toast({ variant: 'destructive', title: 'Cliente não identificado', description: 'Faça login como cliente para salvar.' });
      return;
    }
    const subdomain = (whatsappSubdomain || '').trim();
    if (!subdomain) {
      toast({ variant: 'destructive', title: 'Subdomínio obrigatório', description: 'Informe o subdomínio da sua instância uazapi.' });
      return;
    }
    const tokenToSave = (whatsappToken || '').trim() || existingTokenRef.current;
    if (!tokenToSave) {
      toast({ variant: 'destructive', title: 'Token obrigatório', description: 'Informe o token da sua instância uazapi.' });
      return;
    }
    setWhatsappSaving(true);
    const { error } = await supabase
      .from('cliente_whatsapp_config')
      .upsert(
        {
          cliente_id: effectiveClienteId,
          provider: 'uazapi',
          subdomain,
          token: tokenToSave,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'cliente_id' }
      );
    setWhatsappSaving(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
      return;
    }
    existingTokenRef.current = tokenToSave;
    setWhatsappConfigured(true);
    setWhatsappTokenMasked(maskToken(tokenToSave));
    setWhatsappToken('');
    toast({ title: 'Configuração salva', description: 'Conexão WhatsApp atualizada com sucesso.' });
  };

  const handleAddStatus = () => {
    setStatuses((p) => [...p, { name: '', color: '#6b7280' }]);
  };

  const handleRemoveStatus = (i) => {
    setStatuses((p) => p.filter((_, idx) => idx !== i));
  };

  const handleStatusChange = (i, field, value) => {
    setStatuses((p) => p.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  };

  const handleAddTag = () => setTags((p) => [...p, { name: '', color: '#6b7280' }]);
  const handleRemoveTag = (i) => setTags((p) => p.filter((_, idx) => idx !== i));
  const handleTagChange = (i, field, value) => {
    setTags((p) => p.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  };

  const handleAddOrigin = () => {
    setOrigins((p) => [...p, '']);
  };

  const handleRemoveOrigin = (i) => {
    setOrigins((p) => p.filter((_, idx) => idx !== i));
  };

  const handleOriginChange = (i, value) => {
    setOrigins((p) => p.map((o, idx) => (idx === i ? value : o)));
  };

  const handleAddSeller = () => {
    setSellers((p) => [...p, '']);
  };

  const handleRemoveSeller = (i) => {
    setSellers((p) => p.filter((_, idx) => idx !== i));
  };

  const handleSellerChange = (i, value) => {
    setSellers((p) => p.map((s, idx) => (idx === i ? value : s)));
  };

  const handleSave = async () => {
    const validStatuses = statuses.filter((s) => s.name?.trim()).map((s) => ({ name: (s.name || '').trim().replace(/\s+/g, '_'), color: s.color || '#6b7280' }));
    const validTags = tags.filter((t) => t.name?.trim()).map((t) => ({ name: (t.name || '').trim().replace(/\s+/g, '_'), color: t.color || '#6b7280' }));
    const validOrigins = origins.map((o) => (o || '').trim()).filter(Boolean);
    const validSellers = sellers.map((s) => (s || '').trim()).filter(Boolean);
    if (validStatuses.length === 0) {
      toast({ variant: 'destructive', title: 'Status obrigatório', description: 'Adicione pelo menos um status no card Status padrão.' });
      return;
    }
    const ok = await updateSettings(
      { ...settings, statuses: validStatuses, tags: validTags, origins: validOrigins, sellers: validSellers },
      true
    );
    if (ok) await fetchSettings();
  };

  /** Cria um funil (pipeline + etapas) a partir dos status atuais. */
  const handleCreatePipelineFromStatuses = async () => {
    const validStatuses = statuses.filter((s) => s.name?.trim()).map((s) => ({
      name: (s.name || '').trim().replace(/\s+/g, '_'),
      color: s.color || '#6b7280',
    }));
    if (validStatuses.length === 0) {
      toast({ variant: 'destructive', title: 'Adicione pelo menos um status', description: 'Configure os status do funil abaixo e clique novamente em "Criar funil".' });
      return;
    }
    if (!effectiveClienteId) {
      toast({ variant: 'destructive', title: 'Cliente não identificado', description: 'Faça login como cliente.' });
      return;
    }
    setCreatingPipeline(true);
    try {
      const { data: newPipeline, error: errPipe } = await supabase
        .from('crm_pipelines')
        .insert({
          cliente_id: effectiveClienteId,
          nome: 'Pipeline principal',
          descricao: 'Funil criado a partir dos status configurados.',
        })
        .select('id')
        .single();
      if (errPipe) throw errPipe;
      const pipelineId = newPipeline.id;

      const stageIds = [];
      for (let i = 0; i < validStatuses.length; i++) {
        const s = validStatuses[i];
        const nome = s.name;
        const tipo =
          ['vendeu', 'ganho', 'fechado_ganho'].some((x) => nome.toLowerCase() === x)
            ? 'ganho'
            : ['nao_compareceu', 'perdido', 'fechado_perdido'].some((x) => nome.toLowerCase() === x)
              ? 'perdido'
              : 'intermediaria';
        const { data: newStage, error: errStage } = await supabase
          .from('crm_stages')
          .insert({
            pipeline_id: pipelineId,
            nome,
            ordem: i,
            tipo,
            color: s.color || '#6b7280',
          })
          .select('id')
          .single();
        if (errStage) throw errStage;
        stageIds.push({ id: newStage.id, nome, tipo });
      }

      const firstStageId = stageIds[0]?.id;
      const now = new Date().toISOString();
      const { data: leadsToUpdate } = await supabase.from('leads').select('id, status').eq('cliente_id', effectiveClienteId);
      if (leadsToUpdate?.length) {
        for (const lead of leadsToUpdate) {
          const stage = stageIds.find((st) => st.nome === lead.status) || stageIds[0];
          const statusVida = stage?.tipo === 'ganho' ? 'ganho' : stage?.tipo === 'perdido' ? 'perdido' : 'ativo';
          await supabase
            .from('leads')
            .update({
              pipeline_id: pipelineId,
              stage_id: stage?.id ?? firstStageId,
              status: stage?.nome ?? lead.status,
              status_vida: statusVida,
              stage_entered_at: now,
              updated_at: now,
            })
            .eq('id', lead.id);
        }
      }

      await refetchPipeline();
      toast({ title: 'Funil criado', description: 'O pipeline e as etapas foram criados. O Kanban passará a usá-los.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao criar funil', description: e?.message || String(e) });
    } finally {
      setCreatingPipeline(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cardClass = 'dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm rounded-xl';
  const headerClass = 'p-3 sm:p-4';
  const titleClass = 'text-sm font-semibold dark:text-white';
  const descClass = 'text-xs text-muted-foreground dark:text-gray-400 mt-0.5';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full min-w-0 pb-10 auto-rows-min">
      <Card className={`${cardClass} md:col-span-2`}>
        <CardHeader className={headerClass}>
          <CardTitle className={titleClass}>Funis</CardTitle>
          <CardDescription className={descClass}>
            Crie e edite funis de vendas. O funil em uso define as colunas do Kanban na aba Leads. Clique em &quot;Usar este&quot; para ver os leads desse funil.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
          {pipelineLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Carregando funis...</span>
            </div>
          ) : pipelines.length === 0 ? (
            <div className="py-4 space-y-2">
              <p className="text-sm text-muted-foreground">Nenhum funil ainda. Crie o primeiro para usar o Kanban por etapas.</p>
              <Button type="button" onClick={() => setEditorPipeline({})}>
                <Plus className="h-4 w-4 mr-2" />
                Novo funil
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {pipelines.map((pip) => (
                <div
                  key={pip.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <span className="font-medium text-sm">{(pip.nome || 'Sem nome').replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={currentPipelineId === pip.id ? 'text-primary' : ''}
                      onClick={() => setCurrentPipelineId(pip.id)}
                      title={currentPipelineId === pip.id ? 'Em uso' : 'Usar este funil'}
                    >
                      {currentPipelineId === pip.id ? <Check className="h-4 w-4" /> : 'Usar este'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditorPipeline(pip)}
                      title="Editar funil"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(pip)}
                      title="Excluir funil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setEditorPipeline({})}>
                <Plus className="h-4 w-4 mr-2" />
                Novo funil
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {effectiveClienteId && !pipelineLoading && pipelines.length === 0 && (
        <Alert variant="default" className="md:col-span-2 border-amber-500/50 bg-amber-500/10 dark:bg-amber-500/10">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-500" />
          <AlertTitle>Alternativa: criar a partir dos status</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Você também pode preencher os status no card &quot;Status padrão&quot; abaixo e usar o botão para criar um funil com essas etapas.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-2"
              disabled={creatingPipeline || statuses.filter((s) => s.name?.trim()).length === 0}
              onClick={handleCreatePipelineFromStatuses}
            >
              {creatingPipeline ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar funil a partir dos status
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <PipelineEditor
        open={editorPipeline !== null}
        onOpenChange={(open) => !open && setEditorPipeline(null)}
        pipeline={editorPipeline && editorPipeline.id ? editorPipeline : null}
        onSaved={() => refetchPipeline()}
        createPipeline={createPipeline}
        updatePipeline={updatePipeline}
        createStage={createStage}
        updateStage={updateStage}
        reorderStages={reorderStages}
        deleteStage={deleteStage}
        refetch={refetchPipeline}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funil?</AlertDialogTitle>
            <AlertDialogDescription>
              O funil &quot;{(deleteTarget?.nome || '').replace(/_/g, ' ')}&quot; será excluído. Os leads desse funil ficarão sem funil atribuído. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget?.id) {
                  await deletePipeline(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className={cardClass}>
        <CardHeader className={headerClass}>
          <CardTitle className={titleClass}>Etiquetas</CardTitle>
          <CardDescription className={descClass}>
            Rótulos opcionais para classificar leads (ex: quente, prioritário, meta-ads). Você pode atribuir várias etiquetas a cada lead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
          {tags.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Nome da etiqueta (ex: quente)"
                value={(t.name || '').replace(/_/g, ' ')}
                onChange={(e) => handleTagChange(i, 'name', e.target.value.replace(/\s+/g, '_'))}
                className="flex-1"
              />
              <input
                type="color"
                value={t.color || '#6b7280'}
                onChange={(e) => handleTagChange(i, 'color', e.target.value)}
                className="h-10 w-14 rounded border cursor-pointer"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveTag(i)} title="Remover">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar etiqueta
          </Button>
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className={headerClass}>
          <CardTitle className={titleClass}>Origem dos leads</CardTitle>
          <CardDescription className={descClass}>Canais de origem (ex: instagram, facebook, whatsapp) para usar ao cadastrar leads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
          {origins.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Origem (ex: instagram)"
                value={o}
                onChange={(e) => handleOriginChange(i, e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveOrigin(i)} title="Remover">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={handleAddOrigin}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar origem
          </Button>
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className={headerClass}>
          <CardTitle className={titleClass}>Status padrão (quando não há funil)</CardTitle>
          <CardDescription className={descClass}>
            Status que seus leads podem ter quando não há pipeline em uso (ex: agendado, compareceu, vendeu). O Kanban usa as etapas do funil quando disponível.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
          {statuses.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Nome do status (ex: agendado)"
                value={(s.name || '').replace(/_/g, ' ')}
                onChange={(e) => handleStatusChange(i, 'name', e.target.value.replace(/\s+/g, '_'))}
                className="flex-1"
              />
              <input
                type="color"
                value={s.color || '#6b7280'}
                onChange={(e) => handleStatusChange(i, 'color', e.target.value)}
                className="h-10 w-14 rounded border cursor-pointer"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveStatus(i)} title="Remover">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={handleAddStatus}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar status
          </Button>
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className={headerClass}>
          <CardTitle className={titleClass}>Vendedores</CardTitle>
          <CardDescription className={descClass}>Lista de vendedores para associar aos leads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
          {sellers.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Nome do vendedor"
                value={s}
                onChange={(e) => handleSellerChange(i, e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveSeller(i)} title="Remover">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={handleAddSeller}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar vendedor
          </Button>
        </CardContent>
      </Card>

      {profile?.role === 'superadmin' && (
        <Card className={cardClass}>
          <CardHeader className={headerClass}>
            <CardTitle className={titleClass}>Usuários do cliente</CardTitle>
            <CardDescription className={descClass}>
              Crie e gerencie usuários (logins) vinculados a este cliente. Apenas super admin pode criar e editar permissões. O cliente só vê a lista de membros e pode atribuir responsáveis aos leads.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUserManager(true)}
              className="w-full sm:w-auto"
            >
              <Users className="h-4 w-4 mr-2" />
              Gerenciar usuários
            </Button>
          </CardContent>
        </Card>
      )}

      <ClientMembersCard effectiveClienteId={effectiveClienteId} cardClass={cardClass} headerClass={headerClass} titleClass={titleClass} descClass={descClass} />

      <Button onClick={handleSave} disabled={saving} className="md:col-span-2 w-full sm:w-auto">
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Salvando...
          </>
        ) : (
          'Salvar configurações'
        )}
      </Button>

      {showUserManager && effectiveClienteId && profile?.role === 'superadmin' && (
        <ClientUserManager
          clientId={effectiveClienteId}
          clientName={clientEmpresa || 'Sua empresa'}
          onClose={() => setShowUserManager(false)}
        />
      )}
    </div>
  );
}
