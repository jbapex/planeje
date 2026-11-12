import React, { useState } from 'react';
import { filterAtlasClients } from '@/lib/atlasConversationClients';

export default function AtlasClientChoice({ choice, clients, onConfirm, onCancel, disabled }) {
  const [searching, setSearching] = useState(Boolean(choice.search || !choice.candidates.length));
  const [query, setQuery] = useState(choice.query || '');
  const options = searching ? filterAtlasClients(clients, query) : choice.candidates;
  return <div className="atlas-client-choice">
    <article className="atlas-message atlas-message-user"><div className="atlas-message-author">Seu pedido · aguardando cliente</div><p>{choice.message}</p></article>
    <div className="atlas-client-question" role="group" aria-label="Confirmar cliente do pedido">
      <strong>{searching ? 'Qual cliente vamos conferir?' : choice.candidates.length === 1 ? 'É sobre este cliente?' : 'Encontrei mais de um cliente. Qual deles?'}</strong>
      <p>Confirmando aqui, sigo com seu pedido usando os registros desse cliente.</p>
      {searching && <label>Buscar cliente<input autoFocus type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome do cliente" disabled={disabled} /></label>}
      <div className="atlas-client-options">{options.map(client => <button type="button" key={client.id} disabled={disabled} onClick={() => onConfirm(client.id)}>{client.empresa}<span>Usar este cliente ↗</span></button>)}</div>
      {searching && !options.length && <p>Nenhum cliente encontrado. Tente outro nome ou escolha Visão geral.</p>}
      <div className="atlas-client-choice-actions">
        {!searching && <button type="button" className="atlas-text-button" onClick={() => setSearching(true)}>Escolher outro</button>}
        <button type="button" className="atlas-text-button" disabled={disabled} onClick={() => onConfirm('')}>Visão geral</button>
        <button type="button" className="atlas-text-button" disabled={disabled} onClick={onCancel}>Editar pedido</button>
      </div>
    </div>
  </div>;
}
