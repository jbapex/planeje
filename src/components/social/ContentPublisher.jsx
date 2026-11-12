import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Calendar as CalendarIcon,
  Send,
  Upload,
  HardDrive,
  X,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Film,
  Link2,
  Instagram,
  Facebook,
  Clock,
  LayoutGrid,
  Pause,
  Play,
  Heart,
  MessageCircle,
  Bookmark,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import GoogleDrivePickerDialog from '@/components/tasks/details/GoogleDrivePickerDialog';
import {
  cleanupMetaPublishMedia,
  META_IMAGE_MAX_BYTES,
  META_REELS_MAX_BYTES,
  META_VIDEO_MAX_BYTES,
  attachDriveMediaForMeta,
  metaResumableHint,
  stageDriveFileForMeta,
  uploadLocalFileForMeta,
} from '@/lib/metaPublishMedia';
import { snapshotSelectedFiles } from '@/lib/snapshotSelectedFiles';
import { reorderSlides } from '@/lib/reorderSlides';
import { mediaNeedsResumable, publishLargeFacebookVideo, publishLargeInstagramReel } from '@/lib/metaResumableUpload';
import { driveStreamThumbUrl, formatDriveBytes } from '@/lib/googleDriveMedia';
import {
  clampVideoOffset,
  composerCoverChip,
  composerCoverOffset,
  composerPhonePoster,
  composerStillKind,
  formatVideoClock,
} from '@/lib/composerVideoPreview';
import { describeMetaPublishError } from '@/lib/metaInstagramSchedule';
import { carouselChildrenFromSlides, describeScheduleSaveError, futureScheduleAt, saveScheduledComposerPublication, updateScheduledTaskPublication } from '@/lib/scheduleSocialComposer';
import { shouldPrepareInstagramNow } from '@/lib/igSchedulePrepare';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import './ContentPublisher.css';

function videoPoster(src) {
  const value = String(src || '').trim();
  if (!value) return undefined;
  if (value.includes('google-drive-api') || value.includes('action=stream')) {
    return driveStreamThumbUrl(value);
  }
  return undefined;
}

function seekVideoEl(el, seconds) {
  if (!el) return;
  const next = Number(seconds) || 0;
  const apply = () => {
    try {
      if (Math.abs((el.currentTime || 0) - next) > 0.08) el.currentTime = next;
    } catch {
      /* stream ainda não aceita seek */
    }
  };
  apply();
  if (el.readyState < 1) el.addEventListener('loadedmetadata', apply, { once: true });
}

function paintPausedFrame(el, seconds, playingRef) {
  seekVideoEl(el, seconds);
  if (!el || playingRef?.current) return;
  if (el.readyState < 1) return;
  const wasMuted = el.muted;
  el.muted = true;
  const stop = () => {
    if (playingRef?.current) {
      el.muted = wasMuted;
      return;
    }
    el.pause();
    seekVideoEl(el, seconds);
    el.muted = wasMuted;
  };
  const run = el.play();
  if (run?.then) run.then(stop).catch(() => { el.muted = wasMuted; });
  else stop();
}

const MAX_CAROUSEL = 10;

