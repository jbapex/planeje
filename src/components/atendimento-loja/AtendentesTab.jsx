import React, { useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import {
  ATENDIMENTO_NIVEIS,
  ATENDIMENTO_NIVEL_DESCRICAO,
  ATENDIMENTO_NIVEL_LABEL,
  permissoesDoNivel,
} from '@/lib/atendimentoLojaAcesso';
import { friendlyDbError, saveLojaRow } from '@/lib/atendimentoLojaData';
import { criarUsuarioLoja, trocarSenhaUsuarioLoja } from '@/lib/atendimentoLojaUsuarios';
import { EditModal } from '@/components/atendimento-loja/ConfigUi';

const PERM_LINHAS = [
  ['verTodas', 'Vê todas as conversas'],
  ['verPrivadas', 'Vê conversas privadas de outros'],
  ['enviar', 'Envia mensagem e nota'],
  ['transferir', 'Transfere conversa'],
  ['usarIA', 'Usa Sugerir resposta (IA)'],
  ['configurarRespostas', 'Respostas rápidas, etiquetas e setores'],
  ['gerenciarUsuarios', 'Cria e edita usuários'],
  ['configurarIA', 'Configura agentes de IA'],
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function NivelPicker({ value, onChange }) {
  return (
    <div className="atl-nivel-list" role="radiogroup" aria-label="Nível de acesso">
      {ATENDIMENTO_NIVEIS.map((nivel) => (
        <label key={nivel} className={value === nivel ? 'is-active' : undefined}>
          <input type="radio" name="atl-nivel" checked={value === nivel} onChange={() => onChange(nivel)} />
          <span>
            <strong>{ATENDIMENTO_NIVEL_LABEL[nivel]}</strong>
            <small>{ATENDIMENTO_NIVEL_DESCRICAO[nivel]}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

function SetorChecks({ setores, value, onChange }) {
  if (!setores.length) return <p className="atl-modal__hint">A loja ainda não tem setores.</p>;
  const set = new Set(value || []);
  return (
    <div className="atl-check-list">
      {setores.map((s) => (
        <label key={s.id}>
          <input
            type="checkbox"
            checked={set.has(s.id)}
            onChange={(ev) => {
              const next = new Set(set);
              if (ev.target.checked) next.add(s.id);
              else next.delete(s.id);
              onChange([...next]);
            }}
          />
          {s.nome}
        </label>
      ))}
    </div>
  );
}

/** Aba Atendentes: usuários da loja por nível (só o administrador da loja). */
export default function AtendentesTab({ clienteId, base, onChanged, userId }) {
  const { membros, setores } = base;
  const [novo, setNovo] = useState(null);
  const [editando, setEditando] = useState(null);
  const [senha, setSenha] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const setorNome = useMemo(() => Object.fromEntries(setores.map((s) => [s.id, s.nome])), [setores]);

  const fechar = () => {
    setNovo(null);
    setEditando(null);
    setSenha(null);
    setError('');
  };

  const salvarNovo = async () => {
    const nome = String(novo.nome || '').trim();
    const email = String(novo.email || '').trim().toLowerCase();
    if (!nome) return setError('Informe o nome.');
    if (!EMAIL_RE.test(email)) return setError('Informe um e-mail válido.');
    if (String(novo.senha || '').length < 8) return setError('A senha precisa de pelo menos 8 caracteres.');
    setSaving(true);
    setError('');
    try {
      await criarUsuarioLoja({ clienteId, nome, email, senha: novo.senha, nivel: novo.nivel, setorIds: novo.setor_ids });
      setAviso(`Login criado para ${email}. Passe a senha à pessoa por um canal seguro.`);
      fechar();
      await onChanged();
    } catch (err) {
      setError(err?.message || 'Não foi possível criar o usuário.');
    } finally {
      setSaving(false);
    }
  };

  const salvarEdicao = async () => {
    const nome = String(editando.nome || '').trim();
    if (!nome) return setError('Informe o nome.');
    setSaving(true);
    setError('');
    try {
      await saveLojaRow('cliente_atend_membros', clienteId, {
        id: editando.id,
        nome,
        nivel: editando.nivel,
        ativo: editando.ativo,
        setor_ids: editando.setor_ids || [],
      });
      fechar();
      await onChanged();
    } catch (err) {
      setError(friendlyDbError(err));
    } finally {
      setSaving(false);
    }
  };

  const salvarSenha = async () => {
    if (String(senha.valor || '').length < 8) return setError('A senha precisa de pelo menos 8 caracteres.');
    setSaving(true);
    setError('');
    try {
      await trocarSenhaUsuarioLoja({ clienteId, userId: senha.membro.user_id, senha: senha.valor });
      setAviso(`Senha trocada para ${senha.membro.email || senha.membro.nome}.`);
      fechar();
    } catch (err) {
      setError(err?.message || 'Não foi possível trocar a senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="atl-card">
        <div className="atl-card__head">
          <div>
            <h2>Atendentes</h2>
            <p>
              Cada pessoa da loja entra com o próprio e-mail e senha e vê o que o nível permite. O nível vale no servidor:
              o atendente não consegue abrir conversa de outro setor nem pelo endereço.
            </p>
          </div>
          <button
            type="button"
            className="atl-btn"
            onClick={() => setNovo({ nome: '', email: '', senha: '', nivel: 'atendente', setor_ids: setores[0] ? [setores[0].id] : [] })}
          >
            <Plus className="h-4 w-4" /> Novo usuário
          </button>
        </div>
        {aviso ? <p className="atl-info">{aviso}</p> : null}
        <table className="atl-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Nível</th>
              <th>Setores</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.nome || '—'}
                  {m.user_id === userId ? <span className="atl-modal__hint"> (você)</span> : null}
                </td>
                <td className="is-clip">{m.email || '—'}</td>
                <td>
                  <span className={`atl-badge is-${m.nivel}`}>{ATENDIMENTO_NIVEL_LABEL[m.nivel] || m.nivel}</span>
                </td>
                <td className="is-clip">
                  {m.nivel === 'atendente'
                    ? (m.setor_ids || []).map((id) => setorNome[id]).filter(Boolean).join(', ') || 'Nenhum'
                    : 'Todos'}
                </td>
                <td>
                  <span className={`atl-badge ${m.ativo ? 'is-on' : 'is-off'}`}>{m.ativo ? 'Ativo' : 'Desativado'}</span>
                </td>
                <td className="is-actions">
                  <button type="button" onClick={() => setEditando({ ...m })} aria-label={`Editar ${m.nome || m.email}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  {m.created_by ? (
                    <button
                      type="button"
                      onClick={() => setSenha({ membro: m, valor: '' })}
                      aria-label={`Trocar senha de ${m.nome || m.email}`}
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="atl-card">
        <div className="atl-card__head">
          <div>
            <h2>O que cada nível pode</h2>
            <p>
              Supervisor e atendente entram só em Atendimento, Mini CRM e Calendário; Meus Dados e as demais páginas ficam
              com o administrador.
            </p>
          </div>
        </div>
        <table className="atl-perm-table">
          <thead>
            <tr>
              <th>Permissão</th>
              {ATENDIMENTO_NIVEIS.map((n) => (
                <th key={n}>{ATENDIMENTO_NIVEL_LABEL[n]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_LINHAS.map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                {ATENDIMENTO_NIVEIS.map((n) => (
                  <td key={n}>
                    {permissoesDoNivel(n)[key] ? (
                      <span className="atl-perm-yes" aria-label="sim">✓</span>
                    ) : (
                      <span className="atl-perm-no" aria-label="não">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {novo ? (
        <EditModal title="Novo usuário da loja" saving={saving} wide saveLabel="Criar login" onCancel={fechar} onSave={salvarNovo}>
          <div className="atl-grid-2">
            <label>
              <span>Nome</span>
              <input autoFocus maxLength={80} value={novo.nome} onChange={(ev) => setNovo({ ...novo, nome: ev.target.value })} />
            </label>
            <label>
              <span>E-mail (login)</span>
              <input type="email" maxLength={120} value={novo.email} onChange={(ev) => setNovo({ ...novo, email: ev.target.value })} />
            </label>
          </div>
          <label>
            <span>Senha inicial (mín. 8 caracteres)</span>
            <input
              type="password"
              autoComplete="new-password"
              value={novo.senha}
              onChange={(ev) => setNovo({ ...novo, senha: ev.target.value })}
            />
          </label>
          <label>
            <span>Nível de acesso</span>
            <NivelPicker value={novo.nivel} onChange={(nivel) => setNovo({ ...novo, nivel })} />
          </label>
          {novo.nivel === 'atendente' ? (
            <label>
              <span>Setores do atendente</span>
              <SetorChecks setores={setores} value={novo.setor_ids} onChange={(setor_ids) => setNovo({ ...novo, setor_ids })} />
            </label>
          ) : null}
          <p className="atl-modal__hint">E-mail que já tem login no Planeje não é aceito. Nada é enviado por e-mail.</p>
          {error ? <p className="atl-warn">{error}</p> : null}
        </EditModal>
      ) : null}

      {editando ? (
        <EditModal title={`Editar ${editando.nome || editando.email || 'usuário'}`} saving={saving} wide onCancel={fechar} onSave={salvarEdicao}>
          <label>
            <span>Nome</span>
            <input autoFocus maxLength={80} value={editando.nome || ''} onChange={(ev) => setEditando({ ...editando, nome: ev.target.value })} />
          </label>
          <label>
            <span>Nível de acesso</span>
            <NivelPicker value={editando.nivel} onChange={(nivel) => setEditando({ ...editando, nivel })} />
          </label>
          {editando.nivel === 'atendente' ? (
            <label>
              <span>Setores do atendente</span>
              <SetorChecks
                setores={setores}
                value={editando.setor_ids}
                onChange={(setor_ids) => setEditando({ ...editando, setor_ids })}
              />
            </label>
          ) : null}
          <div className="atl-row">
            <button
              type="button"
              role="switch"
              aria-checked={editando.ativo}
              aria-label="Ativo"
              className={`atl-switch${editando.ativo ? ' is-on' : ''}`}
              onClick={() => setEditando({ ...editando, ativo: !editando.ativo })}
            />
            <span>{editando.ativo ? 'Ativo' : 'Desativado: entra no Planeje mas não vê nenhuma conversa'}</span>
          </div>
          {error ? <p className="atl-warn">{error}</p> : null}
        </EditModal>
      ) : null}

      {senha ? (
        <EditModal title={`Nova senha para ${senha.membro.email || senha.membro.nome}`} saving={saving} saveLabel="Trocar senha" onCancel={fechar} onSave={salvarSenha}>
          <label>
            <span>Nova senha (mín. 8 caracteres)</span>
            <input
              autoFocus
              type="password"
              autoComplete="new-password"
              value={senha.valor}
              onChange={(ev) => setSenha({ ...senha, valor: ev.target.value })}
            />
          </label>
          {error ? <p className="atl-warn">{error}</p> : null}
        </EditModal>
      ) : null}
    </>
  );
}
