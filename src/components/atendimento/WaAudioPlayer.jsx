import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play } from 'lucide-react';

function normalizeAudioMime(mimetype, url) {
  const m = String(mimetype || '').toLowerCase();
  const u = String(url || '').toLowerCase();
  if (m.includes('mpeg') || m.includes('mp3') || u.includes('.mp3')) return 'audio/mpeg';
  if (m.includes('ogg') || m.includes('opus') || u.includes('.ogg')) return 'audio/ogg';
  if (m.includes('mp4') || m.includes('m4a') || u.includes('.m4a')) return 'audio/mp4';
  if (m.includes('webm')) return 'audio/webm';
  if (m.startsWith('audio/')) return m;
  return 'audio/mpeg';
}

function seedWaveBars(seed, count = 39) {
  let hash = 0;
  const s = String(seed || 'audio');
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  const bars = [];
  for (let i = 0; i < count; i += 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    bars.push(18 + (hash % 62));
  }
  return bars;
}

function formatAudioTime(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Player de voz estilo WhatsApp (PTT / áudio do cliente). */
export default function WaAudioPlayer({ src, mimetype, isOutgoing = false, onError }) {
  const [playUrl, setPlayUrl] = useState(null);
  const [preparing, setPreparing] = useState(Boolean(src));
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const audioRef = useRef(null);
  const revokeRef = useRef(null);

  const bars = useMemo(() => seedWaveBars(src), [src]);
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  useEffect(() => {
    if (revokeRef.current) {
      URL.revokeObjectURL(revokeRef.current);
      revokeRef.current = null;
    }
    setPlayUrl(null);
    setPlaying(false);
    setDuration(0);
    setCurrent(0);

    if (!src) {
      setPreparing(false);
      return undefined;
    }

    let cancelled = false;
    setPreparing(true);
    const mime = normalizeAudioMime(mimetype, src);

    const applyUrl = (url, shouldRevoke = false) => {
      if (cancelled) {
        if (shouldRevoke) URL.revokeObjectURL(url);
        return;
      }
      if (shouldRevoke) revokeRef.current = url;
      setPlayUrl(url);
      setPreparing(false);
    };

    if (src.startsWith('data:')) {
      fetch(src)
        .then((res) => res.blob())
        .then((blob) => {
          const typed =
            blob.type && blob.type.startsWith('audio/')
              ? blob
              : new Blob([blob], { type: mime });
          applyUrl(URL.createObjectURL(typed), true);
        })
        .catch(() => applyUrl(src));
      return () => {
        cancelled = true;
      };
    }

    applyUrl(src);
    return () => {
      cancelled = true;
    };
  }, [src, mimetype]);

  useEffect(
    () => () => {
      if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
    },
    []
  );

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      if (el.paused) {
        await el.play();
        setPlaying(true);
      } else {
        el.pause();
        setPlaying(false);
      }
    } catch {
      onError?.();
    }
  };

  if (preparing && !playUrl) {
    return (
      <div className="wa-voice-msg wa-voice-msg--loading" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!playUrl) return null;

  return (
    <div className={`wa-voice-msg ${isOutgoing ? 'wa-voice-msg--out' : 'wa-voice-msg--in'}`}>
      <button
        type="button"
        className="wa-voice-msg-play"
        onClick={togglePlay}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
      </button>

      <div className="wa-voice-msg-body">
        <div className="wa-voice-msg-wave" aria-hidden>
          {bars.map((height, index) => {
            const barProgress = (index + 1) / bars.length;
            const played = barProgress <= progress;
            return (
              <span
                key={index}
                className={`wa-voice-msg-bar${played ? ' wa-voice-msg-bar--played' : ''}`}
                style={{ height: `${height}%` }}
              />
            );
          })}
          <span className="wa-voice-msg-scrub" style={{ left: `${progress * 100}%` }} />
        </div>
        <span className="wa-voice-msg-duration">
          {playing || current > 0 ? formatAudioTime(current) : formatAudioTime(duration)}
        </span>
      </div>

      {!isOutgoing && (
        <span className="wa-voice-msg-mic" aria-hidden>
          <Mic className="h-3.5 w-3.5" />
        </span>
      )}

      <audio
        ref={audioRef}
        src={playUrl}
        preload="metadata"
        className="wa-voice-msg-audio-hidden"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onError={onError}
      />
    </div>
  );
}
