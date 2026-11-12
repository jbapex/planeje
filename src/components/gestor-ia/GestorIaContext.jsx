import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export function number(value, decimals = 0) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: decimals }).format(Number(value));
}

export function date(value) {
  if (!value) return 'Não informada';
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? 'Não informada' : parsed.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function readingTime(value) {
  const parsed = new Date(value ?? NaN);
  if (!Number.isFinite(parsed.getTime())) return '';
  return `${date(value)} às ${parsed.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
}

export function periodLabel(period) {
  return period?.since && period?.until ? `${date(period.since)} a ${date(period.until)}` : 'Período não informado';
}

const OBJECTIVES = { mensagens: 'Mensagens', compras: 'Compras', leads: 'Leads', trafego: 'Tráfego', engajamento: 'Engajamento', alcance: 'Alcance', misto: 'Misto' };

export function objectiveLabel(objective) {
  return OBJECTIVES[objective] || objective || '';
}

export default function GestorIaContext({ client, embedded = false }) {
  const { canViewField } = useAuth();
  const value = (field, shown) => canViewField?.(field) === true ? shown : 'Acesso restrito';
  const fields = <dl className="gia-context-grid">
    <div><dt>Objetivo Meta</dt><dd>{value('objetivo_meta', objectiveLabel(client.objetivo_meta) || 'Não informado')}</dd></div>
    <div><dt>Gestor responsável</dt><dd>{value('responsavel', client.gestorName)}</dd></div>
    <div><dt>Limite Meta cadastrado</dt><dd>{value('valor', value('limite_meta', number(client.limite_meta, 2)))}</dd></div>
    <div><dt>Meta por mensagem</dt><dd>{value('meta_custo_mensagem', number(client.meta_custo_mensagem, 2))}</dd></div>
    <div><dt>Meta por compra</dt><dd>{value('meta_custo_compra', number(client.meta_custo_compra, 2))}</dd></div>
    <div><dt>ROAS alvo</dt><dd>{value('roas_alvo', number(client.roas_alvo, 2))}</dd></div>
    <div><dt>Nicho</dt><dd>{value('nicho', client.nicho || 'Não informado')}</dd></div>
    <div><dt>Público</dt><dd>{value('publico_alvo', client.publico_alvo || 'Não informado')}</dd></div>
    <div><dt>Sobre a empresa</dt><dd>{value('sobre_empresa', client.sobre_empresa || 'Não informado')}</dd></div>
    <div><dt>Produtos e serviços</dt><dd>{value('produtos_servicos', client.produtos_servicos || 'Não informado')}</dd></div>
    <div><dt>Tom de voz</dt><dd>{value('tom_de_voz', client.tom_de_voz || 'Não informado')}</dd></div>
  </dl>;
  return embedded ? fields : (
    <section className="gia-panel" aria-label="Contexto do cliente">
      <div className="gia-section-heading"><div><h2>Memória do cliente</h2><p className="gia-caption">Contexto e referências do cadastro no Planeje.</p></div></div>
      {fields}
    </section>
  );
}
