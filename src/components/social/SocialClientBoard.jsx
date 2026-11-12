import React, { useEffect, useState } from 'react';
import { BarChart3, CalendarDays, Instagram, LayoutGrid } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  clientBoardPhotoUrls,
  displaySocialAccount,
  fetchClienteSocialAccounts,
} from '@/lib/clienteSocialAccounts';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'C';
  return ((parts[0][0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

function ClientPhoto({ name, urls = [] }) {
  const sources = (urls || []).map((url) => String(url || '').trim()).filter(Boolean);
  const [index, setIndex] = useState(0);
  const key = sources.join('\n');

  useEffect(() => {
    setIndex(0);
  }, [key]);

  const src = sources[index];
  if (!src) return <span>{initials(name)}</span>;
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

export default function SocialClientBoard({
  client,
  clients = [],
  onSelectClient,
  onOpenOverview,
  onOpenProfile,
  children,
}) {
  const [accounts, setAccounts] = useState([]);
  const igAccount = accounts.find((row) => row.platform === 'instagram') || null;
  const handle = igAccount ? displaySocialAccount(igAccount) : '';
  const photoUrls = clientBoardPhotoUrls(client, accounts);

  useEffect(() => {
    if (!client?.id) {
      setAccounts([]);
      return undefined;
    }
    let active = true;
    fetchClienteSocialAccounts(supabase, client.id)
      .then((rows) => {
        if (active) setAccounts(rows || []);
      })
      .catch(() => {
        if (active) setAccounts([]);
      });
    return () => { active = false; };
  }, [client?.id]);

  return (
    <div className="social-cb">
      {client ? <header className="social-cb-head">
        <div className="social-cb-who">
          <ClientPhoto name={client.empresa} urls={photoUrls} />
          <div>
            <h2>{client.empresa}</h2>
            <p>
              {handle ? <><Instagram className="h-3.5 w-3.5" /> {handle}</> : 'Calendário de conteúdo'}
              <span className="social-cb-active">Ativo</span>
            </p>
          </div>
        </div>
        <nav className="social-cb-actions" aria-label="Área do cliente">
          <span className="is-on">
            <CalendarDays className="h-4 w-4" />
            Conteúdo
          </span>
          <button type="button" onClick={onOpenProfile}>
            <LayoutGrid className="h-4 w-4" />
            Perfil e feed
          </button>
          <button type="button" onClick={onOpenOverview}>
            <BarChart3 className="h-4 w-4" />
            Visão geral
          </button>
          <button type="button" className="is-quiet" onClick={() => onSelectClient?.('all')}>
            Trocar cliente
          </button>
        </nav>
      </header> : null}
      {children}
    </div>
  );
}
