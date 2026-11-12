import { appointmentDay, readMiniCrm, boolFromSimNao, isSoldMiniStatus } from './miniCrm.js';
const entryDay = value => { const time = Date.parse(value || ''); return Number.isFinite(time) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(time) : ''; };
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value ? value : '';
export function summarizeConsultingResults(contacts, { since, until, columns = [], complete = false, queriedAt = new Date().toISOString() }) {
  const inside = date => Boolean(date && date >= since && date <= until);
  const unique = [...new Map(contacts.filter(c=>c.id).map(c=>[c.id,c])).values()];
  const rows = unique.map(contact=>{const mini=readMiniCrm(contact.mini_crm);return {id:contact.id,entry:entryDay(contact.first_seen_at),appointment:day(appointmentDay(mini,columns)),sale:day(mini.data_venda),sold:contact.comprou===true || (contact.comprou==null && isSoldMiniStatus(mini.status)),qualified:contact.qualificado===true ? true : boolFromSimNao(mini.qualificado),attended:boolFromSimNao(mini.compareceu)};});
  const cohort=rows.filter(r=>inside(r.entry));
  const saleIds=rows.filter(r=>r.sold&&inside(r.sale)).map(r=>r.id);
  return {period:{since,until},queried_at:queriedAt,complete,contacts_read:rows.length,
    movement:{appointments_with_date:rows.filter(r=>inside(r.appointment)).length,confirmed_sales_with_date:saleIds.length,sale_contact_ids:saleIds,qualified:null,attended:null},
    acquisition_cohort:{contacts:cohort.length,qualified:cohort.filter(r=>r.qualified===true).length,appointments:cohort.filter(r=>r.appointment).length,attended:cohort.filter(r=>r.attended===true).length,confirmed_sales:cohort.filter(r=>r.sold).length,later_sale_contact_ids:cohort.filter(r=>r.sold&&r.sale>until).map(r=>r.id),unknown_qualification:cohort.filter(r=>r.qualified==null).length,unknown_attendance:cohort.filter(r=>r.attended==null).length,without_appointment_date:cohort.filter(r=>!r.appointment).length,without_confirmed_sale:cohort.filter(r=>!r.sold).length},
    missing:{entry_date:rows.filter(r=>!r.entry).length,sale_date:rows.filter(r=>r.sold&&!r.sale).length},
    note:'Contatos únicos do CRM, sem somar leads de outra fonte. Movimento usa a data do compromisso/venda; evolução usa a entrada do contato e inclui fechamento posterior. São duas leituras da mesma venda, não totais somáveis. Qualificação/comparecimento sem data não compõem movimento. Falta de confirmação não prova ausência de venda. Retrato atual por contato, não histórico de reagendamentos ou múltiplas vendas. Referência de 20–40 dias não encerra oportunidades.'};
}
