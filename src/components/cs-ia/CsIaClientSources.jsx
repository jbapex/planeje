import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { DOCUMENT_KINDS, DOCUMENT_STATES } from '@/lib/clientDocumentRecords';
import { dateTime } from './csIaPresentation';

const counts = [['leads', 'Oportunidades'], ['qualified', 'Qualificadas'], ['won', 'Compraram']];
const number = new Intl.NumberFormat('pt-BR');

export default function CsIaClientSources({ crm, href, source }) {
  const title = crm ? 'CRM do cliente' : 'Arquivos do cliente';
  const loading = Boolean(source.request) || (!source.data && !source.error);
  const data = loading || source.error ? null : source.data;
  return <section className="gia-panel gia-stack" aria-labelledby="cs-client-source-title">
    <div className="gia-section-heading"><h2 id="cs-client-source-title">{title}</h2>
      <div className="cs-actions">
        <button type="button" className="gia-action-link" aria-label={crm ? 'Atualizar CRM' : 'Atualizar arquivos'}
          disabled={loading} onClick={() => source.reload()}><RefreshCw aria-hidden="true" /> Atualizar</button>
        <Link className="gia-action-link" to={href}>{crm ? 'Abrir CRM' : 'Abrir arquivos e memória'} <ArrowUpRight aria-hidden="true" /></Link>
      </div>
    </div>
    {loading && <p role="status">{crm ? 'Carregando CRM…' : 'Carregando arquivos…'}</p>}
    {source.error && !loading && <div className="cs-actions">
      <p className="gia-notice" role="alert">{crm ? 'Não foi possível consultar o CRM deste cliente.' : 'Não foi possível consultar os arquivos deste cliente.'}</p>
      <button type="button" className="gia-action-link" onClick={() => source.reload()}>Tentar novamente</button>
    </div>}
    {data && crm && <>
      <p className="gia-caption">Oportunidades registradas no CRM deste cliente, em todo o histórico.</p>
      <ul className="cs-summary">{counts.map(([key, label]) => <li key={key}><span>{label}</span><strong>{number.format(data.totals[key])}</strong></li>)}</ul>
    </>}
    {data && <>
      <h3>{crm ? 'Movimentações recentes do funil' : 'Documentos recentes'}</h3>
      {data.items.length === 0 ? <p className="gia-empty" role="status">{crm ? 'Nenhuma movimentação registrada.' : 'Nenhum documento ativo disponível.'}</p>
        : <ol className="cs-summary cs-timeline">{data.items.map((item) => <li key={item.id}>
          <div>{crm ? <><h3><Link className="gia-action-link" to={`/crm/leads/${encodeURIComponent(item.lead_id)}`}>{item.label || 'Abrir oportunidade'}</Link></h3>
            <p className="gia-caption">{item.stage || 'Etapa indisponível'}</p></>
            : <><h3>{item.title || 'Sem título'}</h3><p className="gia-caption">{Object.hasOwn(DOCUMENT_KINDS, item.kind) ? DOCUMENT_KINDS[item.kind] : 'Documento'}
              {Object.hasOwn(DOCUMENT_STATES, item.state) && ` · ${DOCUMENT_STATES[item.state]}`}</p></>}
          </div>
          <time dateTime={crm ? item.at : item.created_at}>{dateTime(crm ? item.at : item.created_at)}</time>
        </li>)}</ol>}
    </>}
  </section>;
}