const ContentPublisher = ({
  type: typeProp = 'instagram',
  pages = [],
  instagramAccounts = [],
  selectedPage,
  selectedInstagram,
  clientId = null,
  clientName = '',
  clientOptions = null,
  onClientChange = null,
  profilePictureUrl = '',
  initialFormat = null,
  initialScheduledTime = null,
  initialWhenMode = null,
  initialCaption = '',
  initialMedia = null,
  initialCoverMode = 'auto',
  initialThumbOffsetSec = 0,
  existingPublicationId = null,
  onClose,
  onSuccess,
  onFormatChange = null,
}) => {
  const hasIg = instagramAccounts.length > 0;
  const hasFb = pages.length > 0;
  const [channel, setChannel] = useState(
    typeProp === 'pages' || (!hasIg && hasFb) ? 'facebook' : 'instagram'
  );
  const [message, setMessage] = useState(initialCaption || '');
  const [link, setLink] = useState('');
  const [igFormat, setIgFormat] = useState(initialFormat || (initialMedia?.kind === 'video' ? 'REELS' : 'IMAGE'));
  const [scheduledTime, setScheduledTime] = useState(initialScheduledTime || null);
  const [whenMode, setWhenMode] = useState(initialWhenMode || (initialScheduledTime ? 'schedule' : 'now'));
  const [selectedPageId, setSelectedPageId] = useState(selectedPage || pages[0]?.id || '');
  const [selectedInstagramId, setSelectedInstagramId] = useState(
    selectedInstagram || instagramAccounts[0]?.id || ''
  );
  const [loading, setLoading] = useState(false);
  const [staging, setStaging] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveTarget, setDriveTarget] = useState('media');
  const [media, setMedia] = useState(initialMedia || null);
  const [slides, setSlides] = useState([]);
  const [previewSlide, setPreviewSlide] = useState(0);
  const [cover, setCover] = useState(null);
  const [coverMode, setCoverMode] = useState(initialCoverMode || 'auto');
  const [thumbOffsetSec, setThumbOffsetSec] = useState(Number(initialThumbOffsetSec) || 0);
  const [showAdvancedUrl, setShowAdvancedUrl] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const phoneVideoRef = useRef(null);
  const coverFrameRef = useRef(null);
  const playingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const { toast } = useToast();
  const { user } = useAuth();
  playingRef.current = playing;

  useEffect(() => {
    onFormatChange?.(igFormat);
  }, [igFormat, onFormatChange]);

  const isIg = channel === 'instagram';
  const isReels = isIg && igFormat === 'REELS';
  const isCarousel = isIg && igFormat === 'CAROUSEL';
  const publishNow = whenMode === 'now';
  const previewUrl = media?.previewUrl || media?.publicUrl || '';
  const coverPreview = cover?.previewUrl || cover?.publicUrl || '';
  const poster = videoPoster(previewUrl);
  const captionLimit = 2200;
  const captionCount = message.length;

  const accountLabel = useMemo(() => {
    if (isIg) {
      const acc = instagramAccounts.find((a) => a.id === selectedInstagramId);
      return acc ? `@${String(acc.username || acc.name || '').replace(/^@/, '')}` : '@instagram';
    }
    return pages.find((p) => p.id === selectedPageId)?.name || 'Página';
  }, [isIg, instagramAccounts, selectedInstagramId, pages, selectedPageId]);

  const accountAvatar = useMemo(() => {
    if (isIg) {
      const acc = instagramAccounts.find((a) => a.id === selectedInstagramId);
      return acc?.profile_picture_url || profilePictureUrl || '';
    }
    const page = pages.find((p) => p.id === selectedPageId);
    return page?.profile_picture_url || page?.picture || profilePictureUrl || '';
  }, [isIg, instagramAccounts, selectedInstagramId, pages, selectedPageId, profilePictureUrl]);

  useEffect(() => {
    setPlaying(false);
    setDuration(0);
  }, [previewUrl]);

  const coverOffset = composerCoverOffset(coverMode, thumbOffsetSec, duration);

  useEffect(() => {
    if (playing) return undefined;
    seekVideoEl(phoneVideoRef.current, coverOffset);
    seekVideoEl(coverFrameRef.current, coverOffset);
    return undefined;
  }, [playing, coverOffset, previewUrl]);

  const rememberDuration = (el) => {
    const next = Number(el?.duration);
    if (Number.isFinite(next) && next > 0) setDuration(next);
    if (!playingRef.current) {
      if (el === phoneVideoRef.current) paintPausedFrame(el, coverOffset, playingRef);
      else seekVideoEl(el, coverOffset);
    }
  };

  const togglePlay = () => {
    if (isCarousel) return;
    if (!(media?.kind === 'video' || isReels)) return;
    setPlaying((current) => !current);
  };

  useEffect(() => {
    const el = phoneVideoRef.current;
    if (!el) return;
    if (playing) {
      el.muted = false;
      const run = el.play();
      if (run?.catch) {
        run.catch(() => {
          el.muted = true;
          el.play().catch(() => {});
        });
      }
    } else {
      el.pause();
      paintPausedFrame(el, coverOffset, playingRef);
    }
  }, [playing, coverOffset, previewUrl]);

  const clearMedia = async () => {
    if (media?.storagePath && media?.temporary) await cleanupMetaPublishMedia(media.storagePath);
    setMedia(null);
    setManualUrl('');
    setPlaying(false);
    setDuration(0);
    setThumbOffsetSec(0);
  };

  const clearSlides = async () => {
    await Promise.all(
      slides
        .filter((s) => s?.storagePath && s?.temporary)
        .map((s) => cleanupMetaPublishMedia(s.storagePath))
    );
    setSlides([]);
    setPreviewSlide(0);
  };

  const clearCover = async () => {
    if (cover?.storagePath && cover?.temporary) await cleanupMetaPublishMedia(cover.storagePath);
    setCover(null);
  };

  const changeFormat = async (next) => {
    if (next === igFormat) return;
    if (next === 'CAROUSEL') {
      if (media) {
        setSlides([media]);
        setMedia(null);
        setPreviewSlide(0);
      }
      setIgFormat('CAROUSEL');
      return;
    }
    if (igFormat === 'CAROUSEL' && slides.length) {
      const [first, ...rest] = slides;
      setMedia(first || null);
      await Promise.all(
        rest
          .filter((s) => s?.storagePath && s?.temporary)
          .map((s) => cleanupMetaPublishMedia(s.storagePath))
      );
      setSlides([]);
      setPreviewSlide(0);
    }
    setIgFormat(next);
  };

  const applyStaged = (staged, previewOverride = null) => {
    const item = { ...staged, previewUrl: previewOverride || staged.previewUrl || staged.publicUrl };
    if (isCarousel) {
      setSlides((prev) => {
        if (prev.length >= MAX_CAROUSEL) return prev;
        const next = [...prev, item];
        setPreviewSlide(next.length - 1);
        return next;
      });
      return;
    }
    setMedia(item);
    if (isIg && igFormat !== 'CAROUSEL') {
      setIgFormat(staged.kind === 'video' ? 'REELS' : 'IMAGE');
    }
  };

  const applyCoverStaged = (staged, previewOverride = null) => {
    if (staged.kind === 'video') {
      toast({ title: 'Capa precisa ser imagem', description: 'Envie JPG ou PNG', variant: 'destructive' });
      return;
    }
    setCover({ ...staged, previewUrl: previewOverride || staged.publicUrl });
    setCoverMode('image');
  };

  const handleLocalFiles = async (fileList, target = 'media') => {
    const files = [...(fileList || [])].filter(Boolean);
    if (!files.length) return;
    setStaging(true);
    try {
      if (target === 'cover') {
        if (cover?.storagePath && cover?.temporary) await cleanupMetaPublishMedia(cover.storagePath);
        const file = files[0];
        const localPreview = URL.createObjectURL(file);
        applyCoverStaged(await uploadLocalFileForMeta(file, { clientId }), localPreview);
        toast({ title: 'Capa pronta' });
        return;
      }
      if (isCarousel) {
        const room = MAX_CAROUSEL - slides.length;
        if (room <= 0) {
          toast({ title: 'Limite do carrossel', description: 'Máximo de 10 slides', variant: 'destructive' });
          return;
        }
        const batch = files.slice(0, room);
        const staged = [];
        for (const file of batch) {
          const localPreview = URL.createObjectURL(file);
          const item = await uploadLocalFileForMeta(file, { clientId });
          if (item.large) {
            throw new Error('No carrossel o vídeo pode ter até 40 MB. Use Reels para arquivo grande.');
          }
          staged.push({
            ...item,
            previewUrl: localPreview,
          });
        }
        setSlides((prev) => {
          const next = [...prev, ...staged].slice(0, MAX_CAROUSEL);
          setPreviewSlide(Math.max(0, next.length - 1));
          return next;
        });
        toast({ title: batch.length > 1 ? `${batch.length} slides prontos` : 'Slide pronto' });
        return;
      }
      if (media?.storagePath && media?.temporary) await cleanupMetaPublishMedia(media.storagePath);
      const file = files[0];
      const localPreview = URL.createObjectURL(file);
      applyStaged(await uploadLocalFileForMeta(file, { clientId }), localPreview);
      toast({ title: 'Mídia pronta' });
    } catch (err) {
      toast({
        title: 'Não deu para preparar a mídia',
        description: err.message || 'Tente outro arquivo',
        variant: 'destructive',
      });
    } finally {
      setStaging(false);
    }
  };

  const handleDriveSelect = async (file) => {
    setStaging(true);
    try {
      if (driveTarget !== 'cover' && isCarousel && mediaNeedsResumable({
        kind: String(file?.mimeType || '').startsWith('video/') ? 'video' : 'image',
        size: file?.size,
      })) {
        throw new Error('No carrossel o vídeo pode ter até 40 MB. Use Reels para arquivo grande.');
      }
      const staged = driveTarget === 'cover'
        ? await stageDriveFileForMeta(clientId, file)
        : await attachDriveMediaForMeta(clientId, file);
      if (driveTarget === 'cover') {
        if (cover?.storagePath && cover?.temporary) await cleanupMetaPublishMedia(cover.storagePath);
        applyCoverStaged(staged);
        toast({ title: 'Capa do Drive pronta' });
      } else if (isCarousel) {
        if (slides.length >= MAX_CAROUSEL) {
          toast({ title: 'Limite do carrossel', description: 'Máximo de 10 slides', variant: 'destructive' });
          return;
        }
        if (staged.large) {
          throw new Error('No carrossel o vídeo pode ter até 40 MB. Use Reels para arquivo grande.');
        }
        applyStaged(staged);
        toast({ title: 'Slide do Drive pronto' });
      } else {
        if (media?.storagePath && media?.temporary) await cleanupMetaPublishMedia(media.storagePath);
        applyStaged(staged);
        toast({
          title: staged.large ? 'Vídeo grande pronto' : 'Arquivo do Drive pronto',
          description: staged.large ? metaResumableHint() : undefined,
        });
      }
    } catch (err) {
      toast({
        title: 'Não deu para usar o Drive',
        description: err.message || 'Conecte o Drive do cliente',
        variant: 'destructive',
      });
      throw err;
    } finally {
      setStaging(false);
    }
  };

  const applyManualUrl = () => {
    const url = String(manualUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      toast({ title: 'URL inválida', variant: 'destructive' });
      return;
    }
    const kind = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? 'video' : 'image';
    const item = {
      publicUrl: url,
      previewUrl: url,
      storagePath: null,
      temporary: false,
      source: 'url',
      kind,
      name: 'URL externa',
    };
    if (isCarousel) {
      if (slides.length >= MAX_CAROUSEL) {
        toast({ title: 'Limite do carrossel', description: 'Máximo de 10 slides', variant: 'destructive' });
        return;
      }
      setSlides((prev) => {
        const next = [...prev, item];
        setPreviewSlide(next.length - 1);
        return next;
      });
      setManualUrl('');
      return;
    }
    setMedia(item);
    if (isIg) setIgFormat(kind === 'video' ? 'REELS' : 'IMAGE');
    setManualUrl('');
  };

  const moveSlide = (from, to) => {
    setSlides((prev) => {
      const next = reorderSlides(prev, from, to);
      if (next !== prev) setPreviewSlide(to);
      return next;
    });
  };

  const removeSlide = async (index) => {
    const item = slides[index];
    if (item?.storagePath && item?.temporary) await cleanupMetaPublishMedia(item.storagePath);
    setSlides((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setPreviewSlide((cur) => Math.min(cur, Math.max(0, next.length - 1)));
      return next;
    });
  };

  const handlePublish = async () => {
    if (isIg) {
      if (!selectedInstagramId) {
        toast({ title: 'Escolha a conta Instagram', variant: 'destructive' });
        return;
      }
      if (isCarousel) {
        if (slides.length < 2) {
          toast({
            title: 'Carrossel incompleto',
            description: 'Envie de 2 a 10 imagens ou vídeos',
            variant: 'destructive',
          });
          return;
        }
      } else if (!media?.publicUrl && !mediaNeedsResumable(media)) {
        toast({ title: 'Falta a mídia', description: 'Envie um arquivo ou escolha no Drive', variant: 'destructive' });
        return;
      }
      if (igFormat === 'REELS' && media?.kind === 'image') {
        toast({ title: 'Reels precisa de vídeo', variant: 'destructive' });
        return;
      }
      if (igFormat === 'IMAGE' && media?.kind === 'video') {
        toast({ title: 'Mude o formato para Reels ou Carrossel', variant: 'destructive' });
        return;
      }
    } else {
      if (!selectedPageId) {
        toast({ title: 'Escolha a página', variant: 'destructive' });
        return;
      }
      if (!message && !link && !media?.publicUrl && !mediaNeedsResumable(media)) {
        toast({ title: 'Conteúdo vazio', variant: 'destructive' });
        return;
      }
    }
    if (!publishNow && !scheduledTime) {
      toast({ title: 'Escolha data e hora', variant: 'destructive' });
      return;
    }
    if (!publishNow && isIg && isCarousel && !carouselChildrenFromSlides(slides)) {
      toast({
        title: 'Carrossel incompleto',
        description: 'Cada slide precisa estar pronto, de 2 a 10, para agendar.',
        variant: 'destructive',
      });
      return;
    }
    if (!publishNow && isIg && !isCarousel && !media?.driveFileId) {
      toast({
        title: 'Escolha o arquivo no Drive',
        description: 'Para postar na data certa, o arquivo precisa continuar no Drive até a hora.',
        variant: 'destructive',
      });
      return;
    }

    const syncExistingPublication = async (patch) => {
      if (!existingPublicationId) return;
      const { error } = await supabase
        .from('task_channel_publications')
        .update(patch)
        .eq('id', existingPublicationId);
      if (error) throw error;
    };
    const sentPatch = (data, scheduled) => {
      const postId = data?.post_id || data?.media_id || data?.id || null;
      return {
        status: scheduled ? 'scheduled' : 'published',
        published_on: scheduled ? null : format(new Date(), 'yyyy-MM-dd'),
        caption: String(message || '').trim() || null,
        destination: accountLabel,
        ...(data?.permalink ? { evidence_url: data.permalink } : {}),
        ...(postId ? { meta_post_id: String(postId) } : {}),
      };
    };

    setLoading(true);
    try {
      if (!publishNow && isIg) {
        const scheduleInput = {
          userId: user?.id,
          clientId,
          isIg: true,
          igFormat,
          destination: accountLabel,
          caption: message,
          scheduledAt: scheduledTime,
          media: isCarousel ? (slides[0] || null) : media,
          slides: isCarousel ? slides : null,
          cover: {
            coverMode,
            thumbOffsetMs: coverMode === 'frame'
              ? Math.max(0, Math.round(Number(thumbOffsetSec) * 1000))
              : 0,
            driveFileId: cover?.driveFileId || null,
          },
          instagramAccountId: selectedInstagramId,
        };
        const saved = existingPublicationId
          ? await updateScheduledTaskPublication(supabase, { ...scheduleInput, publicationId: existingPublicationId })
          : await saveScheduledComposerPublication(supabase, scheduleInput);
        const whenLabel = format(scheduledTime, "dd/MM/yyyy HH:mm", { locale: ptBR });
        if (isCarousel) {
          toast({
            title: 'Agendado',
            description: `Entra no ar em ${whenLabel}. Os ${slides.length} slides ficam guardados até essa hora.`,
          });
          onSuccess?.(saved);
          return;
        }
        const prepareVideo = (igFormat === 'REELS' || media?.kind === 'video')
          && shouldPrepareInstagramNow(scheduledTime);
        if (prepareVideo) {
          await supabase
            .from('task_channel_publications')
            .update({
              meta_dispatch: {
                ...(saved.publication?.meta_dispatch || {}),
                hold: true,
                phase: 'queued',
              },
            })
            .eq('id', saved.publication.id);
          toast({
            title: 'Agendado',
            description: `Pode fechar. O vídeo segue para a Meta e entra no ar em ${whenLabel}. O progresso fica em Agendados.`,
          });
        } else {
          const farVideo = (igFormat === 'REELS' || media?.kind === 'video') && !shouldPrepareInstagramNow(scheduledTime);
          toast({
            title: 'Agendado',
            description: farVideo
              ? `Entra no ar em ${whenLabel}. O vídeo vai para a Meta no dia anterior, perto dessa hora.`
              : `Entra no ar em ${whenLabel}. Não vai agora.`,
          });
        }
        onSuccess?.(saved);
        return;
      }
      setUploadProgress({ phase: 'upload', percent: 0 });
      const onProgress = (info) => setUploadProgress(info);
      if (!isIg) {
        if (mediaNeedsResumable(media) || (media?.kind === 'video' && !media?.publicUrl)) {
          const data = await publishLargeFacebookVideo({
            pageId: selectedPageId,
            clienteId: clientId,
            driveFileId: media?.driveFileId,
            localFile: media?.localFile || null,
            fileSize: media?.size,
            message,
            scheduledUnix: !publishNow && scheduledTime ? Math.floor(scheduledTime.getTime() / 1000) : null,
            onProgress,
          });
          toast({
            title: 'Pronto!',
            description: publishNow
              ? 'Vídeo publicado no Facebook.'
              : `Agendado para ${format(scheduledTime, 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
          });
          await syncExistingPublication(sentPatch(data, !publishNow));
          onSuccess?.(data);
          return;
        }
        const body = { action: 'publish-page-post', page_id: selectedPageId };
        if (message) body.message = message;
        if (link) body.link = link;
        else if (media?.publicUrl && media.kind === 'video') body.file_url = media.publicUrl;
        else if (media?.publicUrl && media.kind !== 'video') body.link = media.publicUrl;
        if (!publishNow && scheduledTime) {
          body.scheduled_publish_time = Math.floor(scheduledTime.getTime() / 1000);
        }
        const { data, error } = await supabase.functions.invoke('meta-ads-api', { body });
        if (error) throw new Error(describeMetaPublishError(error));
        if (data?.error) throw new Error(describeMetaPublishError(data.error));
        toast({
          title: 'Pronto!',
          description: publishNow
            ? 'Post publicado no Facebook.'
            : `Agendado para ${format(scheduledTime, 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        });
        if (publishNow && media?.temporary && media.storagePath) {
          await cleanupMetaPublishMedia(media.storagePath);
        }
        await syncExistingPublication(sentPatch(data, !publishNow));
        onSuccess?.(data);
      } else if (mediaNeedsResumable(media) && !isCarousel) {
        const data = await publishLargeInstagramReel({
          instagramAccountId: selectedInstagramId,
          clienteId: clientId,
          driveFileId: media?.driveFileId,
          localFile: media?.localFile || null,
          fileSize: media?.size,
          caption: message,
          coverUrl: coverMode === 'image' && cover?.publicUrl ? cover.publicUrl : '',
          thumbOffset: coverMode === 'frame'
            ? Math.max(0, Math.round(Number(thumbOffsetSec) * 1000))
            : null,
          onProgress,
        });
        toast({
          title: 'Pronto!',
          description: 'Reels publicado no Instagram.',
        });
        await syncExistingPublication(sentPatch(data, false));
        onSuccess?.(data);
      } else {
        const body = {
          action: 'publish-instagram-content',
          instagram_account_id: selectedInstagramId,
          caption: message,
          media_type: igFormat,
        };
        if (isCarousel) {
          body.children = slides.map((slide) => (
            slide.kind === 'video'
              ? { video_url: slide.publicUrl }
              : { image_url: slide.publicUrl }
          ));
        } else if (igFormat === 'REELS') {
          body.video_url = media.publicUrl;
          if (coverMode === 'image' && cover?.publicUrl) body.cover_url = cover.publicUrl;
          else if (coverMode === 'frame') {
            body.thumb_offset = Math.max(0, Math.round(Number(thumbOffsetSec) * 1000));
          }
        } else {
          body.image_url = media.publicUrl;
        }
        const { data, error } = await supabase.functions.invoke('meta-ads-api', { body });
        if (error) throw new Error(describeMetaPublishError(error));
        if (data?.error) throw new Error(describeMetaPublishError(data.error));
        toast({
          title: 'Pronto!',
          description: 'Conteúdo publicado no Instagram.',
        });
        if (media?.temporary && media.storagePath) await cleanupMetaPublishMedia(media.storagePath);
        if (cover?.temporary && cover.storagePath) await cleanupMetaPublishMedia(cover.storagePath);
        await Promise.all(
          slides
            .filter((s) => s?.temporary && s?.storagePath)
            .map((s) => cleanupMetaPublishMedia(s.storagePath))
        );
        await syncExistingPublication(sentPatch(data, false));
        onSuccess?.(data);
      }
    } catch (err) {
      toast({
        title: (!publishNow && isIg) ? 'Não deu para agendar' : 'Erro ao publicar',
        description: (!publishNow && isIg) ? describeScheduleSaveError(err) : describeMetaPublishError(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const busy = loading || staging;
  const activeSlide = isCarousel ? slides[previewSlide] : null;
  const stillKind = composerStillKind(coverMode, {
    hasCoverImage: Boolean(coverPreview),
    isVideo: Boolean(media?.kind === 'video' || isReels),
  });
  const phonePreviewSrc = isCarousel
    ? (activeSlide?.previewUrl || activeSlide?.publicUrl || '')
    : previewUrl;
  const phoneShowsCoverImage = !playing && !isCarousel && stillKind === 'image';
  const phoneIsVideo = isCarousel
    ? activeSlide?.kind === 'video'
    : Boolean((media?.kind === 'video' || isReels) && phonePreviewSrc && !phoneShowsCoverImage);
  const phonePoster = composerPhonePoster(stillKind, {
    playing,
    drivePoster: isCarousel ? undefined : poster,
  });
  const coverChip = composerCoverChip(coverMode, formatVideoClock(coverOffset));
  const showMediaPicker = isCarousel ? slides.length < MAX_CAROUSEL : !media;
  const hasDestination = hasIg || hasFb;
  const phoneMediaNode = phoneShowsCoverImage ? (
    <img src={coverPreview} alt="" />
  ) : phonePreviewSrc ? (
    phoneIsVideo ? (
      <video
        ref={isCarousel ? undefined : phoneVideoRef}
        src={phonePreviewSrc}
        muted={!playing}
        playsInline
        preload="metadata"
        poster={phonePoster}
        onLoadedMetadata={(event) => {
          if (!isCarousel) rememberDuration(event.currentTarget);
        }}
        onEnded={() => setPlaying(false)}
      />
    ) : (
      <img src={phonePreviewSrc} alt="" />
    )
  ) : (
    <span>sem mídia</span>
  );

  return (
    <div className={`meta-composer ${isReels ? 'is-reel' : ''}`}>
      <div className="meta-composer-main">
        {Array.isArray(clientOptions) && clientOptions.length > 0 && typeof onClientChange === 'function' ? (
          <div className="meta-composer-field">
            <span className="meta-composer-label">Cliente</span>
            <Select value={clientId || ''} onValueChange={onClientChange}>
              <SelectTrigger className="meta-composer-select">
                <SelectValue placeholder="Cliente com Meta ligada" />
              </SelectTrigger>
              <SelectContent>
                {clientOptions.map((client) => (
                  <SelectItem key={client.id} value={client.id}>{client.empresa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="meta-composer-hint">Só clientes com Instagram ou Facebook ligados.</p>
          </div>
        ) : null}

        {!hasDestination ? (
          <div className="meta-composer-empty">
            <p>Este cliente não tem Instagram ou Facebook ligados.</p>
            <p>Liga a conta em Perfil e feed para publicar na Meta.</p>
          </div>
        ) : (
          <>
        <div className="meta-composer-field">
          <span className="meta-composer-label">Postar em</span>
          <div className="meta-composer-post-to">
            {instagramAccounts.map((account) => {
              const handle = `@${String(account.username || account.name || '').replace(/^@/, '')}`;
              const on = isIg && selectedInstagramId === account.id;
              return (
                <button
                  key={account.id}
                  type="button"
                  className={`meta-composer-account ${on ? 'is-on is-ig' : ''}`}
                  onClick={() => {
                    setChannel('instagram');
                    setSelectedInstagramId(account.id);
                  }}
                >
                  <span className="meta-composer-account-avatar">
                    {account.profile_picture_url ? <img src={account.profile_picture_url} alt="" /> : null}
                  </span>
                  <span className="meta-composer-account-copy">
                    <strong>{handle}</strong>
                    <em>Instagram</em>
                  </span>
                  <Instagram className="h-4 w-4" />
                </button>
              );
            })}
            {pages.map((page) => {
              const on = !isIg && selectedPageId === page.id;
              return (
                <button
                  key={page.id}
                  type="button"
                  className={`meta-composer-account ${on ? 'is-on is-fb' : ''}`}
                  onClick={() => {
                    setChannel('facebook');
                    setSelectedPageId(page.id);
                  }}
                >
                  <span className="meta-composer-account-avatar">
                    {(page.profile_picture_url || page.picture) ? (
                      <img src={page.profile_picture_url || page.picture} alt="" />
                    ) : null}
                  </span>
                  <span className="meta-composer-account-copy">
                    <strong>{page.name}</strong>
                    <em>Facebook</em>
                  </span>
                  <Facebook className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>

        {isIg ? (
          <div className="meta-composer-field">
            <span className="meta-composer-label">Formato</span>
            <div className="meta-composer-seg">
              <button type="button" className={igFormat === 'IMAGE' ? 'is-on' : ''} onClick={() => void changeFormat('IMAGE')}>
                <ImageIcon className="h-3.5 w-3.5" /> Post
              </button>
              <button type="button" className={igFormat === 'CAROUSEL' ? 'is-on' : ''} onClick={() => void changeFormat('CAROUSEL')}>
                <LayoutGrid className="h-3.5 w-3.5" /> Carrossel
              </button>
              <button type="button" className={igFormat === 'REELS' ? 'is-on' : ''} onClick={() => void changeFormat('REELS')}>
                <Film className="h-3.5 w-3.5" /> Reels
              </button>
            </div>
            {media?.kind === 'video' ? (
              <p className="meta-composer-schedule-hint">
                No Instagram a API só recebe vídeo como Reels (aparece no feed). Telefone e Meta Business convertem o arquivo; o Planeje envia o MP4 do Drive.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="meta-composer-field">
          <span className="meta-composer-label">
            {isCarousel ? `Slides (${slides.length}/${MAX_CAROUSEL})` : 'Mídia'}
          </span>

          {isCarousel && slides.length > 0 ? (
            <div className="meta-composer-slides">
              {slides.map((slide, index) => {
                const src = slide.previewUrl || slide.publicUrl;
                return (
                  <div
                    key={`${slide.storagePath || slide.publicUrl || slide.name || 'slide'}-${index}`}
                    className={`meta-composer-slide ${previewSlide === index ? 'is-on' : ''}`}
                    draggable={!busy}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(index));
                    }}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const from = Number(e.dataTransfer.getData('text/plain'));
                      if (Number.isInteger(from)) moveSlide(from, index);
                    }}
                  >
                    <button type="button" className="meta-composer-slide-thumb" onClick={() => setPreviewSlide(index)}>
                      {slide.kind === 'video' ? (
                        <video src={src} muted playsInline />
                      ) : (
                        <img src={src} alt="" />
                      )}
                      <em>{index + 1}</em>
                    </button>
                    <div className="meta-composer-slide-move">
                      <button
                        type="button"
                        aria-label="Mover para antes"
                        disabled={busy || index === 0}
                        onClick={() => moveSlide(index, index - 1)}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        aria-label="Mover para depois"
                        disabled={busy || index === slides.length - 1}
                        onClick={() => moveSlide(index, index + 1)}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="meta-composer-slide-remove"
                      onClick={() => void removeSlide(index)}
                      disabled={busy}
                      aria-label="Remover slide"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
          {isCarousel && slides.length > 1 ? (
            <p className="meta-composer-hint">Arraste a miniatura ou use as setas. O número é a ordem no Instagram.</p>
          ) : null}

          {showMediaPicker ? (
            <div
              className={`meta-composer-media-grid ${staging ? 'is-busy' : ''}`}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                void handleLocalFiles(e.dataTransfer.files, 'media');
              }}
            >
              {staging ? (
                <div className="meta-composer-media-busy">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Preparando…
                </div>
              ) : (
                <>
                  <button type="button" className="meta-composer-media-card" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-5 w-5" />
                    <strong>{isCarousel ? (slides.length ? 'Mais arquivos' : 'Enviar arquivos') : 'Enviar arquivo'}</strong>
                    <span>
                      {isCarousel
                        ? '2 a 10 imagens ou vídeos'
                        : 'JPG/PNG até 8 MB · MP4 até 1 GB para a Meta'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="meta-composer-media-card"
                    disabled={!clientId}
                    onClick={() => { setDriveTarget('media'); setDriveOpen(true); }}
                  >
                    <HardDrive className="h-5 w-5" />
                    <strong>Google Drive</strong>
                    <span>{clientId ? (isCarousel ? 'Um slide por vez · vídeo até 40 MB' : 'Original fica no Drive · até 1 GB') : 'Ligue o cliente'}</span>
                  </button>
                </>
              )}
              <button type="button" className="meta-composer-url-link" onClick={() => setShowAdvancedUrl((v) => !v)}>
                <Link2 className="h-3.5 w-3.5" />
                colar URL
              </button>
              {showAdvancedUrl ? (
                <div className="meta-composer-url-row">
                  <Input type="url" placeholder="https://..." value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} />
                  <Button type="button" size="sm" onClick={applyManualUrl}>Usar</Button>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                multiple={isCarousel}
                accept={isReels ? 'video/mp4,video/quicktime,video/*' : 'image/jpeg,image/png,image/webp,image/*,video/*'}
                className="hidden"
                onChange={(e) => {
                  const list = snapshotSelectedFiles(e.target.files);
                  e.target.value = '';
                  if (list.length) void handleLocalFiles(list, 'media');
                }}
              />
            </div>
          ) : !isCarousel && media ? (
            <div className="meta-composer-media-ready">
              <div className="meta-composer-thumb">
                {media.kind === 'video' || isReels ? (
                  <>
                    <video src={previewUrl} muted playsInline preload="metadata" poster={poster} />
                    <button
                      type="button"
                      className="meta-composer-thumb-play"
                      onClick={togglePlay}
                      aria-label={playing ? 'Pausar vídeo' : 'Reproduzir vídeo'}
                    >
                      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                  </>
                ) : (
                  <img src={previewUrl} alt="" />
                )}
              </div>
              <div className="meta-composer-media-meta">
                <strong>{media.name || 'Mídia'}</strong>
                <span>
                  {media.source === 'drive' ? 'Drive' : media.source === 'upload' ? 'Upload' : 'URL'}
                  {media.size ? ` · ${formatDriveBytes(media.size)}` : ''}
                  {media.large ? ' · envio direto à Meta' : media.temporary ? ' · temporário' : ''}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => void clearMedia()} disabled={busy}>
                  <X className="mr-1 h-3.5 w-3.5" />Trocar
                </Button>
              </div>
            </div>
          ) : null}

          {isCarousel && slides.length > 0 && slides.length < 2 ? (
            <p className="meta-composer-hint">Falta pelo menos mais 1 slide para publicar.</p>
          ) : null}
          {isCarousel && slides.length >= MAX_CAROUSEL ? (
            <p className="meta-composer-hint">Limite de 10 slides atingido.</p>
          ) : null}
        </div>

        {isReels ? (
          <div className="meta-composer-field">
            <span className="meta-composer-label">Capa do Reels</span>
            <div className="meta-composer-seg">
              <button type="button" className={coverMode === 'auto' ? 'is-on' : ''} onClick={() => { setCoverMode('auto'); setPlaying(false); void clearCover(); }}>Auto</button>
              <button type="button" className={coverMode === 'image' ? 'is-on' : ''} onClick={() => { setCoverMode('image'); setPlaying(false); }}>Imagem</button>
              <button type="button" className={coverMode === 'frame' ? 'is-on' : ''} onClick={() => { setCoverMode('frame'); setPlaying(false); void clearCover(); }}>Frame</button>
            </div>
            {coverMode === 'auto' && previewUrl ? (
              <div className="meta-composer-cover-preview">
                <div className="meta-composer-frame-still" aria-hidden="true">
                  <video
                    src={previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    poster={poster}
                    onLoadedMetadata={(event) => rememberDuration(event.currentTarget)}
                  />
                </div>
                <p className="meta-composer-hint">A Meta escolhe a capa. Aqui é o primeiro frame, como no celular.</p>
              </div>
            ) : null}
            {coverMode === 'image' ? (
              cover ? (
                <div className="meta-composer-cover-preview">
                  <div className="meta-composer-frame-still"><img src={coverPreview} alt="" /></div>
                  <div className="meta-composer-media-meta">
                    <strong>{cover.name || 'Capa'}</strong>
                    <span>Assim fica no celular, no recorte 9:16.</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void clearCover()} disabled={busy}>Trocar</Button>
                  </div>
                </div>
              ) : (
                <div className="meta-composer-cover-actions">
                  <Button type="button" size="sm" variant="outline" onClick={() => coverInputRef.current?.click()}>
                    <Upload className="mr-1 h-3.5 w-3.5" /> Enviar capa
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={!clientId} onClick={() => { setDriveTarget('cover'); setDriveOpen(true); }}>
                    <HardDrive className="mr-1 h-3.5 w-3.5" /> Drive
                  </Button>
                  <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const list = snapshotSelectedFiles(e.target.files);
                    e.target.value = '';
                    if (list.length) void handleLocalFiles(list, 'cover');
                  }} />
                </div>
              )
            ) : null}
            {coverMode === 'image' ? (
              <p className="meta-composer-hint">Esta foto é a capa no celular. O play reproduz o vídeo.</p>
            ) : null}
            {coverMode === 'frame' ? (
              <div className="meta-composer-frame-pick">
                <div className="meta-composer-frame-still">
                  {previewUrl ? (
                    <video
                      ref={coverFrameRef}
                      src={previewUrl}
                      muted
                      playsInline
                      preload="metadata"
                      poster={poster}
                      onLoadedMetadata={(event) => rememberDuration(event.currentTarget)}
                    />
                  ) : (
                    <span>sem vídeo</span>
                  )}
                </div>
                <div className="meta-composer-frame-controls">
                  <Label htmlFor="thumb-offset">Frame da capa · {formatVideoClock(coverOffset)}{duration ? ` / ${formatVideoClock(duration)}` : ''}</Label>
                  {duration > 0 ? (
                    <input
                      id="thumb-offset"
                      className="meta-composer-frame-slider"
                      type="range"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={clampVideoOffset(thumbOffsetSec, duration)}
                      onChange={(e) => setThumbOffsetSec(Number(e.target.value) || 0)}
                      onPointerUp={(e) => {
                        paintPausedFrame(phoneVideoRef.current, Number(e.currentTarget.value) || 0, playingRef);
                      }}
                    />
                  ) : (
                    <Input
                      id="thumb-offset"
                      type="number"
                      min={0}
                      step={0.1}
                      value={thumbOffsetSec}
                      onChange={(e) => setThumbOffsetSec(Number(e.target.value) || 0)}
                    />
                  )}
                  <p className="meta-composer-hint">Arraste até o momento. A pré-visualização mostra essa capa no celular.</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="meta-composer-field is-caption">
          <div className="meta-composer-caption-head">
            <span className="meta-composer-label">Texto</span>
            <span>{captionCount}/{captionLimit}</span>
          </div>
          <Textarea
            className="meta-composer-caption"
            placeholder="Opcional — o que aparece no post"
            rows={8}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, captionLimit))}
          />
        </div>

        {!isIg ? (
          <div className="meta-composer-field">
            <span className="meta-composer-label">Link (opcional)</span>
            <Input type="url" placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
        ) : null}
          </>
        )}
      </div>

      <aside className={`meta-composer-side ${isReels ? 'is-reel' : ''}`}>
        <div className="meta-composer-side-block is-preview">
          <span className="meta-composer-side-kicker">Pré-visualização</span>
          {isReels ? (
            <p className="meta-composer-hint">Como o Reels aparece no celular, com a capa parada.</p>
          ) : null}
          {isReels ? (
            <div className={`meta-reel ${playing ? 'is-playing' : ''}`}>
              <div className="meta-reel-screen">
                {phoneMediaNode}
                <div className="meta-reel-shade" aria-hidden="true" />
                <div className="meta-reel-top">
                  <strong>Reels</strong>
                  {!playing && phonePreviewSrc ? <em>{coverChip}</em> : null}
                </div>
                <ul className="meta-reel-rail" aria-hidden="true">
                  <li><Heart className="h-5 w-5" /></li>
                  <li><MessageCircle className="h-5 w-5" /></li>
                  <li><Send className="h-5 w-5" /></li>
                  <li><Bookmark className="h-5 w-5" /></li>
                </ul>
                <div className="meta-reel-user">
                  <span className="meta-reel-avatar">
                    {accountAvatar ? <img src={accountAvatar} alt="" /> : null}
                  </span>
                  <div>
                    <strong>{accountLabel}</strong>
                    <p>{message.trim() ? message : 'Legenda…'}</p>
                  </div>
                </div>
                {(phoneIsVideo || phoneShowsCoverImage) ? (
                  <button
                    type="button"
                    className="meta-reel-play"
                    onClick={togglePlay}
                    aria-label={playing ? 'Pausar vídeo' : 'Reproduzir vídeo'}
                  >
                    <i>{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</i>
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={`meta-phone ${isIg ? 'is-ig' : 'is-fb'}`}>
              <div className="meta-phone-head">
                <span className="meta-phone-avatar">
                  {accountAvatar ? <img src={accountAvatar} alt="" /> : null}
                </span>
                <div>
                  <strong>{accountLabel}</strong>
                  <em>{isIg ? 'Instagram' : 'Facebook'}</em>
                </div>
              </div>
              <div className={`meta-phone-media ${playing ? 'is-playing' : ''}`}>
                {phoneMediaNode}
                {(phoneIsVideo || phoneShowsCoverImage) && !isCarousel ? (
                  <button
                    type="button"
                    className="meta-phone-play"
                    onClick={togglePlay}
                    aria-label={playing ? 'Pausar vídeo' : 'Reproduzir vídeo'}
                  >
                    <i>{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</i>
                  </button>
                ) : null}
                {isCarousel && slides.length > 1 ? (
                  <div className="meta-phone-dots">
                    {slides.map((_, i) => (
                      <button
                        key={`dot-${i}`}
                        type="button"
                        className={previewSlide === i ? 'is-on' : ''}
                        onClick={() => setPreviewSlide(i)}
                        aria-label={`Slide ${i + 1}`}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="meta-phone-caption">
                {message.trim() ? message : 'Legenda…'}
              </div>
            </div>
          )}
        </div>

        <div className="meta-composer-side-block">
          <span className="meta-composer-side-kicker">Quando publicar</span>
          <div className="meta-composer-when">
            <button type="button" className={whenMode === 'now' ? 'is-on' : ''} onClick={() => setWhenMode('now')}>
              <Send className="h-3.5 w-3.5" />
              Agora
            </button>
            <button type="button" className={whenMode === 'schedule' ? 'is-on' : ''} onClick={() => {
              setWhenMode('schedule');
              setScheduledTime((current) => futureScheduleAt(current || new Date()));
            }}>
              <Clock className="h-3.5 w-3.5" />
              Agendar
            </button>
          </div>
          {whenMode === 'schedule' ? (
            <div className="meta-composer-schedule">
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="meta-composer-date-btn">
                    <CalendarIcon className="h-4 w-4" />
                    {scheduledTime
                      ? format(scheduledTime, 'dd/MM/yyyy HH:mm', { locale: ptBR })
                      : 'Escolher data e hora'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={scheduledTime}
                    onSelect={(day) => {
                      if (!day) return;
                      const next = new Date(day);
                      next.setHours(scheduledTime?.getHours?.() ?? 10, scheduledTime?.getMinutes?.() ?? 0, 0, 0);
                      setScheduledTime(next);
                    }}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    locale={ptBR}
                  />
                  <div className="border-t p-3">
                    <Label className="text-xs">Hora</Label>
                    <Input
                      type="time"
                      className="mt-1"
                      value={
                        scheduledTime
                          ? `${String(scheduledTime.getHours()).padStart(2, '0')}:${String(scheduledTime.getMinutes()).padStart(2, '0')}`
                          : '10:00'
                      }
                      onChange={(e) => {
                        const [hh, mm] = String(e.target.value || '10:00').split(':').map(Number);
                        const base = scheduledTime || new Date();
                        const next = new Date(base);
                        next.setHours(hh || 0, mm || 0, 0, 0);
                        setScheduledTime(next);
                      }}
                    />
                  </div>
                </PopoverContent>
              </Popover>
              {isIg ? (
                <p className="meta-composer-schedule-hint">
                  {isCarousel
                    ? 'O carrossel fica guardado e entra no Instagram na hora marcada.'
                    : (igFormat === 'REELS' || media?.kind === 'video')
                    ? 'Pode fechar depois de agendar. O vídeo segue para a Meta e só entra no ar na hora.'
                    : 'No Instagram o Planeje guarda e envia no horário. Não vai ao ar agora. No Facebook a Meta agenda.'}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {uploadProgress ? (
          <div className="meta-composer-progress">
            <span>
              {uploadProgress.phase === 'process'
                ? 'A Meta está processando o vídeo…'
                : `Enviando o vídeo ${uploadProgress.percent || 0}%`}
            </span>
            <div className="meta-composer-progress-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(4, Number(uploadProgress.percent) || 0)}%` }} />
            </div>
          </div>
        ) : null}

        <div className="meta-composer-actions">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={() => void handlePublish()} disabled={busy || !hasDestination}>
            {busy ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{
                staging
                  ? 'Preparando…'
                  : uploadProgress?.phase === 'process'
                    ? 'Processando na Meta…'
                    : uploadProgress?.percent
                      ? `Enviando ${uploadProgress.percent}%`
                      : 'Enviando…'
              }</>
            ) : (
              <><Send className="mr-2 h-4 w-4" />{publishNow ? 'Publicar' : 'Agendar'}</>
            )}
          </Button>
        </div>
      </aside>

      <GoogleDrivePickerDialog
        open={driveOpen}
        onOpenChange={setDriveOpen}
        clienteId={clientId}
        acceptKinds={driveTarget === 'cover' ? 'image' : (isReels ? 'video' : 'media')}
        title={driveTarget === 'cover' ? 'Capa no Drive' : (isCarousel ? 'Slide no Drive' : 'Mídia no Drive')}
        description={
          driveTarget === 'cover'
            ? 'Capa: JPG/PNG até 8 MB. O original fica no Drive.'
            : isCarousel
              ? 'No carrossel, vídeo até 40 MB. O original fica no Drive.'
              : metaResumableHint()
        }
        maxAttachBytes={driveTarget === 'cover' ? META_IMAGE_MAX_BYTES : (isCarousel ? META_VIDEO_MAX_BYTES : META_REELS_MAX_BYTES)}
        oversizeHint={
          driveTarget === 'cover'
            ? 'Capa até 8 MB (JPG ou PNG).'
            : isCarousel
              ? 'No carrossel o vídeo pode ter até 40 MB. Use Reels para arquivo grande.'
              : 'Reels na Meta aceita até 1 GB e 15 min (MP4 H.264).'
        }
        onSelectFile={handleDriveSelect}
      />
    </div>
  );
};

export default ContentPublisher;
