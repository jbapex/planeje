import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { buildClientEditUrl } from '@/lib/clientHubRoutes';
import GestorIaDrawer from './GestorIaDrawer';
import { clientEditor, clientPage } from './gestorIaClientModel';

export default function GestorIaClientPicker({ clients, params, mode, canAccessClients, canManageClients, close }) {
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [platform, setPlatform] = useState(mode === 'contas-google' ? mode : 'contas-meta');
  const matches = clients.filter(({ empresa }) => empresa.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
  const selected = matches.find(({ id }) => id === clientId);
  const linking = mode !== 'cliente';

  return <GestorIaDrawer label="Carteira" title={linking ? 'Vincular conta de anúncio' : 'Selecionar cliente'} close={close}>
    <label className="gia-table-search"><Search aria-hidden="true" /><input type="search" aria-label="Buscar cliente existente" placeholder="Buscar cliente existente" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {matches.length > 0 ? <>
      <label className="gia-picker-field">Cliente
        <select className="gia-toolbar-select" id="gestor-selecionar-cliente" value={selected?.id || ''} onChange={(event) => setClientId(event.target.value)}>
          <option value="" disabled>Escolha um cliente</option>
          {matches.map(({ id, empresa }) => <option value={id} key={id}>{empresa}</option>)}
        </select>
      </label>
      {linking && <label className="gia-picker-field">Plataforma
        <select className="gia-toolbar-select" value={platform} onChange={(event) => setPlatform(event.target.value)}>
          <option value="contas-meta">Meta Ads</option><option value="contas-google">Google Ads</option>
        </select>
      </label>}
      {selected && (linking ? <Link className="gia-action-link gia-primary-action" to={clientEditor(selected.id, platform)} state={{ backOnClose: true }} onClick={close}>Abrir vínculos<ArrowUpRight aria-hidden="true" /></Link>
        : <Link className="gia-action-link gia-primary-action" to={clientPage(selected.id, params, selected.metaAccounts?.length || selected.googleAccounts?.length ? 'metricas' : 'contas')} onClick={close}>Abrir cliente</Link>)}
    </> : <div className="gia-picker-empty">
      <p>Nenhum cliente encontrado.</p>
      {canAccessClients && <Link className="gia-action-link" to="/clients">Buscar em Clientes</Link>}
      {canManageClients && <Link className="gia-action-link" to={buildClientEditUrl()}>Novo cliente</Link>}
    </div>}
  </GestorIaDrawer>;
}
