import React, { useEffect, useRef, useState } from 'react';
import { File, Film, Folder, Image as ImageIcon, Play } from 'lucide-react';
import { getGoogleDriveStreamUrl } from '@/lib/googleDriveClient';
import {
  driveListThumbSrc,
  driveStreamThumbUrl,
  isDriveFolder,
  isDriveImage,
  isDriveVideo,
} from '@/lib/googleDriveMedia';

export function FileKindIcon({ file }) {
  if (isDriveFolder(file)) return <Folder className="h-4 w-4 shrink-0 text-amber-500" />;
  if (isDriveVideo(file)) return <Film className="h-4 w-4 shrink-0 text-violet-600" />;
  if (isDriveImage(file)) return <ImageIcon className="h-4 w-4 shrink-0 text-sky-600" />;
  return <File className="h-4 w-4 shrink-0 text-sky-600" />;
}

const driveStreamThumbCache = new Map();

function cachedDriveStreamThumb(clienteId, fileId) {
  const key = `${clienteId}:${fileId}`;
  if (driveStreamThumbCache.has(key)) return driveStreamThumbCache.get(key);
  const pending = getGoogleDriveStreamUrl(clienteId, fileId)
    .then((data) => {
      const url = data?.path || data?.url;
      return url ? driveStreamThumbUrl(url) : '';
    })
    .catch(() => '');
  driveStreamThumbCache.set(key, pending);
  return pending;
}

export default function DriveFileThumb({ clienteId, file, className = 'h-14 w-[4.5rem]' }) {
  const hint = driveListThumbSrc(file);
  const [src, setSrc] = useState(hint);
  const [needStream, setNeedStream] = useState(!hint);
  const hostRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin: '160px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    setSrc(hint);
    setNeedStream(!hint);
  }, [hint, file?.id]);

  useEffect(() => {
    if (!visible || !needStream || !clienteId || !file?.id) return undefined;
    let cancelled = false;
    cachedDriveStreamThumb(clienteId, file.id).then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, needStream, clienteId, file?.id]);

  const video = isDriveVideo(file);

  return (
    <span
      ref={hostRef}
      className={`relative shrink-0 overflow-hidden rounded-md bg-muted ${className}`}
    >
      <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
        <FileKindIcon file={file} />
      </span>
      {src ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => {
            if (hint && src === hint) {
              setSrc('');
              setNeedStream(true);
            }
          }}
        />
      ) : null}
      {video ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <Play className="h-4 w-4 fill-white text-white drop-shadow" />
        </span>
      ) : null}
    </span>
  );
}
