import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar,
  CheckCircle,
  Clock,
  User,
  Building2,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TaskDetail from '@/components/tasks/TaskDetail';
import ClientOverview from '@/components/social/ClientOverview';
import ClientSocialProfile from '@/components/social/ClientSocialProfile';
import ContentPublisher from '@/components/social/ContentPublisher';
import SocialPlanner from '@/components/social/SocialPlanner';
import SocialClientBoard from '@/components/social/SocialClientBoard';
import SocialPublicationCard from '@/components/social/SocialPublicationCard';
import { createSocialMediaLoader, fetchSocialMediaData } from '@/lib/socialMediaData';
import { metaConnectionFromCheckResponse } from '@/lib/metaConnectionStatus';
import {
  checkTaskPublicationCompletion,
  publicationToSocialTask,
  SOCIAL_PUBLICATION_STATUS_OPTIONS,
} from '@/lib/taskChannelPublications';
import {
  driveFileFromAttachment,
  driveFileIdFromAttachment,
} from '@/lib/googleDriveMedia';
import { accountsByPlatform, fetchClienteSocialAccounts, platformForChannel } from '@/lib/clienteSocialAccounts';
import { attachDriveMediaForMeta, META_VIDEO_MAX_BYTES } from '@/lib/metaPublishMedia';
import { invokeGoogleDrive } from '@/lib/googleDriveClient';
import {
  composerWhenFromPublication,
  driveFileFromPublication,
  publicationIgFormat,
  publicationLooksLikeVideo,
  socialQueueCardAction,
} from '@/lib/socialQueueOpen';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
import '@/components/social/SocialWorkspace.css';

function toPublisherAccount(row) {
  return {
    id: row.meta_id,
    name: row.display_name || row.username || row.meta_id,
    username: row.username || '',
    profile_picture_url: row.profile_picture_url || null,
  };
}

