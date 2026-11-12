import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  HardDrive,
  Loader2,
  Search,
  Upload,
  Home,
  Users,
  Clock,
  Star,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  GOOGLE_DRIVE_SETTINGS_PATH,
  OAUTH_NOT_CONFIGURED_MESSAGE,
  googleDriveOAuthErrorMessage,
} from '@/lib/googleDriveAgency';
import {
  listGoogleDriveFiles,
  uploadGoogleDriveResumable,
  fetchGoogleDriveStatus,
  fetchGoogleDriveFavorite,
  setGoogleDriveFavorite,
  getGoogleDriveAuthUrl,
} from '@/lib/googleDriveClient';
import {
  DRIVE_FOLDER_MY,
  DRIVE_FOLDER_RECENT_VIDEOS,
  DRIVE_FOLDER_SHARED,
  formatDriveBytes,
  isDriveFolder,
  isDriveImage,
  isDriveVideo,
  isPinnableDriveFolderId,
  describeDriveUploadFailure,
} from '@/lib/googleDriveMedia';
import DriveFileThumb, { FileKindIcon } from '@/components/tasks/details/DriveFileThumb';

/**
 * Navega pastas do Google Drive e devolve o arquivo escolhido.
 * @param {'media'|'image'|'video'} [acceptKinds='media']
 */
