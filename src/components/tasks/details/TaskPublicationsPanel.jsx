import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, HardDrive, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { ChannelLogo } from '@/components/tasks/TaskChannelBadges';
import TaskFieldHelp, { TaskFieldLabel } from '@/components/tasks/TaskFieldHelp';
import { cn } from '@/lib/utils';
import GoogleDrivePickerDialog from '@/components/tasks/details/GoogleDrivePickerDialog';
import DriveFileThumb from '@/components/tasks/details/DriveFileThumb';
import {
  activePublications,
  assetUrlFromTaskMedia,
  attachmentBlocksMetaSend,
  attachmentExceedsMetaStage,
  buildPublicationPayload,
  CHANNEL_OPTIONS,
  CHANNEL_PUBLICATION_STATUSES,
  combineScheduledDateTime,
  createEmptyPublication,
  defaultPublicationDate,
  defaultPublicationTime,
  fallbackPublicationDestination,
  destinationForChannel,
  displayPublicationWhen,
  firstAssigneeId,
  mediaForChannel,
  manualPublishedFields,
  clientPostsFields,
  mediaLooksLikeVideo,
  META_REELS_SEND_MAX_BYTES,
  META_STAGE_MAX_BYTES,
  isTaskPublicationMedia,
  remainingPublicationChannels,
  splitScheduledDateTime,
  validatePublication,
} from '@/lib/taskChannelPublications';
import {
  buildDriveAttachmentPayload,
  driveFileFromAttachment,
  driveFileIdFromAttachment,
  formatDriveBytes,
  insertTaskDriveAttachment,
  isGoogleDriveAssetUrl,
} from '@/lib/googleDriveMedia';
import { accountsByPlatform, fetchClienteSocialAccounts, platformForChannel } from '@/lib/clienteSocialAccounts';
import { syncGoogleDriveFile } from '@/lib/googleDriveClient';
import { attachDriveMediaForMeta } from '@/lib/metaPublishMedia';
import { futureScheduleAt } from '@/lib/scheduleSocialComposer';
import { taskPostCaption } from '@/lib/briefingObrigatorio';
import ContentPublisher from '@/components/social/ContentPublisher';

const statusByValue = Object.fromEntries(CHANNEL_PUBLICATION_STATUSES.map((item) => [item.value, item]));

function emptyDraft(task, extras = {}) {
  const combined = combineScheduledDateTime(defaultPublicationDate(task), extras.time || splitScheduledDateTime(extras).time);
  return {
    scheduledLocal: extras.scheduledLocal || combined.local,
    destination: extras.destination || '',
    link: extras.link || '',
    media: extras.media || null,
  };
}

function MediaPickList({ items, selected, onSelect, clienteId }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Nenhum arquivo de mídia nesta tarefa ainda.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const isSelected = driveFileIdFromAttachment(selected) === driveFileIdFromAttachment(item)
          || selected?.id === item.id;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm',
                isSelected ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40' : 'hover:bg-muted/50',
              )}
            >
              <DriveFileThumb
                clienteId={clienteId}
                file={driveFileFromAttachment(item)}
                className="h-12 w-12"
              />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.size_bytes ? (
                <span className="text-xs text-muted-foreground">{formatDriveBytes(item.size_bytes)}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PublicationQuadro({ title, aside, children, className, bodyClassName, highlighted = false }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-background shadow-sm dark:border-white/10',
        highlighted && 'border-violet-300 ring-2 ring-violet-400/60',
        className,
      )}
    >
      {title || aside ? (
        <header className="flex items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
          {title ? (
            <h4 className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h4>
          ) : (
            <span />
          )}
          {aside}
        </header>
      ) : null}
      <div className={cn('space-y-3 p-3', bodyClassName)}>{children}</div>
    </section>
  );
}

function toPublisherAccount(row) {
  return {
    id: row.meta_id,
    name: row.display_name || row.username || row.meta_id,
    username: row.username || '',
    profile_picture_url: row.profile_picture_url || null,
  };
}