function QueueComposerDialog({ composer, onClose, onSuccess }) {
  if (!composer) return null;
  const { pages, instagram } = accountsByPlatform(composer.accounts || []);
  const publisherPages = pages.map(toPublisherAccount);
  const publisherIg = instagram.map(toPublisherAccount);
  const isIg = platformForChannel(composer.publication.channel) === 'instagram';
  const dispatch = composer.publication.meta_dispatch || {};
  const when = composerWhenFromPublication(composer.publication);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="meta-composer-dialog max-h-[94vh] max-w-6xl overflow-hidden p-0 sm:p-0">
        <DialogHeader className="px-5 pt-5 pb-2 sm:px-6 shrink-0">
          <DialogTitle>
            {composer.publication.status === 'published'
              ? 'Post publicado'
              : when.whenMode === 'schedule'
                ? 'Agendar'
                : 'Publicar'}
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6 overflow-y-auto max-h-[calc(94vh-3.5rem)]">
          <ContentPublisher
            type={isIg ? 'instagram' : 'pages'}
            pages={publisherPages}
            instagramAccounts={publisherIg}
            selectedPage={dispatch.pageId || publisherPages[0]?.id || ''}
            selectedInstagram={dispatch.instagramAccountId || publisherIg[0]?.id || ''}
            clientId={composer.clientId}
            initialFormat={publicationIgFormat(composer.publication)}
            initialCaption={composer.publication.caption || ''}
            initialMedia={composer.media}
            initialWhenMode={when.whenMode}
            initialScheduledTime={when.scheduledTime}
            initialCoverMode={dispatch.coverMode || 'auto'}
            initialThumbOffsetSec={Number(dispatch.thumbOffsetMs || 0) / 1000}
            existingPublicationId={composer.publication.id}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

let socialMediaChannelSequence = 0;

const MAIN_TABS = new Set([
  'overview',
  'calendar',
  'pending',
  'scheduled',
  'completed',
  'meta-business',
]);

function QueueBoard({ items, emptyLabel, users, statusOptions, onOpen, onRetryDone }) {
  return (
    <div className="social-ws-shell">
      <div className="social-ws-grid">
        {items.length > 0
          ? items.map((task) => (
              <SocialPublicationCard
                key={task.id}
                task={task}
                users={users}
                statusOptions={statusOptions}
                onOpen={onOpen}
                onRetryDone={onRetryDone}
              />
            ))
          : <p className="social-ws-empty">{emptyLabel}</p>}
      </div>
    </div>
  );
}

const SocialMedia = () => {
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [publications, setPublications] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const loaderRef = useRef(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [queueComposer, setQueueComposer] = useState(null);
  const [openingQueueId, setOpeningQueueId] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const taskIdFromUrl = searchParams.get('task');
  const tabFromUrl = MAIN_TABS.has(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'overview';
  const clientFromUrl = searchParams.get('client') || 'all';

  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [metaConnectionStatus, setMetaConnectionStatus] = useState('checking');
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const profileRoleRef = useRef(profile?.role);
  profileRoleRef.current = profile?.role;
  const hasLoadedRef = useRef(false);

  const patchSearch = useCallback((mutator) => {
    const next = new URLSearchParams(searchParams);
    mutator(next);
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const clientFilter = clientFromUrl && clientFromUrl !== 'all' ? clientFromUrl : 'all';
  const selectedClient = useMemo(() => {
    if (clientFilter === 'all') return 'all';
    if (!clients.length) return 'all';
    return clients.some((c) => c.id === clientFilter) ? clientFilter : 'all';
  }, [clientFilter, clients]);

  useEffect(() => {
    if (!clients.length) return;
    if (clientFromUrl !== 'all' && clientFromUrl && !clients.some((c) => c.id === clientFromUrl)) {
      patchSearch((next) => {
        next.delete('client');
      });
    }
  }, [clients, clientFromUrl, patchSearch]);

  const setSelectedClient = useCallback((clientId) => {
    patchSearch((next) => {
      if (!clientId || clientId === 'all') next.delete('client');
      else next.set('client', clientId);
    });
  }, [patchSearch]);

  const setMainTab = useCallback((tabId, clientId) => {
    patchSearch((next) => {
      if (clientId !== undefined) {
        if (!clientId || clientId === 'all') next.delete('client');
        else next.set('client', clientId);
      }
      if (!tabId || tabId === 'overview') next.delete('tab');
      else next.set('tab', tabId);
      if (tabId !== 'meta-business') {
        next.delete('platform');
        next.delete('view');
        next.delete('account');
        next.delete('feed');
        next.delete('from');
        next.delete('to');
        next.delete('post');
      }
    });
  }, [patchSearch]);

  useEffect(() => {
    const loader = createSocialMediaLoader({
      load: (signal) => fetchSocialMediaData(supabase, { signal }),
      onLoading: (value) => {
        if (value && hasLoadedRef.current) {
          setLoadError(null);
          return;
        }
        setLoading(value);
        if (value) setLoadError(null);
      },
      onData: (data) => {
        setClients(data.clients);
        setTasks(data.tasks);
        setPublications(data.publications || []);
        setProjects(data.projects);
        setUsers(data.users);
        setStatusOptions(data.statusOptions);
        hasLoadedRef.current = true;
        setHasLoaded(true);
      },
      onError: (error) => {
        const message = error?.message || 'Não foi possível carregar os dados.';
        setLoadError(message);
        toast({ title: 'Erro ao buscar dados', description: message, variant: 'destructive' });
      },
    });
    loaderRef.current = loader;
    return () => {
      loader.dispose();
      if (loaderRef.current === loader) loaderRef.current = null;
    };
  }, [toast]);

  const fetchData = useCallback(() => loaderRef.current?.run(), []);
  const refreshData = useCallback(() => loaderRef.current?.run({ coalesce: true }), []);
  const handleRetryDone = useCallback(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    let discarded = false;
    setMetaConnectionStatus('checking');
    setIsCheckingConnection(true);
    const timer = setTimeout(() => {
      if (discarded) return;
      setIsCheckingConnection(false);
    }, 15000);
    const checkConnection = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('meta-ads-api', {
          body: { action: 'check-connection' },
        });
        const next = metaConnectionFromCheckResponse({ discarded, data, error });
        if (!next.apply) return;
        setMetaConnectionStatus(next.status);
        if (next.status === 'disconnected' && profileRoleRef.current === 'superadmin') {
          toast({
            title: 'Conexão com Meta Business inativa',
            description: 'O token de acesso do System User não foi configurado ou é inválido. Configure-o no Vault.',
            variant: 'destructive',
          });
        }
      } catch {
        const next = metaConnectionFromCheckResponse({ discarded, error: true });
        if (next.apply) setMetaConnectionStatus(next.status);
      } finally {
        clearTimeout(timer);
        if (!discarded) setIsCheckingConnection(false);
      }
    };
    void checkConnection();
    return () => { discarded = true; clearTimeout(timer); };
  }, [toast]);

  useEffect(() => {
    if (!user?.id) return undefined;
    void fetchData();
    let refreshTimer = null;
    let channel;
    let active = true;
    const scheduleRefresh = () => {
      if (!active) return;
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { if (active) void refreshData(); }, 2500);
    };
    const onPublicationChange = (payload) => {
      const row = payload?.new;
      if (row?.id && (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT')) {
        setPublications((prev) => {
          const idx = prev.findIndex((item) => item.id === row.id);
          if (idx < 0) {
            scheduleRefresh();
            return prev;
          }
          const next = prev.slice();
          const current = next[idx];
          next[idx] = {
            ...current,
            ...row,
            task: current.task,
            assignee: current.assignee,
          };
          return next;
        });
      }
      scheduleRefresh();
    };
    try {
      channel = supabase.channel(`realtime-social-media-tasks:${++socialMediaChannelSequence}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas', filter: 'type=in.(post,reels,story,social_media)' }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_channel_publications' }, onPublicationChange);
      channel.subscribe();
    } catch {
      // REST load still works without Realtime.
    }
    return () => {
      active = false;
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      if (channel) {
        try { Promise.resolve(supabase.removeChannel(channel)).catch(() => {}); } catch { /* already closed */ }
      }
    };
  }, [user?.id, fetchData, refreshData]);

  const filteredTasks = tasks.filter(task => clientFilter === 'all' || task.client_id === clientFilter);
  const filteredPublications = publications.filter(publication => (
    clientFilter === 'all' || publication.task?.client_id === clientFilter
  ));
  const publicationTasks = filteredPublications.map(publicationToSocialTask);
  const tasksWithPublications = new Set(filteredPublications.map(publication => publication.task_id));
  const legacyTasks = filteredTasks.filter(task => !tasksWithPublications.has(task.id));
  const combinedStatusOptions = [...statusOptions, ...SOCIAL_PUBLICATION_STATUS_OPTIONS];
  const pendingPublicationTasks = publicationTasks.filter(task => ['publication_pending', 'publication_failed'].includes(task.status));
  const scheduledTasks = [
    ...publicationTasks.filter(task => task.status === 'publication_scheduled'),
    ...legacyTasks.filter(task => task.status === 'scheduled'),
  ];
  const completedTasks = [
    ...publicationTasks.filter(task => ['publication_published', 'publication_client_posts'].includes(task.status)),
    ...legacyTasks.filter(task => task.status === 'completed'),
  ];

  const handleOpenTask = (task) => {
    const target = task.isChannelPublication ? task.parentTask : task;
    setSelectedTask(target);
    if (target?.id) {
      patchSearch((next) => {
        next.set('task', target.id);
      });
    }
  };

  const handleCloseTask = () => {
    setSelectedTask(null);
    if (taskIdFromUrl) {
      patchSearch((next) => {
        next.delete('task');
      });
    }
  };

  const resolvePublicationDriveFile = useCallback(async (publication) => {
    const fromPub = driveFileFromPublication(publication);
    if (fromPub?.id) return fromPub;
    if (!publication?.id) return null;
    const { data: byPub } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('publication_id', publication.id)
      .order('created_at', { ascending: false })
      .limit(8);
    const linked = (byPub || []).find((item) => driveFileIdFromAttachment(item));
    if (linked) return driveFileFromAttachment(linked);
    if (!publication.task_id) return null;
    const { data: byTask } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('task_id', publication.task_id)
      .order('created_at', { ascending: false })
      .limit(20);
    const match = (byTask || []).find((item) => driveFileIdFromAttachment(item));
    return match ? driveFileFromAttachment(match) : null;
  }, []);

  const handleOpenQueueItem = useCallback(async (task) => {
    const action = socialQueueCardAction(task);
    if (action.type === 'task') {
      handleOpenTask(task);
      return;
    }
    if (action.type === 'evidence') {
      window.open(action.url, '_blank', 'noopener,noreferrer');
      return;
    }

    const publication = action.publication || task.publication;
    if (!publication || !platformForChannel(publication.channel)) {
      handleOpenTask(task);
      return;
    }

    const clientId = task.client_id || task.parentTask?.client_id || null;
    if (!clientId) {
      toast({ title: 'Cliente não encontrado neste post', variant: 'destructive' });
      return;
    }

    setOpeningQueueId(publication.id);
    try {
      let file = await resolvePublicationDriveFile(publication);
      if (!file?.id) {
        toast({
          title: 'Arquivo do Drive não encontrado',
          description: 'Abra o post pelo calendário ou pela tarefa para escolher o arquivo.',
          variant: 'destructive',
        });
        return;
      }
      if (!Number(file.size)) {
        try {
          const info = await invokeGoogleDrive({
            action: 'file-info',
            clienteId: clientId,
            fileId: file.id,
          });
          const meta = info?.file || info;
          file = {
            ...file,
            size: meta?.size ?? file.size,
            mimeType: meta?.mimeType || file.mimeType,
            name: meta?.name || file.name,
          };
        } catch {
          /* sem tamanho: attachDriveMediaForMeta ainda tenta */
        }
      }
      // Reels grandes: sem size o stage de 40 MB falha; força o caminho do Drive.
      if (publicationLooksLikeVideo(publication) && !Number(file.size)) {
        file = { ...file, size: META_VIDEO_MAX_BYTES + 1 };
      }
      const [accounts, media] = await Promise.all([
        fetchClienteSocialAccounts(supabase, clientId),
        attachDriveMediaForMeta(clientId, {
          ...file,
          mimeType: file.mimeType || (publicationLooksLikeVideo(publication) ? 'video/mp4' : 'image/jpeg'),
        }),
      ]);
      setQueueComposer({
        publication,
        clientId,
        accounts,
        media,
      });
    } catch (error) {
      toast({
        title: 'Não deu para abrir o post',
        description: error?.message || 'Tente de novo.',
        variant: 'destructive',
      });
    } finally {
      setOpeningQueueId('');
    }
  }, [resolvePublicationDriveFile, toast]);

  useEffect(() => {
    if (!taskIdFromUrl || !tasks.length) return;
    const requested = tasks.find((task) => task.id === taskIdFromUrl);
    if (requested) setSelectedTask(requested);
  }, [taskIdFromUrl, tasks]);

  const handleSaveTask = async (taskData, isNew) => {
    const { subtasks, clientes, projetos, ...editableTask } = taskData;
    const dataToSave = { ...editableTask, owner_id: user.id };
    if (dataToSave.due_date === '') dataToSave.due_date = null;

    if (!isNew) {
      try {
        const { blocking } = await checkTaskPublicationCompletion(supabase, taskData.id, dataToSave.status);
        if (blocking.length) {
          toast({
            title: 'Ainda existem canais pendentes',
            description: `${blocking.length} publicação(ões) ainda precisam ser publicadas ou canceladas.`,
            variant: 'destructive',
          });
          return false;
        }
      } catch (error) {
        toast({ title: 'Não foi possível conferir os canais', description: error.message, variant: 'destructive' });
        return false;
      }
    }

    let error;
    if (isNew) {
      ({ error } = await supabase.from('tarefas').insert(dataToSave));
    } else {
      ({ error } = await supabase.from('tarefas').update(dataToSave).eq('id', taskData.id));
    }

    if (error) {
      toast({ title: "Erro ao salvar tarefa", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: `Tarefa ${isNew ? 'criada' : 'atualizada'}!` });
    fetchData();
    handleCloseTask();
    return true;
  };

  const handleDeleteTask = async (taskId) => {
    const { error } = await supabase.from('tarefas').delete().eq('id', taskId);
    if (error) toast({ title: "Erro ao remover tarefa", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Tarefa removida" });
      fetchData();
      handleCloseTask();
    }
  };

  return (
    <div className="space-y-2 social-ws">
      <WorkspacePageHeader
        className="social-ws-heading"
        title="Redes sociais"
        help="Cada cliente tem o calendário de conteúdo: mês, semana, preview do post e arrastar o dia. A tarefa continua sendo quem executa."
        actions={tabFromUrl === 'overview' ? null : (
          <div className="w-full md:w-auto">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="h-9 w-full rounded-xl bg-slate-50 text-xs dark:bg-white/[0.04] md:w-[220px]">
              <SelectValue placeholder="Selecione um cliente" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="all">Todos os Clientes</SelectItem>
              {clientFilter !== 'all' && !clients.some((c) => c.id === clientFilter) ? (
                <SelectItem value={clientFilter}>Carregando…</SelectItem>
              ) : null}
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        )}
      />

      {loadError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm text-red-800 dark:text-red-200">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={fetchData} disabled={loading}>
            Tentar novamente
          </Button>
        </div>
      )}
      {loading && hasLoaded && <p className="text-sm text-muted-foreground">Atualizando conteúdo...</p>}
      {loading && !hasLoaded ? (
        <p className="text-center py-10 dark:text-gray-300">Carregando conteúdo...</p>
      ) : hasLoaded ? (
        <Tabs
          value={tabFromUrl}
          onValueChange={(tabId) => {
            if (tabId === tabFromUrl) return;
            setMainTab(tabId);
          }}
          className="w-full"
        >
          <TabsList className="social-ws-tabs">
            <TabsTrigger value="overview" className="social-ws-tab">
              <User className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="calendar" className="social-ws-tab">
              <Calendar className="h-4 w-4" />
              Calendário
            </TabsTrigger>
            <TabsTrigger value="pending" className="social-ws-tab">
              <Send className="h-4 w-4" />
              A publicar
              <span className="social-ws-tab-count">{pendingPublicationTasks.length}</span>
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="social-ws-tab">
              <Clock className="h-4 w-4" />
              Agendados
              <span className="social-ws-tab-count">{scheduledTasks.length}</span>
            </TabsTrigger>
            <TabsTrigger value="completed" className="social-ws-tab">
              <CheckCircle className="h-4 w-4" />
              Concluídos
              <span className="social-ws-tab-count">{completedTasks.length}</span>
            </TabsTrigger>
            <TabsTrigger
              value="meta-business"
              className="social-ws-tab"
              disabled={isCheckingConnection}
            >
              <Building2 className="h-4 w-4" />
              Perfil e feed
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <ClientOverview
              selectedClientId={selectedClient}
              clients={clients}
              publications={publications}
              metaConnected={metaConnectionStatus === 'connected'}
              metaConnectionStatus={metaConnectionStatus}
              onSelectClient={setSelectedClient}
              onOpenProfileFeed={(clientId, channel) => {
                patchSearch((next) => {
                  next.set('tab', 'meta-business');
                  if (!clientId || clientId === 'all') next.delete('client');
                  else next.set('client', clientId);
                  if (channel === 'facebook') next.set('platform', 'facebook');
                  else next.delete('platform');
                  next.delete('view');
                  next.delete('account');
                  next.delete('feed');
                  next.delete('post');
                });
              }}
            />
          </TabsContent>
          <TabsContent value="calendar">
            <SocialClientBoard
              client={selectedClient === 'all' ? null : clients.find((row) => row.id === selectedClient) || null}
              clients={clients}
              onSelectClient={(clientId) => {
                setSelectedClient(clientId);
              }}
              onOpenOverview={() => setMainTab('overview', selectedClient)}
              onOpenProfile={() => setMainTab('meta-business', selectedClient)}
            >
              <SocialPlanner
                publications={publications}
                clients={clients}
                selectedClientId={selectedClient}
                onCreated={fetchData}
                onOpenItem={(publication) => {
                  if (publication?.task) handleOpenTask(publication.task);
                  else if (publication?.task_id) {
                    const task = tasks.find((t) => t.id === publication.task_id);
                    if (task) handleOpenTask(task);
                  }
                }}
              />
            </SocialClientBoard>
          </TabsContent>
          <TabsContent value="pending">
            <QueueBoard
              items={pendingPublicationTasks}
              emptyLabel="Nenhuma publicação pendente neste filtro."
              users={users}
              statusOptions={combinedStatusOptions}
              onOpen={handleOpenQueueItem}
              onRetryDone={handleRetryDone}
            />
          </TabsContent>
          <TabsContent value="scheduled">
            <QueueBoard
              items={scheduledTasks}
              emptyLabel="Nenhum post agendado neste filtro."
              users={users}
              statusOptions={combinedStatusOptions}
              onOpen={handleOpenQueueItem}
              onRetryDone={handleRetryDone}
            />
          </TabsContent>
          <TabsContent value="completed">
            <QueueBoard
              items={completedTasks}
              emptyLabel="Nenhum post concluído neste filtro."
              users={users}
              statusOptions={combinedStatusOptions}
              onOpen={handleOpenQueueItem}
              onRetryDone={handleRetryDone}
            />
          </TabsContent>
          <TabsContent value="meta-business">
            {isCheckingConnection ? (
              <p className="text-center py-10 dark:text-gray-400">Verificando conexão com o Meta...</p>
            ) : selectedClient === 'all' ? (
                <p className="social-ws-empty">
                  Escolha um cliente no filtro acima para ver o perfil, o feed e conferir se o planejado foi postado.
                </p>
              ) : (
                <ClientSocialProfile
                  clientId={selectedClient}
                  clientName={clients.find((c) => c.id === selectedClient)?.empresa}
                  publications={publications}
                  liveMeta={metaConnectionStatus === 'connected'}
                  onOpenPublicationTask={(publication) => {
                    if (publication?.task) handleOpenTask(publication.task);
                    else if (publication?.task_id) {
                      const task = tasks.find((t) => t.id === publication.task_id);
                      if (task) handleOpenTask(task);
                    }
                  }}
                />
              )}
          </TabsContent>
        </Tabs>
      ) : null}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={handleCloseTask}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
          clients={clients}
          projects={projects}
          users={users}
          statusOptions={statusOptions}
          userRole={profile?.role}
        />
      )}
      <QueueComposerDialog
        composer={queueComposer}
        onClose={() => setQueueComposer(null)}
        onSuccess={() => {
          setQueueComposer(null);
          void fetchData();
        }}
      />
      {openingQueueId ? (
        <p className="sr-only" aria-live="polite">Abrindo post…</p>
      ) : null}
    </div>
  );
};

export default SocialMedia;
