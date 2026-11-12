import React from 'react';
import { RefreshCw } from 'lucide-react';
import { readingTime } from './GestorIaContext';

export function metaRefreshNotice({ refreshStatus, retryAt, fetchedAt }) {
  const retry = readingTime(retryAt);
  if (refreshStatus === 'cooldown') return retry ? `A próxima atualização fica disponível em ${retry}.` : 'Outra atualização está em andamento.';
  if (refreshStatus === 'rate-limited') return retry ? `A Meta limitou as consultas. Próxima tentativa após ${retry}.` : 'A Meta limitou as consultas.';
  if (refreshStatus === 'failed') return fetchedAt ? 'Não foi possível atualizar. A última leitura continua visível.' : 'Não foi possível obter uma nova leitura da Meta.';
  if (refreshStatus === 'future') return 'O período selecionado começa depois de hoje.';
  return '';
}

export default function GestorIaRefresh({ onClick, pending, disabled, fetchedAt, accountName, savedOnly = false }) {
  const last = readingTime(fetchedAt);
  return <>
    <button className="gia-action-link" type="button" onClick={onClick} disabled={disabled || pending} title={accountName ? `Atualizar ${accountName}` : undefined}>
      <RefreshCw aria-hidden="true" />{pending ? 'Atualizando…' : savedOnly ? 'Reler dados salvos' : 'Atualizar agora'}
    </button>
    {last && <span className="gia-caption">{accountName ? `${accountName} · ` : savedOnly ? 'Leitura mais recente · ' : 'Última leitura: '}<time dateTime={fetchedAt}>{last}</time></span>}
  </>;
}