function futurePublicationDate(publication) {
  const raw = publication?.scheduled_at;
  const date = raw ? new Date(raw) : null;
  if (date && !Number.isNaN(date.getTime()) && date.getTime() > Date.now() + 60 * 1000) return date;
  return futureScheduleAt(new Date());
}

const emptyComposer = {
  editingId: null,
  channels: [],
  caption: '',
  drafts: {},
};

function TaskMetaComposer({ clientId, accounts, composer, onClose, onSuccess }) {
  const { pages, instagram } = accountsByPlatform(accounts);
  const publisherPages = pages.map(toPublisherAccount);
  const publisherIg = instagram.map(toPublisherAccount);
  const isIg = platformForChannel(composer.publication.channel) === 'instagram';
  const dispatch = composer.publication.meta_dispatch || {};
  return (
    <ContentPublisher
      type={isIg ? 'instagram' : 'pages'}
      pages={publisherPages}
      instagramAccounts={publisherIg}
      selectedPage={dispatch.pageId || publisherPages[0]?.id || ''}
      selectedInstagram={dispatch.instagramAccountId || publisherIg[0]?.id || ''}
      clientId={clientId}
      initialFormat={composer.video ? 'REELS' : 'IMAGE'}
      initialCaption={composer.publication.caption || ''}
      initialMedia={composer.media}
      initialWhenMode={composer.publishNow ? 'now' : 'schedule'}
      initialScheduledTime={composer.publishNow ? null : futurePublicationDate(composer.publication)}
      initialCoverMode={dispatch.coverMode || 'auto'}
      initialThumbOffsetSec={Number(dispatch.thumbOffsetMs || 0) / 1000}
      existingPublicationId={composer.publication.id}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

const TaskPublicationsPanel = ({
  taskId,
  task: taskProp = null,
  users = [],
  onPublicationsChange,
  onAttachmentsChange,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [publications, setPublications] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [taskRow, setTaskRow] = useState(taskProp);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingMetaId, setOpeningMetaId] = useState('');
  const [metaComposer, setMetaComposer] = useState(null);
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveChannel, setDriveChannel] = useState('');
  const [composer, setComposer] = useState(emptyComposer);
  const [showComposer, setShowComposer] = useState(true);

  const clientId = taskProp?.client_id || taskRow?.client_id || null;
  const assigneeId = firstAssigneeId(taskProp || taskRow, users) || user?.id || '';
  const visiblePublications = useMemo(() => activePublications(publications), [publications]);
  const mediaList = useMemo(
    () => attachments.filter(isTaskPublicationMedia),
    [attachments],
  );

  const patchDraft = (channel, patch) => {
    setComposer((prev) => ({
      ...prev,
      drafts: {
        ...prev.drafts,
        [channel]: { ...(prev.drafts[channel] || emptyDraft(taskProp || taskRow)), ...patch },
      },
    }));
  };

  const applyDefaults = useCallback((nextTask, nextAccounts, nextAttachments, nextPublications, publication = null) => {
    if (publication) {
      const split = splitScheduledDateTime(publication);
      setComposer({
        editingId: publication.id,
        channels: [publication.channel],
        caption: publication.caption || taskPostCaption(nextTask),
        drafts: {
          [publication.channel]: emptyDraft(nextTask, {
            scheduledLocal: split.local,
            destination: publication.destination || '',
            link: publication.evidence_url || (isGoogleDriveAssetUrl(publication.asset_url) ? '' : publication.asset_url) || '',
            media: mediaForChannel(publication.channel, { attachments: nextAttachments, publications: [publication] }),
          }),
        },
      });
      setShowComposer(true);
      return;
    }
    const channels = remainingPublicationChannels({
      plannedChannels: nextTask?.planned_channels || [],
      accounts: nextAccounts || [],
      publications: nextPublications || [],
    });
    const drafts = Object.fromEntries(channels.map((channel) => [
      channel,
      emptyDraft(nextTask, {
        destination: destinationForChannel(channel, nextAccounts) || '',
        media: mediaForChannel(channel, { attachments: nextAttachments, publications: nextPublications }),
      }),
    ]));
    setComposer({
      editingId: null,
      channels,
      caption: taskPostCaption(nextTask),
      drafts,
    });
  }, []);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    const [pubRes, taskRes, attachRes] = await Promise.all([
      supabase.from('task_channel_publications').select('*').eq('task_id', taskId).order('scheduled_for', { ascending: true }),
      supabase.from('tarefas').select('id, client_id, planned_channels, post_date, due_date, assignee_ids, briefing_payload').eq('id', taskId).maybeSingle(),
      supabase.from('task_attachments').select('*').eq('task_id', taskId).order('created_at', { ascending: true }),
    ]);
    if (pubRes.error) toast({ title: 'Erro ao carregar publicações', description: pubRes.error.message, variant: 'destructive' });
    const nextPubs = pubRes.data || [];
    const nextTask = taskRes.data || taskProp || null;
    const nextAttachments = attachRes.data || [];
    setPublications(nextPubs);
    setTaskRow(nextTask);
    setAttachments(nextAttachments);
    onPublicationsChange?.(activePublications(nextPubs));

    let nextAccounts = [];
    const cid = nextTask?.client_id || taskProp?.client_id;
    if (cid) {
      try {
        nextAccounts = await fetchClienteSocialAccounts(supabase, cid);
      } catch (error) {
        toast({ title: 'Não deu para ler os destinos', description: error.message, variant: 'destructive' });
      }
    }
    setAccounts(nextAccounts);
    applyDefaults(nextTask, nextAccounts, nextAttachments, nextPubs);
    setShowComposer(activePublications(nextPubs).length === 0);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleChannel = (channel) => {
    setComposer((prev) => {
      const has = prev.channels.includes(channel);
      const channels = has ? prev.channels.filter((item) => item !== channel) : [...prev.channels, channel];
      const drafts = { ...prev.drafts };
      if (has) {
        delete drafts[channel];
      } else {
        drafts[channel] = prev.drafts[channel] || emptyDraft(taskProp || taskRow, {
          destination: destinationForChannel(channel, accounts) || '',
          media: mediaForChannel(channel, { attachments, publications }),
        });
      }
      return { ...prev, channels, drafts };
    });
  };

  const persistRow = async (payload, editingId) => {
    const run = async (body) => (
      editingId
        ? supabase.from('task_channel_publications').update(body).eq('id', editingId).select('*').maybeSingle()
        : supabase.from('task_channel_publications').insert(body).select('*').maybeSingle()
    );
    let { data, error } = await run(payload);
    if (error && (String(error.message || '').includes('scheduled_at') || error.code === 'PGRST204')) {
      const without = { ...payload };
      delete without.scheduled_at;
      ({ data, error } = await run(without));
    }
    if (error) throw error;
    return data;
  };

  const persistRows = async ({ markPosted = false } = {}) => {
    const channels = composer.editingId
      ? composer.channels.slice(0, 1)
      : composer.channels.filter(Boolean);
    if (!channels.length) {
      throw new Error('Escolha o canal.');
    }
    if (!assigneeId) {
      throw new Error('A tarefa precisa de um responsável.');
    }
    const usage = {};
    for (const channel of channels) {
      const mediaId = composer.drafts[channel]?.media?.id;
      if (mediaId) usage[mediaId] = (usage[mediaId] || 0) + 1;
    }
    const saved = [];
    for (const channel of channels) {
      const draft = composer.drafts[channel] || emptyDraft(taskProp || taskRow);
      const destination = fallbackPublicationDestination(
        destinationForChannel(channel, accounts) || draft.destination,
        channel,
      );
      const taskDay = defaultPublicationDate(taskProp || taskRow);
      const when = combineScheduledDateTime(taskDay, defaultPublicationTime());
      const existing = composer.editingId
        ? publications.find((item) => item.id === composer.editingId)
        : visiblePublications.find((item) => item.channel === channel);
      const pasted = String(draft.link || '').trim();
      if (markPosted && (!pasted || isGoogleDriveAssetUrl(pasted))) {
        throw new Error(`Cole o link do post de ${channel} que já está no ar.`);
      }
      const driveUrl = assetUrlFromTaskMedia(draft.media);
      const video = mediaLooksLikeVideo(draft.media);
      const payload = buildPublicationPayload({
        ...createEmptyPublication(taskId, assigneeId),
        ...(existing || {}),
        channel,
        destination,
        assignee_id: assigneeId,
        scheduled_for: when.scheduled_for,
        scheduled_at: when.scheduled_at,
        caption: composer.caption,
        asset_url: driveUrl || pasted || existing?.asset_url || '',
        evidence_url: pasted && !isGoogleDriveAssetUrl(pasted) ? pasted : (existing?.evidence_url || ''),
        format: video ? 'Reel' : (existing?.format || ''),
        status: markPosted && pasted && !isGoogleDriveAssetUrl(pasted)
          ? 'published'
          : (existing?.status && existing.status !== 'cancelled' ? existing.status : 'pending'),
        published_on: markPosted && pasted && !isGoogleDriveAssetUrl(pasted)
          ? (existing?.published_on || when.scheduled_for)
          : (existing?.published_on || ''),
      }, taskId);
      const errors = validatePublication(payload);
      if (errors.length) throw new Error(errors[0]);
      const data = await persistRow(payload, existing?.id || null);
      if (draft.media?.id && usage[draft.media.id] === 1 && draft.media.publication_id !== data.id) {
        await supabase.from('task_attachments').update({ publication_id: data.id }).eq('id', draft.media.id);
      }
      saved.push(data);
    }
    return saved;
  };

  const refreshAfterSave = async (saved) => {
    const byId = new Map(saved.map((item) => [item.id, item]));
    const merged = publications
      .map((item) => byId.get(item.id) || item)
      .concat(saved.filter((item) => !publications.some((row) => row.id === item.id)));
    setPublications(merged);
    onPublicationsChange?.(activePublications(merged));
    setShowComposer(false);
    setComposer((prev) => ({ ...prev, editingId: null }));
    return merged;
  };

  const handleSave = async (scheduleOnMeta) => {
    const metaSelected = composer.channels.filter((channel) => destinationForChannel(channel, accounts));
    const oversized = metaSelected.find((channel) => attachmentBlocksMetaSend(composer.drafts[channel]?.media));
    const missingMedia = metaSelected.find((channel) => !composer.drafts[channel]?.media);
    const willMeta = scheduleOnMeta && metaSelected.length > 0;
    if (willMeta && oversized) {
      toast({
        title: 'Arquivo grande demais para a Meta',
        description: mediaLooksLikeVideo(composer.drafts[oversized]?.media)
          ? `${oversized}: Reels na Meta aceita até ${formatDriveBytes(META_REELS_SEND_MAX_BYTES)}.`
          : `${oversized}: imagem até 8 MB. O original fica no Drive.`,
        variant: 'destructive',
      });
      return;
    }
    if (willMeta && missingMedia) {
      toast({ title: `Escolha o arquivo do Drive de ${missingMedia}`, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const saved = await persistRows({ markPosted: !scheduleOnMeta });
      await refreshAfterSave(saved);
      if (willMeta) {
        const metaRows = saved.filter((row) => destinationForChannel(row.channel, accounts));
        const first = metaRows[0];
        if (!first) {
          toast({ title: 'Postagem guardada', description: 'Este canal não publica pela Meta. O link fica registrado na tarefa.' });
          return;
        }
        const draftMedia = composer.drafts[first.channel]?.media
          || mediaForChannel(first.channel, { attachments, publications: saved });
        await openMetaScreen(first, false, draftMedia);
        if (metaRows.length > 1) {
          toast({
            title: 'Abri o primeiro canal',
            description: 'Os outros ficaram guardados na tarefa. Abra cada um em Agendar na Meta.',
          });
        }
      } else {
        toast({
          title: saved.length > 1 ? 'Postagens guardadas' : 'Postagem guardada',
          description: scheduleOnMeta ? 'Este canal não publica pela Meta. O link fica registrado na tarefa.' : undefined,
        });
        await load();
      }
    } catch (error) {
      toast({ title: 'Não deu para salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openMetaScreen = async (publication, publishNow, mediaItem) => {
    if (!platformForChannel(publication?.channel)) return;
    const file = driveFileFromAttachment(mediaItem);
    if (!file?.id) {
      toast({ title: 'Escolha o arquivo no Drive', variant: 'destructive' });
      return;
    }
    if (attachmentBlocksMetaSend(mediaItem)) {
      toast({
        title: 'Arquivo grande demais para a Meta',
        description: mediaLooksLikeVideo(mediaItem)
          ? `Reels na Meta aceita até ${formatDriveBytes(META_REELS_SEND_MAX_BYTES)}.`
          : 'Imagem até 8 MB. O original fica no Drive.',
        variant: 'destructive',
      });
      return;
    }
    setOpeningMetaId(publication.id);
    try {
      const staged = await attachDriveMediaForMeta(clientId, file);
      setMetaComposer({
        publication,
        publishNow: Boolean(publishNow),
        media: staged,
        video: mediaLooksLikeVideo(mediaItem),
      });
    } catch (error) {
      toast({ title: 'Não deu para abrir', description: error.message, variant: 'destructive' });
    } finally {
      setOpeningMetaId('');
    }
  };

  const handleMarkPosted = async (publication) => {
    const result = isGoogleDriveAssetUrl(publication?.evidence_url)
      ? { ok: false, error: 'Cole o link do post no ar, não o arquivo do Drive.' }
      : manualPublishedFields(publication);
    if (!result.ok) {
      toast({ title: 'Falta o link', description: result.error, variant: 'destructive' });
      applyDefaults(taskRow, accounts, attachments, publications, publication);
      setShowComposer(true);
      return;
    }
    setOpeningMetaId(publication.id);
    try {
      const { data, error } = await supabase
        .from('task_channel_publications')
        .update(result.patch)
        .eq('id', publication.id)
        .select('*')
        .single();
      if (error) throw error;
      const next = publications.map((item) => (item.id === publication.id ? data : item));
      setPublications(next);
      onPublicationsChange?.(activePublications(next));
      toast({ title: 'Canal marcado como publicado', description: 'Nada foi enviado para a Meta.' });
    } catch (error) {
      toast({ title: 'Não deu para marcar', description: error.message, variant: 'destructive' });
    } finally {
      setOpeningMetaId('');
    }
  };

  const handleMarkClientPosts = async (publication) => {
    const result = clientPostsFields(publication);
    setOpeningMetaId(publication.id);
    try {
      const { data, error } = await supabase
        .from('task_channel_publications')
        .update(result.patch)
        .eq('id', publication.id)
        .select('*')
        .single();
      if (error) throw error;
      const next = publications.map((item) => (item.id === publication.id ? data : item));
      setPublications(next);
      onPublicationsChange?.(activePublications(next));
      toast({ title: 'Cliente publica', description: 'Sem link e sem envio para a Meta. Dá para concluir a tarefa.' });
    } catch (error) {
      toast({ title: 'Não deu para marcar', description: error.message, variant: 'destructive' });
    } finally {
      setOpeningMetaId('');
    }
  };

  const handleDelete = async (publication) => {
    await supabase.from('task_attachments').update({ publication_id: null }).eq('publication_id', publication.id);
    let error = (await supabase.from('task_channel_publications').delete().eq('id', publication.id)).error;
    let next = publications.filter((item) => item.id !== publication.id);
    if (error) {
      const cancelled = await supabase
        .from('task_channel_publications')
        .update({ status: 'cancelled' })
        .eq('id', publication.id)
        .select('*')
        .maybeSingle();
      if (cancelled.error) {
        toast({ title: 'Não deu para excluir', description: error.message || cancelled.error.message, variant: 'destructive' });
        return;
      }
      next = publications.map((item) => (item.id === publication.id ? cancelled.data : item));
    }
    setPublications(next);
    onPublicationsChange?.(activePublications(next));
    toast({ title: 'Canal removido' });
    if (!activePublications(next).length) {
      applyDefaults(taskRow, accounts, attachments, next);
      setShowComposer(true);
    }
  };

  const handleDriveSelect = async (file) => {
    if (!clientId) {
      toast({ title: 'Selecione um cliente na tarefa', variant: 'destructive' });
      throw new Error('Cliente necessário');
    }
    const channel = driveChannel || composer.channels[0];
    const already = attachments.find((item) => driveFileIdFromAttachment(item) === file?.id);
    if (already) {
      if (channel) patchDraft(channel, { media: already });
      return;
    }
    const existingPub = composer.editingId
      ? publications.find((item) => item.id === composer.editingId)
      : visiblePublications.find((item) => item.channel === channel);
    const sync = await syncGoogleDriveFile(clientId, file.id);
    const payload = buildDriveAttachmentPayload({
      taskId,
      publicationId: existingPub?.id || null,
      file,
      sync,
    });
    const inserted = await insertTaskDriveAttachment(supabase, payload);
    const next = [...attachments, inserted];
    setAttachments(next);
    if (channel) patchDraft(channel, { media: inserted });
    onAttachmentsChange?.(next.length);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando publicações…
      </div>
    );
  }

  const metaSelected = composer.channels.some((channel) => destinationForChannel(channel, accounts));
  const anyTooLarge = composer.channels.some((channel) => (
    destinationForChannel(channel, accounts) && attachmentBlocksMetaSend(composer.drafts[channel]?.media)
  ));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        <h3 className="text-base font-semibold">Publicações</h3>
        <TaskFieldHelp label="Ajuda das publicações">
          Cada canal usa o próprio arquivo e o próprio horário. Se o vídeo já foi postado fora da Meta, cole o link e use Já foi postado. Se quem posta é o cliente, use Cliente publica — sem link. No cadastro do cliente dá para marcar isso para todas as tarefas. Isso não envia nada. Excluir tira o canal desta tarefa.
        </TaskFieldHelp>
      </div>

      {visiblePublications.length > 0 && (
        <ul className="space-y-3">
          {visiblePublications.map((publication) => {
            const status = statusByValue[publication.status] || statusByValue.pending;
            const canMeta = Boolean(destinationForChannel(publication.channel, accounts));
            const busyMeta = openingMetaId === publication.id;
            const media = mediaForChannel(publication.channel, { attachments, publications });
            const editingThis = composer.editingId === publication.id && showComposer;
            return (
              <li key={publication.id}>
                <PublicationQuadro
                  highlighted={editingThis}
                  title={(
                    <span className="flex min-w-0 items-center gap-2">
                      <ChannelLogo channel={publication.channel} status={publication.status} />
                      <span className="truncate">{publication.channel}{publication.destination && publication.destination !== publication.channel ? ` · ${publication.destination}` : ''}</span>
                    </span>
                  )}
                  aside={(
                    <Badge variant="outline" style={{ borderColor: status.color, color: status.color }}>{status.label}</Badge>
                  )}
                >
                  <p className="text-xs text-muted-foreground">{displayPublicationWhen(publication)}</p>
                  {media?.name ? (
                    <span className="flex items-center gap-2">
                      <DriveFileThumb
                        clienteId={clientId}
                        file={driveFileFromAttachment(media)}
                        className="h-10 w-10"
                      />
                      <span className="truncate text-xs text-muted-foreground">{media.name}</span>
                    </span>
                  ) : null}
                  {publication.evidence_url ? (
                    <a
                      href={publication.evidence_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline dark:text-violet-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Link da publicação
                    </a>
                  ) : null}
                  <div className="flex flex-wrap gap-2 border-t border-slate-200/80 pt-3 dark:border-white/10">
                    {canMeta && publication.status !== 'published' && publication.status !== 'client_posts' && (
                      <>
                        <Button type="button" size="sm" disabled={Boolean(openingMetaId)} onClick={() => openMetaScreen(publication, false, media)}>
                          {busyMeta ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                          {publication.status === 'failed' ? 'Reagendar' : 'Agendar na Meta'}
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={Boolean(openingMetaId)} onClick={() => openMetaScreen(publication, true, media)}>
                          Enviar agora
                        </Button>
                      </>
                    )}
                    {publication.status !== 'published' && publication.status !== 'client_posts' && (
                      <Button type="button" size="sm" variant="outline" disabled={Boolean(openingMetaId)} onClick={() => handleMarkPosted(publication)}>
                        {busyMeta ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                        Já foi postado
                      </Button>
                    )}
                    {publication.status !== 'published' && publication.status !== 'client_posts' && (
                      <Button type="button" size="sm" variant="outline" disabled={Boolean(openingMetaId)} onClick={() => handleMarkClientPosts(publication)}>
                        Cliente publica
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => applyDefaults(taskRow, accounts, attachments, publications, publication)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(publication)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Excluir
                    </Button>
                  </div>
                </PublicationQuadro>
              </li>
            );
          })}
        </ul>
      )}

      {showComposer ? (
        <div className="space-y-3">
          <PublicationQuadro title="Onde publicar">
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((channel) => {
                const auto = destinationForChannel(channel, accounts);
                const pressed = composer.channels.includes(channel);
                return (
                  <Button
                    key={channel}
                    type="button"
                    size="sm"
                    variant={pressed ? 'default' : 'outline'}
                    aria-pressed={pressed}
                    disabled={Boolean(composer.editingId && composer.channels[0] !== channel)}
                    onClick={() => toggleChannel(channel)}
                  >
                    <ChannelLogo channel={channel} size="sm" className="mr-2" />
                    {channel}
                    {auto ? ` · ${auto}` : ''}
                  </Button>
                );
              })}
            </div>
          </PublicationQuadro>

          {composer.channels.map((channel) => {
            const draft = composer.drafts[channel] || emptyDraft(taskProp || taskRow);
            const auto = destinationForChannel(channel, accounts);
            const tooLarge = attachmentBlocksMetaSend(draft.media);
            const largeVideo = mediaLooksLikeVideo(draft.media) && attachmentExceedsMetaStage(draft.media) && !tooLarge;
            const channelMedia = mediaList.filter((item) => !item.publication_id || item.publication_id === visiblePublications.find((row) => row.channel === channel)?.id || item.id === draft.media?.id);
            return (
              <PublicationQuadro
                key={channel}
                title={(
                  <span className="flex min-w-0 items-center gap-2">
                    <ChannelLogo channel={channel} size="sm" />
                    <span className="truncate">{channel}{auto ? ` · ${auto}` : ''}</span>
                  </span>
                )}
                aside={(
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-destructive"
                    aria-label={`Excluir ${channel}`}
                    onClick={() => {
                      if (composer.editingId) handleDelete(publications.find((item) => item.id === composer.editingId));
                      else toggleChannel(channel);
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Excluir
                  </Button>
                )}
              >
                <p className="text-sm text-muted-foreground">
                  Data da postagem: {(() => {
                    const day = defaultPublicationDate(taskProp || taskRow);
                    const [year, month, date] = day.split('-');
                    return date && month && year ? `${date}/${month}/${year}` : day;
                  })()}, da tarefa.
                </p>

                <div className="space-y-1.5">
                  <TaskFieldLabel htmlFor={`publication-link-${channel}`} help="Cole aqui depois que o post já estiver no ar. A data vem da tarefa. O perfil é opcional. Não envia para a Meta.">
                    Link da publicação
                  </TaskFieldLabel>
                  <Input
                    id={`publication-link-${channel}`}
                    type="url"
                    value={draft.link}
                    onChange={(event) => patchDraft(channel, { link: event.target.value })}
                    placeholder="https://"
                  />
                </div>

                {!auto && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`publication-destination-${channel}`}>Perfil (opcional)</Label>
                    <Input
                      id={`publication-destination-${channel}`}
                      value={draft.destination}
                      onChange={(event) => patchDraft(channel, { destination: event.target.value })}
                      placeholder="@perfil, se quiser"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Arquivo deste canal</Label>
                  <MediaPickList
                    items={channelMedia}
                    selected={draft.media}
                    onSelect={(media) => patchDraft(channel, { media })}
                    clienteId={clientId}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDriveChannel(channel);
                      setDriveOpen(true);
                    }}
                    disabled={!clientId}
                  >
                    <HardDrive className="mr-1 h-4 w-4" />
                    Escolher no Drive
                  </Button>
                  {tooLarge && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {mediaLooksLikeVideo(draft.media)
                        ? `Reels na Meta aceita até ${formatDriveBytes(META_REELS_SEND_MAX_BYTES)}.`
                        : 'Imagem até 8 MB. O original fica no Drive.'}
                    </p>
                  )}
                  {largeVideo && (
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Vídeo grande vai direto do Drive para a Meta. O original não é copiado no Planeje.
                    </p>
                  )}
                </div>
              </PublicationQuadro>
            );
          })}

          <PublicationQuadro title="Legenda do post">
            <Textarea
              id="publication-caption"
              rows={6}
              value={composer.caption}
              onChange={(event) => setComposer((prev) => ({ ...prev, caption: event.target.value }))}
              placeholder="Usa a legenda da tarefa"
            />
          </PublicationQuadro>

          <div className="flex flex-wrap justify-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            {visiblePublications.length > 0 && (
              <Button type="button" variant="ghost" onClick={() => setShowComposer(false)}>Cancelar</Button>
            )}
            <Button type="button" variant="outline" disabled={saving} onClick={() => handleSave(false)}>
              Guardar no Planeje
            </Button>
            <Button type="button" disabled={saving || (anyTooLarge && metaSelected)} onClick={() => handleSave(true)}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Agendar na Meta
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => {
          applyDefaults(taskRow, accounts, attachments, publications);
          setShowComposer(true);
        }}>
          Nova postagem
        </Button>
      )}

      <Dialog open={Boolean(metaComposer)} onOpenChange={(open) => { if (!open) setMetaComposer(null); }}>
        <DialogContent className="meta-composer-dialog max-h-[94vh] max-w-6xl overflow-hidden p-0 sm:p-0">
          <DialogHeader className="px-5 pt-5 pb-2 sm:px-6 shrink-0">
            <DialogTitle>{metaComposer?.publishNow ? 'Publicar' : 'Agendar'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(94vh-3.5rem)] overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
            {metaComposer ? (
              <TaskMetaComposer
                clientId={clientId}
                accounts={accounts}
                composer={metaComposer}
                onClose={() => setMetaComposer(null)}
                onSuccess={() => {
                  setMetaComposer(null);
                  load();
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <GoogleDrivePickerDialog
        open={driveOpen}
        onOpenChange={setDriveOpen}
        clienteId={clientId}
        onSelectFile={handleDriveSelect}
        acceptKinds="media"
        title="Arquivo deste canal"
      />
    </div>
  );
};

export default TaskPublicationsPanel;
