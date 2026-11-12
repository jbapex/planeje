import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Zap } from 'lucide-react';
import { ATENDIMENTO_EMOJIS } from '@/lib/atendimentoMediaSend';

const EXTRA_EMOJIS = ['💍', '👰', '👗', '💐', '🥂', '💒', '🎀', '🌸', '😃', '🙌', '👋', '💖'];

function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const onDoc = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onClose]);
}

export function EmojiPopover({ onPick, onClose }) {
  const ref = useRef(null);
  useOutsideClose(ref, onClose);
  const emojis = useMemo(() => [...ATENDIMENTO_EMOJIS, ...EXTRA_EMOJIS], []);
  return (
    <div ref={ref} className="atl-popover atl-popover--emoji" role="dialog" aria-label="Emojis">
      <div className="atl-emoji-grid">
        {emojis.map((emoji) => (
          <button key={emoji} type="button" onClick={() => onPick(emoji)} aria-label={`Inserir ${emoji}`}>
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RespostasPopover({ respostas, onPick, onClose, onConfigure }) {
  const ref = useRef(null);
  const [query, setQuery] = useState('');
  useOutsideClose(ref, onClose);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return respostas;
    return respostas.filter(
      (item) =>
        item.atalho.includes(q.replace(/^\//, '')) ||
        item.titulo.toLowerCase().includes(q) ||
        item.texto.toLowerCase().includes(q)
    );
  }, [respostas, query]);
  return (
    <div ref={ref} className="atl-popover atl-popover--respostas" role="dialog" aria-label="Respostas rápidas">
      <header>
        <strong>
          <Zap className="h-3.5 w-3.5" /> Respostas rápidas
        </strong>
        <button type="button" onClick={onClose} aria-label="Fechar">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <label className="atl-popover__search">
        <Search className="h-3.5 w-3.5" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título ou /atalho"
        />
      </label>
      {filtered.length === 0 ? (
        <p className="atl-popover__empty">
          {respostas.length === 0 ? 'Nenhuma resposta rápida cadastrada.' : 'Nada encontrado.'}
          {onConfigure ? (
            <button type="button" onClick={onConfigure}>
              Cadastrar respostas
            </button>
          ) : null}
        </p>
      ) : (
        <ul>
          {filtered.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onPick(item)}>
                <span>
                  <strong>{item.titulo}</strong>
                  <code>/{item.atalho}</code>
                </span>
                <em>{item.texto}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Lista que aparece ao digitar "/" no compositor. */
export function AtalhoSugestoes({ respostas, termo, onPick }) {
  const list = respostas
    .filter((item) => item.atalho.startsWith(termo) || item.titulo.toLowerCase().includes(termo))
    .slice(0, 6);
  if (!list.length) return null;
  return (
    <ul className="atl-atalhos" role="listbox" aria-label="Respostas rápidas">
      {list.map((item, index) => (
        <li key={item.id}>
          <button
            type="button"
            role="option"
            aria-selected={index === 0}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(item);
            }}
          >
            <code>/{item.atalho}</code>
            <strong>{item.titulo}</strong>
            <em>{item.texto}</em>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function filtrarAtalhos(respostas, termo) {
  return respostas.filter((item) => item.atalho.startsWith(termo) || item.titulo.toLowerCase().includes(termo));
}

/** Troca {nome} pelo primeiro nome do contato. */
export function aplicarVariaveis(texto, contato) {
  const primeiro = String(contato?.name || '').trim().split(/\s+/)[0] || '';
  return String(texto || '').replace(/\{nome\}/gi, primeiro);
}

export function TransferDialog({ conversa, setores, membros, currentUserId, onCancel, onConfirm, saving }) {
  const [setorId, setSetorId] = useState(conversa?.setor_id || '');
  const [assignedTo, setAssignedTo] = useState(conversa?.assigned_to || '');
  const ativos = membros.filter((m) => m.ativo);
  const elegiveis = setorId
    ? ativos.filter((m) => m.nivel !== 'atendente' || (m.setor_ids || []).includes(setorId))
    : ativos;
  return (
    <div className="atl-modal" role="dialog" aria-modal="true" aria-label="Transferir conversa">
      <div className="atl-modal__card">
        <header>
          <h3>Transferir conversa</h3>
          <button type="button" onClick={onCancel} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <label>
          <span>Setor</span>
          <select value={setorId} onChange={(e) => setSetorId(e.target.value)}>
            <option value="">Sem setor</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Atendente</span>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Ninguém (fica para o setor)</option>
            {elegiveis.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.nome || m.email}
                {m.user_id === currentUserId ? ' (você)' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="atl-modal__hint">
          Atendente só enxerga conversas atribuídas a ele ou do setor dele. Conversa privada deixa de ser privada
          ao trocar de atendente.
        </p>
        <footer>
          <button type="button" className="atl-btn is-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="atl-btn"
            disabled={saving}
            onClick={() => onConfirm({ setor_id: setorId || null, assigned_to: assignedTo || null })}
          >
            {saving ? 'Transferindo…' : 'Transferir'}
          </button>
        </footer>
      </div>
    </div>
  );
}
