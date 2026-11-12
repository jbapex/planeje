import React from 'react';
import { getMetaStatusClass, getMetaStatusLabel, normalizeMetaStatus } from '@/lib/funilMetaStatus';

export function FunilMetaStatusDot({ status, className = '' }) {
  const tone = normalizeMetaStatus(status);
  return (
    <span
      className={`funil-meta-status-dot ${getMetaStatusClass(tone)} ${className}`.trim()}
      title={getMetaStatusLabel(status)}
      aria-label={getMetaStatusLabel(status)}
      role="img"
    />
  );
}

export function FunilMetaStatusLabel({ status, className = '' }) {
  const tone = normalizeMetaStatus(status);
  return (
    <span className={`funil-meta-status-label ${getMetaStatusClass(tone)} ${className}`.trim()}>
      {getMetaStatusLabel(status)}
    </span>
  );
}

/** Linha na lista do dropdown: bolinha + nome + status */
export function FunilMetaStatusOption({ name, status }) {
  return (
    <span className="funil-meta-status-option">
      <FunilMetaStatusDot status={status} />
      <span className="funil-meta-status-option__name">{name}</span>
      <FunilMetaStatusLabel status={status} className="funil-meta-status-option__pill" />
    </span>
  );
}

/** Resumo após seleção — destaque verde/vermelho */
export function FunilMetaStatusSelected({ title, name, status }) {
  const tone = normalizeMetaStatus(status);
  return (
    <div className={`funil-meta-status-selected ${getMetaStatusClass(tone)}`}>
      <div className="funil-meta-status-selected__head">
        <FunilMetaStatusDot status={status} className="funil-meta-status-dot--lg" />
        <span className="funil-meta-status-selected__type">{title}</span>
        <FunilMetaStatusLabel status={status} />
      </div>
      <p className="funil-meta-status-selected__name">{name}</p>
    </div>
  );
}
