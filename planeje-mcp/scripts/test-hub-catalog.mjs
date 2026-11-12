import { HUB_TABS, filterHubTabs, findHubTab } from '../src/hubCatalog.ts';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const keys = HUB_TABS.map((t) => `${t.modulo}/${t.aba}`);
const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
if (dup.length) fail(`abas duplicadas: ${dup.join(', ')}`);

const paid = filterHubTabs({ modulo: 'paid_traffic' });
if (paid.length < 8) fail(`tráfego deveria ter várias abas, veio ${paid.length}`);

const social = filterHubTabs({ modulo: 'social_media' });
if (social.length < 5) fail(`redes deveria ter várias abas, veio ${social.length}`);

const rast = filterHubTabs({ modulo: 'rastreamento' });
if (rast.length < 6) fail(`rastreamento deveria ter várias abas, veio ${rast.length}`);

if (!findHubTab('paid_traffic', 'rotina')) fail('faltou rotina');
if (!findHubTab('paid_traffic', 'relatorio')) fail('faltou relatório');
if (!findHubTab('social_media', 'pending')) fail('faltou A publicar');
if (!findHubTab('rastreamento', 'integracoes')) fail('faltou integrações');
if (!findHubTab('settings', 'google-dados')) fail('faltou google dados');
if (!findHubTab('clients', 'resumo')) fail('faltou ficha do cliente');
if (!findHubTab('projects', 'kanban')) fail('faltou projetos');
if (!findHubTab('tasks', 'atrasadas')) fail('faltou tarefas atrasadas');
if (!findHubTab('reports', 'indicadores')) fail('faltou indicadores');
if (!findHubTab('onboarding', 'kanban')) fail('faltou onboarding');
if (!findHubTab('cobertura', 'mes')) fail('faltou cobertura');
if (!findHubTab('mini_crm', 'grade')) fail('faltou mini crm');

const projects = filterHubTabs({ modulo: 'projects' });
if (projects.length < 3) fail(`projetos deveria ter várias abas, veio ${projects.length}`);
const clients = filterHubTabs({ modulo: 'clients' });
if (clients.length < 6) fail(`clientes deveria ter a ficha, veio ${clients.length}`);

const colab = filterHubTabs({ papel: 'colaborador' });
if (!colab.some((t) => t.aba === 'hoje')) fail('colaborador deveria ver Hoje');
if (!colab.some((t) => t.aba === 'relatorio')) fail('colaborador deveria ver Relatório');
if (colab.some((t) => t.modulo === 'settings' && t.aba === 'google-ads')) {
  fail('colaborador não deveria ver Google Ads da agência');
}
if (colab.some((t) => t.modulo === 'settings' && t.aba === 'google-dados')) {
  fail('colaborador não deveria ver Google dados da agência');
}

console.log(`OK ${HUB_TABS.length} abas catalogadas`);
