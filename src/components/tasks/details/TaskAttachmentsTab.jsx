import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, Link, HardDrive, ExternalLink, Paperclip, Loader2, Film, Image as ImageIcon, Play } from 'lucide-react';
import TaskFieldHelp from '@/components/tasks/TaskFieldHelp';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import GoogleDrivePickerDialog from '@/components/tasks/details/GoogleDrivePickerDialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChannelLogo } from '@/components/tasks/TaskChannelBadges';
import { CHANNEL_OPTIONS, CHANNEL_PUBLICATION_STATUSES, activePublications, buildPublicationPayload, combineScheduledDateTime, createEmptyPublication, defaultPublicationDate, destinationForChannel, firstAssigneeId } from '@/lib/taskChannelPublications';
import { describeAttachmentDeleteError } from '@/lib/taskAttachments';
import { syncGoogleDriveFile, getGoogleDriveStreamUrl } from '@/lib/googleDriveClient';
import { fetchClienteSocialAccounts } from '@/lib/clienteSocialAccounts';
import { taskPostCaption } from '@/lib/briefingObrigatorio';
import {
  attachmentHasInAppImage,
  attachmentHasInAppVideo,
  attachmentNeedsDriveImage,
  attachmentNeedsDriveStream,
  buildDriveAttachmentPayload,
  describeDriveSync,
  driveFileIdFromAttachment,
  driveOpenUrl,
  driveStreamThumbUrl,
  formatDriveBytes,
} from '@/lib/googleDriveMedia';

const MAIN_MATERIAL = '__main_material__';
const statusByValue = Object.fromEntries(CHANNEL_PUBLICATION_STATUSES.map((item) => [item.value, item]));

