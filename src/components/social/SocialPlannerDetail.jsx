import React, { useState } from 'react';
import { FileImage, FileText, ImageOff } from 'lucide-react';
import DriveFileThumb from '@/components/tasks/details/DriveFileThumb';
import { driveFileIdFromUrl } from '@/lib/googleDriveMedia';
import { plannerFormatLabel, plannerPublicationState, publicationPlannerDate } from '@/lib/socialPlannerItems';
import { ChannelLogo } from '@/components/tasks/TaskChannelBadges';

export function PlannerPreview({ item, className = '', compact = false }) {
  const [failedUrl, setFailedUrl] = useState('');
  const url = item?.assetUrl || '';
  const fileId = driveFileIdFromUrl(url);
  const image = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) || item?.publications?.some((p) => p.mime_type?.startsWith('image/'));
  const hasImage = image && /^https?:\/\//i.test(url) && failedUrl !== url;
  if (compact && !fileId && !hasImage) return null;
  return (
    <span className={`social-visual-preview ${className}${!fileId && !hasImage ? ' is-empty' : ''}`}>
      {fileId ? (
        <DriveFileThumb clienteId={item.clientId} file={{ id: fileId, name: item.title }} className="h-full w-full" />
      ) : hasImage ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} />
      ) : (
        <span className="social-visual-preview-empty">
          {failedUrl === url && url ? <ImageOff aria-hidden="true" /> : <FileImage aria-hidden="true" />}
          <span>Miniatura indisponível</span>
        </span>
      )}
    </span>
  );
}

export default function SocialPlannerDetail({ item, publications = [], onOpenItem }) {
  if (!item) return null;
  const taskId = item.publications[0]?.task_id;
  const channels = taskId ? publications.filter((p) => p.task_id === taskId && p.status !== 'cancelled') : [];
  const rows = channels.length ? channels : item.publications;
  return (
    <section className="social-visual-detail" aria-label="Conteúdo selecionado">
      <PlannerPreview key={item.id} item={item} className="is-detail" />
      <p className="social-visual-detail-client">{item.clientName} · {plannerFormatLabel(item)}</p>
      <h3>{item.title}</h3>
      <div className="social-visual-caption"><h4>Legenda</h4><p>{item.caption || 'Legenda ainda não definida.'}</p></div>
      <h4>Publicar em</h4>
      <ul className="social-visual-channels">
        {rows.map((publication) => {
          const status = plannerPublicationState(publication);
          const date = publicationPlannerDate(publication);
          return (
            <li key={publication.id}>
              <div><strong><ChannelLogo channel={publication.channel} />{publication.channel}</strong><span className={`social-visual-state is-${status.tone}`}>{status.label}</span></div>
              <p>{publication.destination || 'Destino não definido'}</p>
              <p>{date ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date) : 'Data não definida'}</p>
              {publication.notes ? <p className="social-visual-channel-note">{publication.notes}</p> : null}
              {publication.channel === 'YouTube' || publication.channel === 'TikTok' ? <p>Envio automático ainda não integrado.</p> : null}
            </li>
          );
        })}
      </ul>
      <button type="button" className="social-visual-open" onClick={() => onOpenItem?.(item.publications[0], item)}><FileText className="h-4 w-4" />Abrir tarefa e publicações</button>
      <p className="social-visual-footnote">Data planejada e agendamento de envio são etapas distintas. Confira cada rede na tarefa.</p>
    </section>
  );
}
