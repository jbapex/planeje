import React, { useState } from 'react';
import { CrmIaField } from './CrmIaPrimitives';

function ProfileTerms({ index, items, onChange, kind }) {
  const [value, setValue] = useState('');
  const keyword = kind === 'palavra-chave';
  const limit = keyword ? 30 : 50;
  const add = () => {
    const term = value.trim();
    if (!term || items.length >= limit) return;
    if (!items.includes(term)) onChange([...items, term]);
    setValue('');
  };
  return <div className="crm-ia-profile-keywords">
    <div className="crm-ia-toolbar"><CrmIaField label={`${keyword ? 'Nova palavra-chave' : 'Nova etiqueta'} do perfil ${index}`} value={value} onChange={setValue} maxLength={keyword ? 500 : 100} onKeyDown={event => {
      if (event.key === 'Enter' && !event.nativeEvent?.isComposing) { event.preventDefault(); add(); }
    }} /><button type="button" disabled={!value.trim() || items.length >= limit} onClick={add}>{`Adicionar ${kind} ao perfil ${index}`}</button></div>
    {items.length > 0 && <ul className="crm-ia-profile-terms" aria-label={`${keyword ? 'Palavras-chave' : 'Etiquetas'} do perfil ${index}`}>{items.map((item, position) => <li key={item}><span>{item}</span><button type="button" aria-label={`Remover ${kind} ${item} do perfil ${index}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== position))}>Remover</button></li>)}</ul>}
  </div>;
}

export default function CrmIaAgentProfiles({ profiles, people, onChange }) {
  const update = (id, values) => onChange(profiles.map(profile => profile.id === id ? { ...profile, ...values } : profile));
  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= profiles.length) return;
    const next = [...profiles];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return <div className="crm-ia-stack">
    <p className="crm-ia-muted">Descreva como reconhecer e atender cada perfil. Palavras-chave são pistas semânticas: a IA considera o contexto da conversa.</p>
    {profiles.length === 0 && <p className="crm-ia-state">Nenhum perfil configurado. Adicione perfis para orientar a qualificação.</p>}
    <ol className="crm-ia-profile-list">{profiles.map((profile, position) => {
      const index = position + 1;
      const actions = profile.actions || { owner_id: null, tags: [] };
      const action = values => update(profile.id, { actions: { ...actions, ...values } });
      return <li className="crm-ia-profile-card" key={profile.id}>
        <div className="crm-ia-profile-heading"><h4>{index}. {profile.nome || 'Novo perfil'}</h4><div className="crm-ia-toolbar"><button type="button" disabled={position === 0} onClick={() => move(position, -1)}>{`Subir perfil ${index}`}</button><button type="button" disabled={position === profiles.length - 1} onClick={() => move(position, 1)}>{`Descer perfil ${index}`}</button><button type="button" onClick={() => onChange(profiles.filter(item => item.id !== profile.id))}>{`Remover perfil ${index}`}</button></div></div>
        <div className="crm-ia-profile-identity"><CrmIaField label={`Nome do perfil ${index}`} value={profile.nome} onChange={nome => update(profile.id, { nome })} maxLength={100} /><CrmIaField label={`Cor do perfil ${index}`} type="color" value={profile.cor || '#6366f1'} onChange={cor => update(profile.id, { cor })} /></div>
        <CrmIaField label={`Como reconhecer e tratar este perfil ${index}`} type="textarea" value={profile.descricao} onChange={descricao => update(profile.id, { descricao })} maxLength={4000} />
        <ProfileTerms index={index} items={profile.pistas || []} onChange={pistas => update(profile.id, { pistas })} kind="palavra-chave" />
        <details><summary>Ações ao identificar o perfil {index}</summary><CrmIaField label={`Responsável ao identificar o perfil ${index}`} value={actions.owner_id || ''} onChange={owner_id => action({ owner_id: owner_id || null })} options={[{ value: '', label: 'Manter responsável atual' }, ...people]} /><ProfileTerms index={index} items={actions.tags || []} onChange={tags => action({ tags })} kind="etiqueta" /><p className="crm-ia-muted">As etiquetas são acrescentadas ao lead. Publicar configura essas ações; o rascunho não altera responsáveis, etapas ou atendimento.</p></details>
      </li>;
    })}</ol>
    <button type="button" disabled={profiles.length >= 30} onClick={() => onChange([...profiles, { id: crypto.randomUUID(), nome: '', cor: '#6366f1', descricao: '', pistas: [], actions: { owner_id: null, tags: [] } }])}>Adicionar perfil</button>
  </div>;
}
