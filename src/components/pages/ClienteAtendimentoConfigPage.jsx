import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Hash, Loader2, Lock, Pencil, Plus, Tag, Trash2, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useAtendimentoLojaMembro } from '@/hooks/useAtendimentoLojaMembro';
import { atendimentoPreviewFallbackPath } from '@/lib/atendimentoPreviewGate';
import { normalizeAtalho, podeAbrirConfiguracao } from '@/lib/atendimentoLojaAcesso';
import { deleteLojaRow, fetchLojaBase, friendlyDbError, saveLojaRow } from '@/lib/atendimentoLojaData';
import { CONFIG_EXTRA_TABS } from '@/components/atendimento-loja/configExtraTabs';
import { ColorPicker, CORES, EditModal } from '@/components/atendimento-loja/ConfigUi';
import '@/components/atendimento-loja/AtendimentoLoja.css';

function useCrud({ table, clienteId, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (row) => {
    setSaving(true);
    setError('');
    try {
      await saveLojaRow(table, clienteId, row);
      setEditing(null);
      await onChanged();
    } catch (err) {
      setError(friendlyDbError(err));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (row, pergunta) => {
    if (!window.confirm(pergunta)) return;
    try {
      await deleteLojaRow(table, clienteId, row.id);
      await onChanged();
    } catch (err) {
      window.alert(friendlyDbError(err, 'Não foi possível apagar.'));
    }
  };
  return { editing, setEditing, saving, error, setError, save, remove };
}

function SetoresTab({ clienteId, setores, membros, onChanged }) {
  const crud = useCrud({ table: 'cliente_atend_setores', clienteId, onChanged });
  const e = crud.editing;
  const contagem = (id) => membros.filter((m) => (m.setor_ids || []).includes(id)).length;
  return (
    <section className="atl-card">
      <div className="atl-card__head">
        <div>
          <h2>Setores</h2>
          <p>Separam as conversas por área (ex.: Vendas, Pós-venda). O atendente vê as conversas dos setores dele.</p>
        </div>
        <button type="button" className="atl-btn" onClick={() => crud.setEditing({ nome: '', cor: CORES[0], ordem: setores.length })}>
          <Plus className="h-4 w-4" /> Novo setor
        </button>
      </div>
      {setores.length === 0 ? (
        <p className="atl-empty">Nenhum setor.</p>
      ) : (
        <table className="atl-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Atendentes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {setores.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="atl-tag" style={{ '--atl-tag': s.cor || '#64748b', maxWidth: 'none' }}>
                    {s.nome}
                  </span>
                </td>
                <td>{contagem(s.id)}</td>
                <td className="is-actions">
                  <button type="button" onClick={() => crud.setEditing({ ...s })} aria-label={`Editar ${s.nome}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => crud.remove(s, `Apagar o setor "${s.nome}"? As conversas dele ficam sem setor.`)}
                    aria-label={`Apagar ${s.nome}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {e ? (
        <EditModal
          title={e.id ? 'Editar setor' : 'Novo setor'}
          saving={crud.saving}
          onCancel={() => crud.setEditing(null)}
          onSave={() => {
            const nome = String(e.nome || '').trim();
            if (!nome) return crud.setError('Informe o nome.');
            crud.save({ id: e.id, nome, cor: e.cor || null, ordem: Number(e.ordem) || 0 });
          }}
        >
          <label>
            <span>Nome</span>
            <input autoFocus maxLength={60} value={e.nome} onChange={(ev) => crud.setEditing({ ...e, nome: ev.target.value })} />
          </label>
          <label>
            <span>Cor</span>
            <ColorPicker value={e.cor} onChange={(cor) => crud.setEditing({ ...e, cor })} />
          </label>
          {crud.error ? <p className="atl-warn">{crud.error}</p> : null}
        </EditModal>
      ) : null}
    </section>
  );
}

function EtiquetasTab({ clienteId, etiquetas, onChanged }) {
  const crud = useCrud({ table: 'cliente_atend_etiquetas', clienteId, onChanged });
  const e = crud.editing;
  return (
    <section className="atl-card">
      <div className="atl-card__head">
        <div>
          <h2>Etiquetas</h2>
          <p>Marcam a conversa no painel do contato e servem de filtro na lista. Só a equipe da loja vê.</p>
        </div>
        <button type="button" className="atl-btn" onClick={() => crud.setEditing({ nome: '', cor: CORES[1] })}>
          <Plus className="h-4 w-4" /> Nova etiqueta
        </button>
      </div>
      {etiquetas.length === 0 ? (
        <p className="atl-empty">Nenhuma etiqueta.</p>
      ) : (
        <table className="atl-table">
          <thead>
            <tr>
              <th>Etiqueta</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {etiquetas.map((t) => (
              <tr key={t.id}>
                <td>
                  <span className="atl-tag" style={{ '--atl-tag': t.cor || '#64748b', maxWidth: 'none' }}>
                    {t.nome}
                  </span>
                </td>
                <td className="is-actions">
                  <button type="button" onClick={() => crud.setEditing({ ...t })} aria-label={`Editar ${t.nome}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => crud.remove(t, `Apagar a etiqueta "${t.nome}"? Ela some das conversas marcadas.`)}
                    aria-label={`Apagar ${t.nome}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {e ? (
        <EditModal
          title={e.id ? 'Editar etiqueta' : 'Nova etiqueta'}
          saving={crud.saving}
          onCancel={() => crud.setEditing(null)}
          onSave={() => {
            const nome = String(e.nome || '').trim();
            if (!nome) return crud.setError('Informe o nome.');
            crud.save({ id: e.id, nome, cor: e.cor || null });
          }}
        >
          <label>
            <span>Nome</span>
            <input autoFocus maxLength={40} value={e.nome} onChange={(ev) => crud.setEditing({ ...e, nome: ev.target.value })} />
          </label>
          <label>
            <span>Cor</span>
            <ColorPicker value={e.cor} onChange={(cor) => crud.setEditing({ ...e, cor })} />
          </label>
          {crud.error ? <p className="atl-warn">{crud.error}</p> : null}
        </EditModal>
      ) : null}
    </section>
  );
}

function RespostasTab({ clienteId, respostas, onChanged, userId }) {
  const crud = useCrud({ table: 'cliente_atend_respostas', clienteId, onChanged });
  const e = crud.editing;
  return (
    <section className="atl-card">
      <div className="atl-card__head">
        <div>
          <h2>Respostas rápidas</h2>
          <p>
            No compositor, clique no raio ou digite <code>/atalho</code> para colocar o texto no campo. Nada é enviado
            sozinho. Use <code>{'{nome}'}</code> para o primeiro nome do contato.
          </p>
        </div>
        <button type="button" className="atl-btn" onClick={() => crud.setEditing({ titulo: '', atalho: '', texto: '' })}>
          <Plus className="h-4 w-4" /> Nova resposta
        </button>
      </div>
      {respostas.length === 0 ? (
        <p className="atl-empty">Nenhuma resposta rápida.</p>
      ) : (
        <table className="atl-table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Atalho</th>
              <th>Texto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {respostas.map((r) => (
              <tr key={r.id}>
                <td>{r.titulo}</td>
                <td>
                  <code>/{r.atalho}</code>
                </td>
                <td className="is-clip" title={r.texto}>
                  {r.texto}
                </td>
                <td className="is-actions">
                  <button type="button" onClick={() => crud.setEditing({ ...r })} aria-label={`Editar ${r.titulo}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => crud.remove(r, `Apagar a resposta "${r.titulo}"?`)} aria-label={`Apagar ${r.titulo}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {e ? (
        <EditModal
          title={e.id ? 'Editar resposta rápida' : 'Nova resposta rápida'}
          saving={crud.saving}
          wide
          onCancel={() => crud.setEditing(null)}
          onSave={() => {
            const titulo = String(e.titulo || '').trim();
            const atalho = normalizeAtalho(e.atalho || titulo);
            const texto = String(e.texto || '').trim();
            if (!titulo || !atalho || !texto) return crud.setError('Preencha título, atalho e texto.');
            const row = { id: e.id, titulo, atalho, texto };
            if (!e.id) row.created_by = userId;
            crud.save(row);
          }}
        >
          <div className="atl-grid-2">
            <label>
              <span>Título</span>
              <input autoFocus maxLength={80} value={e.titulo} onChange={(ev) => crud.setEditing({ ...e, titulo: ev.target.value })} />
            </label>
            <label>
              <span>Atalho (letras, números, - e _)</span>
              <input
                maxLength={31}
                value={e.atalho ? `/${e.atalho}` : ''}
                placeholder={`/${normalizeAtalho(e.titulo) || 'boasvindas'}`}
                onChange={(ev) => crud.setEditing({ ...e, atalho: normalizeAtalho(ev.target.value) })}
              />
            </label>
          </div>
          <label>
            <span>Texto</span>
            <textarea rows={6} maxLength={4000} value={e.texto} onChange={(ev) => crud.setEditing({ ...e, texto: ev.target.value })} />
          </label>
          {crud.error ? <p className="atl-warn">{crud.error}</p> : null}
        </EditModal>
      ) : null}
    </section>
  );
}

const BASE_TABS = [
  { key: 'setores', label: 'Setores', icon: Hash, perm: 'configurarSetores' },
  { key: 'etiquetas', label: 'Etiquetas', icon: Tag, perm: 'configurarEtiquetas' },
  { key: 'respostas', label: 'Respostas rápidas', icon: Zap, perm: 'configurarRespostas' },
];

/** Configurações do Atendimento da loja (só admin/supervisor da loja). */
export default function ClienteAtendimentoConfigPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { gate, nivel, permissoes, loading, clienteId, membro } = useAtendimentoLojaMembro();
  const [base, setBase] = useState(null);
  const [loadError, setLoadError] = useState('');

  const tabs = useMemo(
    () => [...BASE_TABS, ...CONFIG_EXTRA_TABS].filter((tab) => permissoes[tab.perm]),
    [permissoes]
  );
  const requested = params.get('aba');
  const active = tabs.find((t) => t.key === requested)?.key || tabs[0]?.key || null;

  const reload = useCallback(async () => {
    if (!clienteId || !nivel) return;
    try {
      setBase(await fetchLojaBase(clienteId));
      setLoadError('');
    } catch (err) {
      setLoadError(friendlyDbError(err, 'Não foi possível carregar.'));
    }
  }, [clienteId, nivel]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!gate) return <Navigate to={atendimentoPreviewFallbackPath(profile)} replace />;
  if (loading) {
    return (
      <div className="atl-center">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando acesso…
      </div>
    );
  }
  if (!nivel || !podeAbrirConfiguracao(nivel)) {
    return (
      <div className="atl-center">
        <Lock className="h-5 w-5" />
        <p>Só o administrador ou supervisor da loja abre as configurações do atendimento.</p>
        <button type="button" className="atl-btn is-ghost" onClick={() => navigate('/cliente/atendimento')}>
          Voltar ao atendimento
        </button>
      </div>
    );
  }

  const ActiveExtra = CONFIG_EXTRA_TABS.find((t) => t.key === active)?.Component;

  return (
    <>
      <Helmet title="Configurações do atendimento — Planeje" />
      <div className="atl-config">
        <div className="atl-config__head">
          <button type="button" className="atl-btn is-ghost is-sm" onClick={() => navigate('/cliente/atendimento')} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1>Configurações do atendimento</h1>
            <p>Valem só para esta loja. Seu nível: {membro?.nivel === 'admin' ? 'Administrador da loja' : 'Supervisor'}.</p>
          </div>
        </div>
        <nav className="atl-config__tabs" aria-label="Seções">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                className={active === tab.key ? 'is-active' : undefined}
                onClick={() => setParams({ aba: tab.key }, { replace: true })}
              >
                <Icon className="h-4 w-4" /> {tab.label}
              </button>
            );
          })}
        </nav>
        {loadError ? <p className="atl-warn">{loadError}</p> : null}
        {!base ? (
          <p className="atl-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </p>
        ) : active === 'setores' ? (
          <SetoresTab clienteId={clienteId} setores={base.setores} membros={base.membros} onChanged={reload} />
        ) : active === 'etiquetas' ? (
          <EtiquetasTab clienteId={clienteId} etiquetas={base.etiquetas} onChanged={reload} />
        ) : active === 'respostas' ? (
          <RespostasTab clienteId={clienteId} respostas={base.respostas} onChanged={reload} userId={user?.id} />
        ) : ActiveExtra ? (
          <ActiveExtra clienteId={clienteId} base={base} onChanged={reload} userId={user?.id} membro={membro} />
        ) : null}
      </div>
    </>
  );
}
