import React, { useState } from 'react';
import { NODE_CONFIG, CATEGORIES } from '@/components/funil/nodeConfig';
import ICONS from '@/components/funil/components/nodeIcons';

function NodeCard({ type, cfg }) {
  const onDragStart = (e) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="nc" draggable onDragStart={onDragStart} title={cfg.description}>
      {cfg.shape === 'circle' && (
        <div
          className="nc__circle"
          style={{
            background: cfg.gradient || cfg.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {ICONS[type] && (
            <span style={{ display: 'flex', transform: 'scale(0.72)', opacity: 0.95 }}>
              {ICONS[type]}
            </span>
          )}
        </div>
      )}
      {cfg.shape === 'browser' && (
        <div className="nc__browser">
          <div className="nc__browser-chrome"/>
          <div className="nc__browser-body"/>
        </div>
      )}
      {cfg.shape === 'diamond' && (
        <div
          className="nc__diamond"
          style={{
            background: cfg.gradient || cfg.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {ICONS[type] && (
            <span style={{ display: 'flex', transform: 'rotate(-45deg) scale(0.6)', opacity: 0.95 }}>
              {ICONS[type]}
            </span>
          )}
        </div>
      )}
      <span className="nc__label">{cfg.label}</span>
    </div>
  );
}

function CategorySection({ name, types }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="cat-section">
      <button className="cat-header" onClick={() => setOpen(o => !o)}>
        <span>{name}</span>
        <span className="cat-arrow">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="cat-grid">
          {types.map(([type, cfg]) => (
            <NodeCard key={type} type={type} cfg={cfg} />
          ))}
        </div>
      )}
    </div>
  );
}

function SavedItem({ diagram, isActive, onLoad, onDelete }) {
  const date = new Date(diagram.updatedAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit',
  });
  return (
    <div className={`saved-item ${isActive ? 'saved-item--active' : ''}`}>
      <button className="saved-item__name" onClick={() => onLoad(diagram.id)}>
        <span className="saved-item__title">
          {diagram.name}
          {diagram.isPublished && <span className="saved-item__pub" title="Publicado"> ●</span>}
        </span>
        <span className="saved-item__date">{date}</span>
      </button>
      <button className="saved-item__delete" onClick={() => onDelete(diagram.id)} title="Deletar">✕</button>
    </div>
  );
}

export default function Sidebar({ savedDiagrams, onLoadDiagram, onDeleteDiagram, currentId, clienteName }) {
  const byCategory = CATEGORIES.map(cat => [
    cat,
    Object.entries(NODE_CONFIG).filter(([, cfg]) => cfg.category === cat),
  ]);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        {byCategory.map(([cat, types]) => (
          <CategorySection key={cat} name={cat} types={types} />
        ))}
        <p className="sidebar-hint">↑ Arraste para o canvas</p>
      </div>

      <div className="sidebar-bottom">
        <p className="sidebar-section-title">
          {clienteName ? `Funis · ${clienteName}` : 'Funis desta conta'}
        </p>
        <div className="saved-list">
          {savedDiagrams.length === 0 ? (
            <p className="saved-empty">Nenhum funil salvo.</p>
          ) : (
            savedDiagrams.map(d => (
              <SavedItem
                key={d.id} diagram={d} isActive={d.id === currentId}
                onLoad={onLoadDiagram} onDelete={onDeleteDiagram}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
