import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { triggerMediaFileDownload } from '@/lib/atendimentoMediaDownload';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.35;

function imageDownloadName(fileName, alt) {
  const base = String(fileName || alt || 'imagem').trim() || 'imagem';
  if (/\.(jpe?g|png|gif|webp)$/i.test(base)) return base;
  return `${base.replace(/\.[^.]+$/, '')}.jpg`;
}

export function WaImageLightbox({ open, onOpenChange, src, alt, fileName, mimetype }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const viewportRef = useRef(null);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) {
      resetView();
      return undefined;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange, resetView]);

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const zoomOut = () => {
    setScale((s) => {
      const next = Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2));
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const onWheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  };

  const onPointerDown = (e) => {
    if (scale <= 1) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  const handleDownload = () => {
    triggerMediaFileDownload({
      url: src,
      fileName: imageDownloadName(fileName, alt),
      mimetype: mimetype || 'image/jpeg',
    });
  };

  if (!open || !src) return null;

  return (
    <div
      className="wa-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar imagem"
      onClick={() => onOpenChange?.(false)}
    >
      <div className="wa-image-lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="wa-image-lightbox-btn" onClick={zoomOut} title="Diminuir zoom" aria-label="Diminuir zoom">
          <ZoomOut className="h-5 w-5" />
        </button>
        <button type="button" className="wa-image-lightbox-btn" onClick={zoomIn} title="Aumentar zoom" aria-label="Aumentar zoom">
          <ZoomIn className="h-5 w-5" />
        </button>
        <button type="button" className="wa-image-lightbox-btn" onClick={resetView} title="Resetar zoom" aria-label="Resetar zoom">
          <RotateCcw className="h-5 w-5" />
        </button>
        <button type="button" className="wa-image-lightbox-btn" onClick={handleDownload} title="Baixar imagem" aria-label="Baixar imagem">
          <Download className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="wa-image-lightbox-btn wa-image-lightbox-btn--close"
          onClick={() => onOpenChange?.(false)}
          title="Fechar"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={viewportRef}
        className="wa-image-lightbox-viewport"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: scale > 1 ? (dragging.current ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        <img
          src={src}
          alt={alt || 'Imagem'}
          className="wa-image-lightbox-img"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
          draggable={false}
          onClick={(e) => {
            e.stopPropagation();
            if (scale === 1) zoomIn();
          }}
        />
      </div>
    </div>
  );
}

/** Miniatura clicável que abre o lightbox. */
export default function WaMediaImage({ src, alt, fileName, mimetype, onError }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="wa-media-img-btn"
        onClick={() => setOpen(true)}
        aria-label="Abrir imagem"
      >
        <img
          src={src}
          alt={alt || 'Imagem'}
          className="wa-media-img"
          loading="lazy"
          onError={onError}
        />
      </button>
      <WaImageLightbox
        open={open}
        onOpenChange={setOpen}
        src={src}
        alt={alt}
        fileName={fileName}
        mimetype={mimetype}
      />
    </>
  );
}
