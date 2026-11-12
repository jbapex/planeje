import React from 'react';
import {
  Building2,
  ExternalLink,
  Facebook,
  Instagram,
} from 'lucide-react';
import FailedPublicationActions from '@/components/social/FailedPublicationActions';
import DriveFileThumb from '@/components/tasks/details/DriveFileThumb';
import { instagramPrepareProgress } from '@/lib/igSchedulePrepare';
import { driveFileFromPublication, socialQueueFooterLabel } from '@/lib/socialQueueOpen';
import { rewritePublicStorageUrl } from '@/lib/publicStorageUrl';

function channelIcon(channel) {
  const value = String(channel || '').toLowerCase();
  if (value.includes('instagram') || value === 'ig') return Instagram;
  if (value.includes('facebook') || value === 'fb') return Facebook;
  return Building2;
}

function formatPubDate(value) {
  if (!value) return 'Sem data';
  const raw = String(value).slice(0, 10);
  try {
    return new Date(`${raw}T00:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return raw;
  }
}

export default function SocialPublicationCard({
  task,
  users = [],
  statusOptions = [],
  onOpen,
  onRetryDone,
}) {
  const status = statusOptions.find((option) => option.value === task.status);
  const statusColor = status?.color || '#6B7280';
  const pub = task.publication || null;
  const ChannelIcon = channelIcon(pub?.channel || task.title);
  const title = task.isChannelPublication
    ? (task.parentTask?.title || task.title)
    : task.title;
  const when = pub?.published_on || pub?.scheduled_for || task.due_date;
  const evidence = pub?.evidence_url || pub?.permalink || null;
  const progress = pub?.status === 'scheduled'
    ? instagramPrepareProgress(pub.meta_dispatch, {
      scheduledAt: pub.scheduled_at || pub.scheduled_for,
    })
    : { phase: '', percent: 0, label: '', showBar: false, determinate: false };
  const driveFile = pub ? driveFileFromPublication(pub) : null;
  const clienteId = task.client_id || task.parentTask?.client_id || null;

  return (
    <article className="social-pub-card">
      <button type="button" className="social-pub-card-main" onClick={() => onOpen?.(task)}>
        <div className="social-pub-card-body">
          <div className="social-pub-thumb" aria-hidden="true">
            {driveFile?.id ? (
              <DriveFileThumb
                clienteId={clienteId}
                file={driveFile}
                className="social-pub-thumb-media"
              />
            ) : (
              <span className="social-pub-thumb-fallback">
                <ChannelIcon className="h-5 w-5" />
              </span>
            )}
          </div>
          <div className="social-pub-card-content">
            <div className="social-pub-card-top">
              <span className="social-pub-channel">
                <ChannelIcon className="h-3.5 w-3.5" />
                {pub?.channel || (task.isChannelPublication ? 'Canal' : 'Tarefa')}
              </span>
              {status ? (
                <span
                  className="social-pub-status"
                  style={{
                    backgroundColor: statusColor.startsWith('#') ? statusColor : '#6B7280',
                  }}
                >
                  {status.label}
                </span>
              ) : null}
            </div>
            <p className="social-pub-title">{title}</p>
            {pub?.caption ? <p className="social-pub-caption">{pub.caption}</p> : null}
            {progress.showBar ? (
              <div className="social-pub-progress">
                <div
                  className={`social-pub-progress-track${progress.determinate ? '' : ' is-indeterminate'}`}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.determinate ? progress.percent : undefined}
                  aria-label={progress.label}
                >
                  <span
                    className="social-pub-progress-fill"
                    style={progress.determinate ? { width: `${Math.max(progress.percent, 4)}%` } : undefined}
                  />
                </div>
                <p className="social-pub-progress-label">{progress.label}</p>
              </div>
            ) : null}
            {pub?.status === 'failed' && pub?.notes ? <p className="social-pub-caption">{pub.notes}</p> : null}
            <div className="social-pub-meta">
              {task.projetos?.name ? <span><strong>Projeto</strong> {task.projetos.name}</span> : null}
              {pub?.destination ? <span><strong>Destino</strong> {pub.destination}</span> : null}
              {pub?.format ? <span><strong>Formato</strong> {pub.format}</span> : null}
              <span><strong>Data</strong> {formatPubDate(when)}</span>
            </div>
            <div className="social-pub-footer">
              {evidence ? (
                <a
                  href={evidence}
                  target="_blank"
                  rel="noreferrer"
                  className="social-pub-channel"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Comprovante
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">{socialQueueFooterLabel(task)}</span>
              )}
              <div className="social-pub-avatars">
                {(task.assignee_ids || []).map((id) => {
                  const assignee = users.find((user) => user.id === id);
                  if (!assignee) return null;
                  return (
                    <img
                      key={id}
                      alt={assignee.full_name || ''}
                      title={assignee.full_name || ''}
                      src={rewritePublicStorageUrl(assignee.avatar_url) || `https://ui-avatars.com/api/?name=${encodeURIComponent(assignee.full_name || 'U')}&background=random`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </button>
      {pub?.status === 'failed' ? (
        <FailedPublicationActions
          publication={pub}
          clientId={task.client_id || task.parentTask?.client_id}
          onDone={onRetryDone}
        />
      ) : null}
    </article>
  );
}