export default function GoogleDrivePickerDialog({
  open,
  onOpenChange,
  clienteId,
  onSelectFile,
  acceptKinds = 'media',
  title = 'Google Drive',
  description = 'Abra a pasta e escolha o arquivo, ou envie um novo — ele fica no Drive.',
  maxAttachBytes = null,
  oversizeHint = '',
}) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'superadmin';
  const [connected, setConnected] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(true);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attaching, setAttaching] = useState(false);
  const [files, setFiles] = useState([]);
  const [folderStack, setFolderStack] = useState([{ id: DRIVE_FOLDER_MY, name: 'Meu Drive' }]);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [mediaOnly, setMediaOnly] = useState(true);
  const [selected, setSelected] = useState(null);
  const [favorite, setFavorite] = useState(null);
  const [placeReady, setPlaceReady] = useState(false);
  const [pinning, setPinning] = useState(false);

  const currentFolder = folderStack[folderStack.length - 1];
  const selectedTooBig = Boolean(
    selected
    && maxAttachBytes
    && Number(selected.size) > maxAttachBytes
  );

  const checkStatus = useCallback(async () => {
    if (!clienteId) {
      setChecking(false);
      setConnected(false);
      return;
    }
    setChecking(true);
    try {
      const s = await fetchGoogleDriveStatus(clienteId);
      setConnected(!!s.connected);
      setOauthConfigured(s.oauthConfigured !== false);
    } catch (e) {
      setConnected(false);
      const message = googleDriveOAuthErrorMessage(e);
      setOauthConfigured(!/Google Drive da agência/.test(message));
    } finally {
      setChecking(false);
    }
  }, [clienteId]);

  const loadFiles = useCallback(async () => {
    if (!clienteId || !connected) return;
    setLoading(true);
    try {
      const data = await listGoogleDriveFiles(clienteId, {
        folderId: currentFolder.id,
        q: query || undefined,
        mediaOnly,
      });
      setFiles(data.files || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao listar Drive', description: e?.message });
      setFiles([]);
      if (favorite?.id && currentFolder.id === favorite.id) {
        setFolderStack([{ id: DRIVE_FOLDER_MY, name: 'Meu Drive' }]);
      }
    } finally {
      setLoading(false);
    }
  }, [clienteId, connected, currentFolder.id, query, mediaOnly, toast, favorite?.id]);

  useEffect(() => {
    if (!open) {
      setPlaceReady(false);
      return undefined;
    }
    let cancelled = false;
    setPlaceReady(false);
    setQuery('');
    setSearchInput('');
    setSelected(null);
    setAttaching(false);
    (async () => {
      await checkStatus();
      let pinned = null;
      if (clienteId) {
        try {
          pinned = await fetchGoogleDriveFavorite(clienteId);
        } catch {
          pinned = null;
        }
      }
      if (cancelled) return;
      setFavorite(pinned);
      setFolderStack(
        pinned
          ? [{ id: pinned.id, name: pinned.name }]
          : [{ id: DRIVE_FOLDER_MY, name: 'Meu Drive' }],
      );
      setPlaceReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, checkStatus, clienteId]);

  useEffect(() => {
    if (open && connected && placeReady) void loadFiles();
  }, [open, connected, placeReady, loadFiles]);

  const handleConnect = async () => {
    try {
      const { url } = await getGoogleDriveAuthUrl(clienteId);
      window.open(url, '_blank', 'noopener,noreferrer');
      toast({
        title: 'Autorize no Google',
        description: 'Depois clique em Atualizar.',
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'OAuth',
        description: googleDriveOAuthErrorMessage(e),
      });
    }
  };

  const openFolder = (folder) => {
    setFolderStack((s) => [...s, { id: folder.id, name: folder.name }]);
    setQuery('');
    setSearchInput('');
    setSelected(null);
  };

  const goToPlace = (place) => {
    setFolderStack([place]);
    setQuery('');
    setSearchInput('');
    setSelected(null);
  };

  const goToBreadcrumb = (index) => {
    setFolderStack((s) => s.slice(0, index + 1));
    setQuery('');
    setSearchInput('');
    setSelected(null);
  };

  const goBack = () => {
    if (folderStack.length < 2) return;
    goToBreadcrumb(folderStack.length - 2);
  };

  const pinFolder = async (folder) => {
    if (!clienteId || !folder?.id || pinning) return;
    if (!isPinnableDriveFolderId(folder.id)) return;
    setPinning(true);
    try {
      await setGoogleDriveFavorite(clienteId, folder.id, folder.name);
      setFavorite({ id: folder.id, name: folder.name || 'Pasta favorita' });
      toast({ title: 'Pasta fixada', description: 'O Drive desta empresa abre aqui.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não deu para fixar', description: e?.message });
    } finally {
      setPinning(false);
    }
  };

  const unpinFolder = async () => {
    if (!clienteId || pinning) return;
    setPinning(true);
    try {
      await setGoogleDriveFavorite(clienteId, null, null);
      setFavorite(null);
      toast({ title: 'Pasta desafixada' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não deu para desafixar', description: e?.message });
    } finally {
      setPinning(false);
    }
  };

  const handleSelect = (file) => {
    if (isDriveFolder(file)) {
      openFolder(file);
      return;
    }
    const okImage = isDriveImage(file);
    const okVideo = isDriveVideo(file);
    if (acceptKinds === 'image' && !okImage) {
      toast({ variant: 'destructive', title: 'Escolha uma imagem' });
      return;
    }
    if (acceptKinds === 'video' && !okVideo) {
      toast({ variant: 'destructive', title: 'Escolha um vídeo' });
      return;
    }
    if (acceptKinds === 'media' && !okImage && !okVideo) {
      toast({ variant: 'destructive', title: 'Escolha uma imagem ou vídeo' });
      return;
    }
    setSelected(file);
  };

  const attachFile = async (file) => {
    if (!file || attaching) return;
    if (maxAttachBytes && Number(file.size) > maxAttachBytes) {
      toast({
        variant: 'destructive',
        title: 'Arquivo grande demais para a Meta',
        description: oversizeHint || `Use um corte de até ${formatDriveBytes(maxAttachBytes)}. O original fica no Drive.`,
      });
      setSelected(file);
      return;
    }
    setSelected(file);
    setAttaching(true);
    try {
      await onSelectFile?.(file);
      onOpenChange?.(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Não deu para anexar',
        description: err?.message || 'Tente de novo.',
      });
    } finally {
      setAttaching(false);
    }
  };

  const handleAttach = async () => {
    await attachFile(selected);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !clienteId) return;
    const folderId =
      currentFolder.id === DRIVE_FOLDER_SHARED || currentFolder.id === DRIVE_FOLDER_RECENT_VIDEOS
        ? DRIVE_FOLDER_MY
        : currentFolder.id;
    setUploading(true);
    setUploadProgress(0);
    try {
      const { file: uploaded, storedInRoot } = await uploadGoogleDriveResumable(clienteId, file, {
        folderId,
        onProgress: setUploadProgress,
      });
      toast({
        title: storedInRoot ? 'Enviado para Meu Drive' : 'Arquivo enviado ao Drive',
        description: storedInRoot
          ? 'Esta pasta não aceitou o envio direto. O arquivo ficou em Meu Drive.'
          : undefined,
      });
      if (uploaded) {
        setSelected(uploaded);
        await loadFiles();
      } else {
        await loadFiles();
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Falha no upload',
        description: describeDriveUploadFailure(err?.message, { inFolder: folderId !== DRIVE_FOLDER_MY }),
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const place = currentFolder.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(44rem,92vh)] max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-3 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-4 w-4" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>

        {!clienteId ? (
          <p className="text-sm text-muted-foreground">
            Selecione um cliente na tarefa para usar o Drive da empresa.
          </p>
        ) : checking ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !connected ? (
          <div className="space-y-3 py-2">
            {!oauthConfigured ? (
              <p className="text-sm text-muted-foreground">{OAUTH_NOT_CONFIGURED_MESSAGE}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                O Google Drive desta empresa ainda não está conectado.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {oauthConfigured ? (
                <Button size="sm" onClick={handleConnect}>
                  Conectar Drive
                </Button>
              ) : isSuperAdmin ? (
                <Button size="sm" asChild>
                  <Link to={GOOGLE_DRIVE_SETTINGS_PATH}>Abrir configuração</Link>
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => void checkStatus()}>
                Atualizar
              </Button>
            </div>
          </div>
        ) : !placeReady ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap gap-1">
              {favorite ? (
                <Button
                  type="button"
                  size="sm"
                  variant={place === favorite.id ? 'secondary' : 'outline'}
                  className="h-7 max-w-[160px] text-xs"
                  onClick={() => goToPlace({ id: favorite.id, name: favorite.name })}
                >
                  <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-500" />
                  <span className="truncate">{favorite.name}</span>
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={place === DRIVE_FOLDER_MY && folderStack.length === 1 ? 'secondary' : 'outline'}
                className="h-7 text-xs"
                onClick={() => goToPlace({ id: DRIVE_FOLDER_MY, name: 'Meu Drive' })}
              >
                <Home className="h-3 w-3 mr-1" />
                Meu Drive
              </Button>
              <Button
                type="button"
                size="sm"
                variant={place === DRIVE_FOLDER_SHARED && folderStack.length === 1 ? 'secondary' : 'outline'}
                className="h-7 text-xs"
                onClick={() => goToPlace({ id: DRIVE_FOLDER_SHARED, name: 'Compartilhados' })}
              >
                <Users className="h-3 w-3 mr-1" />
                Compartilhados
              </Button>
              <Button
                type="button"
                size="sm"
                variant={place === DRIVE_FOLDER_RECENT_VIDEOS ? 'secondary' : 'outline'}
                className="h-7 text-xs"
                onClick={() => goToPlace({ id: DRIVE_FOLDER_RECENT_VIDEOS, name: 'Vídeos recentes' })}
              >
                <Clock className="h-3 w-3 mr-1" />
                Vídeos recentes
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs ml-auto"
                onClick={() => setMediaOnly((v) => !v)}
              >
                {mediaOnly ? 'Só pastas e mídia' : 'Mostrar tudo'}
              </Button>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {folderStack.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 px-3 text-sm font-medium"
                  onClick={goBack}
                  aria-label="Voltar para a pasta anterior"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Voltar
                </Button>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm text-muted-foreground">
                {folderStack.map((f, i) => (
                  <React.Fragment key={`${f.id}-${i}`}>
                    {i > 0 && <ChevronRight className="h-4 w-4 shrink-0" />}
                    <button
                      type="button"
                      className="max-w-[10rem] truncate rounded-md px-1 py-0.5 hover:bg-muted hover:text-foreground"
                      onClick={() => goToBreadcrumb(i)}
                    >
                      {i === 0 && !isPinnableDriveFolderId(f.id) ? <Home className="mr-0.5 inline h-3.5 w-3.5" /> : null}
                      {f.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              {isPinnableDriveFolderId(currentFolder.id) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-8 shrink-0 text-xs"
                  disabled={pinning}
                  onClick={() => (favorite?.id === currentFolder.id ? void unpinFolder() : void pinFolder(currentFolder))}
                >
                  <Star className={`mr-1 h-3.5 w-3.5 ${favorite?.id === currentFolder.id ? 'fill-amber-400 text-amber-500' : ''}`} />
                  {favorite?.id === currentFolder.id ? 'Fixa' : 'Fixar pasta'}
                </Button>
              ) : null}
            </div>

            <div className="flex shrink-0 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 pl-7 text-sm"
                  placeholder="Buscar nesta pasta…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setQuery(searchInput.trim());
                  }}
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => setQuery(searchInput.trim())}>
                Buscar
              </Button>
              <label className="inline-flex">
                <span
                  className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer ${
                    uploading ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 mr-1" />
                  )}
                  {uploading ? `${uploadProgress || 0}%` : 'Enviar'}
                </span>
                <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>

            <div className="relative min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : files.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">Pasta vazia</p>
              ) : (
                files.map((file) => (
                  <div
                    key={file.id}
                    className={`flex items-center gap-1 px-1 ${
                      selected?.id === file.id ? 'bg-violet-50 dark:bg-violet-950/40' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 flex items-center gap-3 px-2 py-1.5 text-left text-sm hover:bg-muted/60 rounded-md"
                      onClick={() => handleSelect(file)}
                      onDoubleClick={() => {
                        if (!isDriveFolder(file)) void attachFile(file);
                      }}
                    >
                      {isDriveFolder(file) ? (
                        <FileKindIcon file={file} />
                      ) : (
                        <DriveFileThumb clienteId={clienteId} file={file} />
                      )}
                      <span className="truncate flex-1">{file.name}</span>
                      {!isDriveFolder(file) && file.size != null && (
                        <span className={`text-[10px] shrink-0 ${
                          maxAttachBytes && Number(file.size) > maxAttachBytes
                            ? 'font-semibold text-amber-700 dark:text-amber-400'
                            : 'text-muted-foreground'
                        }`}>
                          {formatDriveBytes(file.size)}
                          {maxAttachBytes && Number(file.size) > maxAttachBytes ? ' · grande' : ''}
                        </span>
                      )}
                    </button>
                    {isDriveFolder(file) && isPinnableDriveFolderId(file.id) ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        disabled={pinning}
                        aria-label={favorite?.id === file.id ? `Desafixar ${file.name}` : `Fixar ${file.name}`}
                        onClick={() => (favorite?.id === file.id ? void unpinFolder() : void pinFolder(file))}
                      >
                        <Star className={`h-4 w-4 ${favorite?.id === file.id ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
              {uploading ? (
                <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-2 text-sm">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p>Enviando para o Drive… {uploadProgress || 0}%</p>
                  <p className="text-xs text-muted-foreground">O arquivo não é copiado para o Planeje.</p>
                </div>
              ) : null}
              {attaching ? (
                <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-2 text-sm">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p>Ligando o arquivo do Drive…</p>
                </div>
              ) : null}
            </div>

            {selected && !isDriveFolder(selected) ? (
              <div className="flex shrink-0 items-center gap-3 rounded-md border p-2">
                <DriveFileThumb clienteId={clienteId} file={selected} className="h-14 w-20" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selected.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {isDriveVideo(selected) ? 'Vídeo' : isDriveImage(selected) ? 'Imagem' : 'Arquivo'}
                    {selected.size != null ? ` · ${formatDriveBytes(selected.size)}` : ''}
                  </p>
                  {selectedTooBig ? (
                    <p className="mt-1 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                      {oversizeHint || `Grande demais para a Meta (até ${formatDriveBytes(maxAttachBytes)}). Exporte um corte mais leve; o original fica no Drive.`}
                    </p>
                  ) : null}
                </div>
                <Button size="sm" onClick={() => void handleAttach()} disabled={attaching || selectedTooBig}>
                  {attaching ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                  {selectedTooBig ? 'Grande demais' : 'Anexar do Drive'}
                </Button>
              </div>
            ) : (
              <p className="shrink-0 text-[11px] text-muted-foreground">
                Clique na pasta para entrar. Voltar sobe um nível. A estrela deixa a pasta fixa nesta empresa.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