const TaskAttachmentsTab = ({
  taskId,
  clienteId,
  task = null,
  users = [],
  onAttachmentsChange,
  onPublicationsChange,
}) => {
  const [attachments, setAttachments] = useState([]);
  const [publications, setPublications] = useState([]);
  const [plannedChannels, setPlannedChannels] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [taskRow, setTaskRow] = useState(task);
  const [newAttachment, setNewAttachment] = useState({ name: '', url: '' });
  const [targetPublicationId, setTargetPublicationId] = useState(MAIN_MATERIAL);
  const [driveOpen, setDriveOpen] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [removingKey, setRemovingKey] = useState('');
  const { toast } = useToast();

  const fetchAttachments = useCallback(async () => {
    if (!taskId) return;
    const [attachmentResult, publicationResult, taskResult] = await Promise.all([
      supabase
        .from('task_attachments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true }),
      supabase
        .from('task_channel_publications')
        .select('*')
        .eq('task_id', taskId)
        .order('scheduled_for', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('tarefas')
        .select('id, client_id, planned_channels, post_date, due_date, assignee_ids, briefing_payload')
        .eq('id', taskId)
        .maybeSingle(),
    ]);

    if (attachmentResult.error || publicationResult.error) {
      toast({ title: 'Erro ao buscar anexos', description: attachmentResult.error?.message || publicationResult.error?.message, variant: 'destructive' });
    } else {
      setAttachments(attachmentResult.data || []);
      setPublications(publicationResult.data || []);
      onAttachmentsChange?.((attachmentResult.data || []).length);
      onPublicationsChange?.(activePublications(publicationResult.data || []));
    }
    const nextTask = taskResult.data || task || null;
    setTaskRow(nextTask);
    setPlannedChannels(
      [...new Set((nextTask?.planned_channels || []).filter((channel) => CHANNEL_OPTIONS.includes(channel)))],
    );
    const cid = nextTask?.client_id || clienteId;
    if (cid) {
      try {
        setAccounts(await fetchClienteSocialAccounts(supabase, cid));
      } catch {
        setAccounts([]);
      }
    }
  }, [clienteId, onAttachmentsChange, onPublicationsChange, task, taskId, toast]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const visiblePublications = activePublications(publications);
  const coveredChannels = new Set(visiblePublications.map((item) => item.channel));
  const pendingPlanned = plannedChannels.filter((channel) => !coveredChannels.has(channel));
  const sharedItems = attachments.filter((attachment) => !attachment.publication_id).map((attachment) => ({
    ...attachment,
    key: `attachment:${attachment.id}`,
    kind: 'attachment',
  }));
  const hideEmptyShared = sharedItems.length === 0 && (visiblePublications.length > 0 || pendingPlanned.length > 0);

  const ensureChannelPublication = async (channel) => {
    const existing = visiblePublications.find((item) => item.channel === channel);
    if (existing) return existing;
    const assigneeId = firstAssigneeId(taskRow || task, users);
    if (!assigneeId) {
      throw new Error('A tarefa precisa de um responsável.');
    }
    const when = combineScheduledDateTime(defaultPublicationDate(taskRow || task));
    const payload = buildPublicationPayload({
      ...createEmptyPublication(taskId, assigneeId),
      channel,
      destination: destinationForChannel(channel, accounts) || channel,
      scheduled_for: when.scheduled_for,
      scheduled_at: when.scheduled_at,
      caption: taskPostCaption(taskRow || task),
    }, taskId);
    let { data, error } = await supabase.from('task_channel_publications').insert(payload).select('*').maybeSingle();
    if (error && (String(error.message || '').includes('scheduled_at') || error.code === 'PGRST204')) {
      const without = { ...payload };
      delete without.scheduled_at;
      ({ data, error } = await supabase.from('task_channel_publications').insert(without).select('*').maybeSingle());
    }
    if (error) throw error;
    const next = [...publications, data];
    setPublications(next);
    onPublicationsChange?.(activePublications(next));
    return data;
  };

  const resolveTargetPublicationId = async () => {
    if (!targetPublicationId || targetPublicationId === MAIN_MATERIAL) return null;
    if (targetPublicationId.startsWith('planned:')) {
      const channel = targetPublicationId.slice('planned:'.length);
      const created = await ensureChannelPublication(channel);
      setTargetPublicationId(created.id);
      return created.id;
    }
    return targetPublicationId;
  };

  const handleAddAttachment = async () => {
    if (!newAttachment.name.trim() || !newAttachment.url.trim()) {
      toast({ title: 'Preencha o nome e a URL do anexo.', variant: 'destructive' });
      return;
    }
    try {
      const publicationId = await resolveTargetPublicationId();
      const { error } = await supabase.from('task_attachments').insert({
        task_id: taskId,
        name: newAttachment.name.trim(),
        url: newAttachment.url.trim(),
        provider: 'link',
        publication_id: publicationId,
      });
      if (error) {
        toast({ title: 'Erro ao adicionar anexo', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Anexo adicionado com sucesso!' });
        setNewAttachment({ name: '', url: '' });
        fetchAttachments();
      }
    } catch (error) {
      toast({ title: 'Erro ao adicionar anexo', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteItem = async (item) => {
    if (!item || removingKey) return;

    if (item.kind === 'publication_evidence' && item.status === 'published') {
      toast({
        title: 'Esta comprovação é obrigatória',
        description: 'Enquanto o canal estiver como Publicado, altere o link na aba Publicações.',
        variant: 'destructive',
      });
      return;
    }

    setRemovingKey(item.key);
    let error = null;
    if (item.kind === 'attachment') {
      const result = await supabase.from('task_attachments').delete().eq('id', item.id).select('id');
      error = result.error;
      if (!error && !result.data?.length) {
        error = { message: 'O anexo não foi removido. Atualize a página e tente de novo.' };
      }
    } else if (item.kind === 'publication_asset' || item.kind === 'publication_evidence') {
      const patch = item.kind === 'publication_asset' ? { asset_url: null } : { evidence_url: null };
      const result = await supabase
        .from('task_channel_publications')
        .update(patch)
        .eq('id', item.publicationId)
        .select('id');
      error = result.error;
      if (!error && !result.data?.length) {
        error = { message: 'O link não foi removido. Atualize a página e tente de novo.' };
      }
    }
    setRemovingKey('');
    if (error) {
      toast({ title: 'Não foi possível remover o link', description: describeAttachmentDeleteError(error), variant: 'destructive' });
      return;
    }
    toast({ title: 'Link removido' });
    fetchAttachments();
  };

  const handleDriveSelect = async (file) => {
    if (!file?.id && !file?.webViewLink) {
      toast({ title: 'Arquivo sem identificação', variant: 'destructive' });
      throw new Error('Arquivo sem identificação');
    }
    const sync = await syncGoogleDriveFile(clienteId, file.id);
    const publicationId = await resolveTargetPublicationId();
    const payload = buildDriveAttachmentPayload({
      taskId,
      publicationId,
      file,
      sync,
    });
    let { error } = await supabase.from('task_attachments').insert(payload);
    if (error && (String(error.message || '').includes('source_url') || error.code === 'PGRST204')) {
      const withoutSource = { ...payload };
      delete withoutSource.source_url;
      const retry = await supabase.from('task_attachments').insert(withoutSource);
      error = retry.error;
    }
    if (error && (String(error.message || '').includes('provider') || error.code === 'PGRST204')) {
      const fallback = await supabase.from('task_attachments').insert({
        task_id: taskId,
        name: payload.name,
        url: payload.url,
      });
      error = fallback.error;
    }
    if (error) {
      toast({ title: 'Erro ao anexar do Drive', description: error.message, variant: 'destructive' });
      throw error;
    }
    toast({ title: 'Anexo do Drive', description: describeDriveSync(sync) });
    fetchAttachments();
  };

  const openDrive = () => {
    if (!clienteId) {
      toast({
        title: 'Selecione um cliente na tarefa',
        description: 'O Drive é conectado por empresa. Defina o cliente na aba Tarefa.',
        variant: 'destructive',
      });
      return;
    }
    setDriveOpen(true);
  };

  const openDriveHere = (destination) => {
    setTargetPublicationId(destination);
    openDrive();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border bg-card p-3">
        <div className="flex items-center gap-1">
          <h4 className="text-sm font-medium">Adicionar</h4>
          <TaskFieldHelp label="Ajuda dos anexos">
            {clienteId
              ? 'Cada canal tem o próprio arquivo. Google Drive escolhe o material; Link cola uma URL. Material principal fica para o que serve em todos.'
              : 'Selecione o cliente na aba Tarefa para usar o Drive. Cada canal tem o próprio arquivo.'}
          </TaskFieldHelp>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={targetPublicationId} onValueChange={setTargetPublicationId}>
            <SelectTrigger className="h-9 min-w-[160px] flex-1" aria-label="Destino do anexo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={MAIN_MATERIAL}>Material principal</SelectItem>
              {visiblePublications.map((publication) => (
                <SelectItem key={publication.id} value={publication.id}>{publication.channel}{publication.destination ? ` · ${publication.destination}` : ''}</SelectItem>
              ))}
              {pendingPlanned.map((channel) => (
                <SelectItem key={`planned:${channel}`} value={`planned:${channel}`}>{channel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" onClick={openDrive} size="sm" className="h-9">
            <HardDrive size={14} className="mr-1.5" />
            Google Drive
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setShowLinkForm((open) => !open)}>
            <Link size={14} className="mr-1.5" />
            Link
          </Button>
        </div>
        {showLinkForm ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={newAttachment.name}
              onChange={(e) => setNewAttachment((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nome"
              className="h-9 text-sm"
            />
            <Input
              value={newAttachment.url}
              onChange={(e) => setNewAttachment((p) => ({ ...p, url: e.target.value }))}
              placeholder="Cole a URL"
              className="h-9 text-sm"
            />
            <Button type="button" onClick={handleAddAttachment} variant="outline" size="sm" className="h-9">
              Adicionar
            </Button>
          </div>
        ) : null}
      </div>

      {hideEmptyShared ? null : (
        <AttachmentGroup
          title="Material principal"
          items={sharedItems}
          clienteId={clienteId}
          removingKey={removingKey}
          onDelete={handleDeleteItem}
          onAddHere={() => openDriveHere(MAIN_MATERIAL)}
        />
      )}

      {visiblePublications.map((publication) => {
        const status = statusByValue[publication.status] || statusByValue.pending;
        return (
          <AttachmentGroup
            key={publication.id}
            title={publication.channel}
            subtitle={publication.destination}
            logo={<ChannelLogo channel={publication.channel} status={publication.status} />}
            status={<Badge style={{ backgroundColor: status.color }} className="text-white">{status.label}</Badge>}
            items={[
              publication.asset_url && {
                key: `asset:${publication.id}`,
                kind: 'publication_asset',
                publicationId: publication.id,
                name: 'Material deste canal',
                url: publication.asset_url,
              },
              publication.evidence_url && {
                key: `evidence:${publication.id}`,
                kind: 'publication_evidence',
                publicationId: publication.id,
                status: publication.status,
                name: 'Comprovação da publicação',
                url: publication.evidence_url,
              },
              ...attachments.filter((attachment) => attachment.publication_id === publication.id).map((attachment) => ({
                ...attachment,
                key: `attachment:${attachment.id}`,
                kind: 'attachment',
              })),
            ].filter(Boolean)}
            clienteId={clienteId}
            removingKey={removingKey}
            onDelete={handleDeleteItem}
            onAddHere={() => openDriveHere(publication.id)}
          />
        );
      })}

      {pendingPlanned.map((channel) => (
        <AttachmentGroup
          key={`planned:${channel}`}
          title={channel}
          logo={<ChannelLogo channel={channel} />}
          items={[]}
          clienteId={clienteId}
          removingKey={removingKey}
          onDelete={handleDeleteItem}
          onAddHere={() => openDriveHere(`planned:${channel}`)}
        />
      ))}

      <GoogleDrivePickerDialog
        open={driveOpen}
        onOpenChange={setDriveOpen}
        clienteId={clienteId}
        onSelectFile={handleDriveSelect}
      />
    </div>
  );
};

function AttachmentGroup({ title, subtitle, logo, status, items = [], clienteId, removingKey, onDelete, onAddHere }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {logo || <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted"><Paperclip className="h-4 w-4" /></span>}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-medium">{title}</h4>
              {status}
            </div>
            {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={onAddHere}>
          <HardDrive className="mr-1.5 h-3.5 w-3.5" />
          Adicionar
        </Button>
      </div>
      {items.length ? (
        <ul className="divide-y">
          {items.map((item) => (
            <AttachmentRow
              key={item.key}
              item={item}
              clienteId={clienteId}
              removingKey={removingKey}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function useDriveStreamSrc(clienteId, fileId) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clienteId || !fileId) {
      setLoading(false);
      setError('Falta o cliente ou o arquivo do Drive.');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setSrc('');
    getGoogleDriveStreamUrl(clienteId, fileId)
      .then((data) => {
        if (cancelled) return;
        const url = data?.path || data?.url;
        if (!url) throw new Error('Sem URL de reprodução');
        setSrc(url);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Não deu para abrir o arquivo do Drive.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clienteId, fileId]);

  return { src, error, loading };
}

function DriveStreamPlayer({ clienteId, fileId }) {
  const { src, error, loading } = useDriveStreamSrc(clienteId, fileId);
  const poster = src ? driveStreamThumbUrl(src) : undefined;

  if (src) {
    return (
      <video
        controls
        playsInline
        preload="metadata"
        poster={poster}
        src={src}
        className="w-full max-h-56 rounded-md bg-black"
      >
        Seu navegador não reproduz este vídeo.
      </video>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-md bg-muted">
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">Vídeo do Drive</div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-xs px-3 text-center">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparando o vídeo…
          </span>
        ) : (
          error || 'Não deu para tocar aqui. Use Drive.'
        )}
      </div>
    </div>
  );
}

function DriveStreamImage({ clienteId, fileId, thumb = false, className }) {
  const { src, error, loading } = useDriveStreamSrc(clienteId, fileId);
  const displaySrc = src && thumb ? driveStreamThumbUrl(src) : src;
  if (displaySrc) {
    return (
      <img
        src={displaySrc}
        alt=""
        className={className || (thumb ? 'h-11 w-11 rounded-lg object-cover bg-muted' : 'max-h-48 w-full rounded-md object-contain bg-muted')}
      />
    );
  }
  if (thumb) {
    return (
      <span className={`flex items-center justify-center bg-muted text-muted-foreground ${className || 'h-11 w-11 rounded-lg'}`}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
      </span>
    );
  }
  return (
    <div className="flex h-28 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground px-3 text-center">
      {loading ? 'Abrindo imagem do Drive…' : error || 'Imagem do Drive'}
    </div>
  );
}

function attachmentMeta(item) {
  const parts = [];
  if (item.provider === 'google_drive') parts.push('Drive');
  else if (item.kind === 'publication_evidence') parts.push('Comprovação');
  else if (item.url) parts.push('Link');
  const size = Number(item.size_bytes) > 0 ? formatDriveBytes(item.size_bytes) : '';
  if (size) parts.push(size);
  return parts.join(' · ');
}

function AttachmentThumb({ item, clienteId }) {
  const fileId = driveFileIdFromAttachment(item);
  const isVideo = attachmentNeedsDriveStream(item) || attachmentHasInAppVideo(item);
  const isImage = attachmentNeedsDriveImage(item) || attachmentHasInAppImage(item) || Boolean(item.thumbnail_url);
  const icon = isVideo
    ? <Film className="h-5 w-5 text-violet-600" />
    : isImage
      ? <ImageIcon className="h-5 w-5 text-sky-600" />
      : <Paperclip className="h-4 w-4 text-muted-foreground" />;

  let preview = null;
  if (fileId && clienteId && (isImage || isVideo)) {
    preview = <DriveStreamImage clienteId={clienteId} fileId={fileId} thumb className="absolute inset-0 h-full w-full object-cover" />;
  } else if (isImage && (item.thumbnail_url || item.url)) {
    preview = <img src={item.thumbnail_url || item.url} alt="" className="absolute inset-0 h-full w-full object-cover" />;
  }

  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
      {icon}
      {preview}
      {isVideo ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <Play className="h-3.5 w-3.5 fill-white text-white" />
        </span>
      ) : null}
    </span>
  );
}

function AttachmentRow({ item, clienteId, removingKey, onDelete }) {
  const [playing, setPlaying] = useState(false);
  const openUrl = driveOpenUrl(item) || item.url;
  const fileId = driveFileIdFromAttachment(item);
  const streamVideo = attachmentNeedsDriveStream(item);
  const storedVideo = !streamVideo && attachmentHasInAppVideo(item);
  const canPlay = streamVideo || storedVideo;
  const meta = attachmentMeta(item);

  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="shrink-0"
          aria-label={canPlay ? `Ver ${item.name}` : `Abrir ${item.name}`}
          onClick={() => {
            if (canPlay) {
              setPlaying((open) => !open);
              return;
            }
            if (openUrl) window.open(openUrl, '_blank', 'noopener,noreferrer');
          }}
        >
          <AttachmentThumb item={item} clienteId={clienteId} />
        </button>
        <div className="min-w-0 flex-1">
          {openUrl ? (
            <a href={openUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium hover:underline">
              {item.name}
            </a>
          ) : (
            <p className="truncate text-sm font-medium">{item.name}</p>
          )}
          {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
        </div>
        {canPlay ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={playing ? 'Fechar vídeo' : `Assistir ${item.name}`}
            onClick={() => setPlaying((open) => !open)}
          >
            <Play className="h-4 w-4" />
          </Button>
        ) : null}
        {openUrl ? (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir ${item.name}`}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={`Remover ${item.name}`}
          disabled={removingKey === item.key}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete(item);
          }}
        >
          <X size={16} className="text-red-500" />
        </Button>
      </div>
      {playing && canPlay ? (
        <div className="mt-2">
          {streamVideo ? (
            <DriveStreamPlayer clienteId={clienteId} fileId={fileId} />
          ) : (
            <video
              controls
              playsInline
              preload="metadata"
              poster={item.thumbnail_url || undefined}
              src={item.url}
              className="w-full max-h-56 rounded-md bg-black"
            >
              Seu navegador não reproduz este vídeo.
            </video>
          )}
        </div>
      ) : null}
    </li>
  );
}

export default TaskAttachmentsTab;
