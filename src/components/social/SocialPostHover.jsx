import React, { useMemo } from 'react';
import { Instagram, Facebook } from 'lucide-react';
import DriveFileThumb from '@/components/tasks/details/DriveFileThumb';
import { driveFileIdFromUrl } from '@/lib/googleDriveMedia';
import { plannerFormatLabel, plannerStatusMeta } from '@/lib/socialPlannerItems';

export default function SocialPostHover({ item, clientId, x = 0, y = 0 }) {
  const format = plannerFormatLabel(item);
  const status = plannerStatusMeta(item?.status);
  const fileId = driveFileIdFromUrl(item?.assetUrl);
  const remoteUrl = !fileId && /^https?:\/\//i.test(item?.assetUrl || '') ? item.assetUrl : '';
  const file = useMemo(() => (
    fileId
      ? { id: fileId, name: item?.title, mimeType: format === 'Reels' ? 'video/mp4' : 'image/jpeg' }
      : null
  ), [fileId, item?.title, format]);

  if (!item) return null;

  const left = Math.min(x + 16, typeof window === 'undefined' ? x : window.innerWidth - 280);
  const top = Math.min(y - 12, typeof window === 'undefined' ? y : window.innerHeight - 420);

  return (
    <div
      className="social-ed-hover"
      style={{ left: Math.max(12, left), top: Math.max(12, top) }}
      role="tooltip"
    >
      <div className="social-ed-phone">
        {file ? (
          <DriveFileThumb clienteId={clientId || item.clientId} file={file} className="h-full w-full rounded-none" />
        ) : remoteUrl ? (
          <img src={remoteUrl} alt="" className="social-ed-phone-img" />
        ) : (
          <div className="social-ed-phone-empty">
            <p>{item.caption || item.title}</p>
          </div>
        )}
        {format === 'Reels' ? (
          <span className="social-ed-phone-play" aria-hidden>▶</span>
        ) : null}
      </div>
      <div className="social-ed-hover-meta">
        <p>
          {item.instagram ? <Instagram className="h-3 w-3" /> : null}
          {item.facebook ? <Facebook className="h-3 w-3" /> : null}
          <strong>{format}</strong>
          <span className={`is-${status.tone}`}>{status.label}</span>
        </p>
        <p>{item.title}</p>
      </div>
    </div>
  );
}
