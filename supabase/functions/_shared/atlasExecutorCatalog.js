import { AtlasError } from './atlasCore.js';
import { EXECUTOR_CRM_CATALOG, readExecutorCrm, prepareExecutorCrm } from './atlasExecutorCrm.js';
import { EXECUTOR_SQUAD_CATALOG, readExecutorSquad, prepareExecutorSquad } from './atlasExecutorSquad.js';
import { EXECUTOR_MEMORY_CATALOG, readExecutorMemory, prepareExecutorMemory } from './atlasExecutorMemory.js';
import { EXECUTOR_CRM_DELIVERY_CATALOG, readExecutorCrmDelivery, prepareExecutorCrmDelivery } from './atlasExecutorCrmDelivery.js';
import { EXECUTOR_META_CAMPAIGN_CATALOG, readExecutorMetaCampaign, prepareExecutorMetaCampaign } from './atlasExecutorMetaCampaign.js';
import { EXECUTOR_AUTOMATION_CATALOG, readExecutorAutomation, prepareExecutorAutomation } from './atlasExecutorAutomation.js';
import { prepareExecutorMetaUpdate } from './atlasExecutorExternal.js';

const manualExample = JSON.stringify({ recipe: 'squad_manual', config: { version: 1, recipe: 'squad_manual', name: 'Conferir CRM', steps: [
  { id: 'crm', type: 'read', app: 'crm', view: 'workspace', input: {} },
  { id: 'resumo', type: 'ai', instruction: 'Resuma a fonte sem inventar dados.', input_steps: ['crm'] },
  { id: 'resultado', type: 'result', source_step: 'resumo' },
] } });

export const EXECUTOR_CATALOG = Object.freeze([...EXECUTOR_CRM_CATALOG, ...EXECUTOR_CRM_DELIVERY_CATALOG, ...EXECUTOR_SQUAD_CATALOG, ...EXECUTOR_MEMORY_CATALOG, ...EXECUTOR_META_CAMPAIGN_CATALOG, ...EXECUTOR_AUTOMATION_CATALOG,
  { app: 'gestor', mode: 'write', name: 'update_meta', title: 'Alterar status ou verba na Meta', fields: ['account_id', 'object_id', 'level', 'status', 'daily_budget', 'lifetime_budget'], required: ['account_id', 'object_id', 'level'],
    description: 'Revisar ACTIVE/PAUSED em campaign/adset/ad ou orçamento do adset; conta act_ explícita vinculada e objeto exato. Valores de verba usam unidades menores da moeda, conforme fonte oficial; não converter sem conferir moeda. Preparação lê estado real. Aprovação revalida acesso/fotografia, grava uma reserva, faz um único POST e confere por GET. Incerteza nunca autoriza repetição automática.' },
].filter(operation => !['gestor:memory', 'cs:group_requests', 'cs:group_activity'].includes(`${operation.app}:${operation.name}`)).map(operation => Object.freeze(operation.app === 'atlas' && operation.name === 'save_automation'
  ? { ...operation, description: `${operation.description} Exemplo válido: ${manualExample}` } : operation)));
const deliveryReads = new Set(EXECUTOR_CRM_DELIVERY_CATALOG.filter(operation => operation.mode === 'read').map(operation => operation.name));
const operations = new Map(EXECUTOR_CATALOG.map(operation => [`${operation.app}:${operation.mode}:${operation.name}`, operation]));

export function executorOperation(app, mode, name) {
  const operation = operations.get(`${app}:${mode}:${name}`);
  if (!operation) throw new AtlasError('TOOL_DENIED', 'Esta operação não está disponível no catálogo do executor.', 403);
  return operation;
}

export async function readExecutorApp(caller, scope, integrations = {}) {
  executorOperation(scope.app, 'read', scope.view);
  if (['automations', 'automation'].includes(scope.view)) return readExecutorAutomation(caller, scope);
  if (scope.app === 'atlas') return readExecutorMemory(caller, scope);
  if (scope.app === 'crm' && deliveryReads.has(scope.view)) return readExecutorCrmDelivery(caller, scope);
  if (scope.app === 'gestor' && scope.view === 'meta_creation_assets') return readExecutorMetaCampaign(caller, scope, integrations);
  return scope.app === 'crm' ? readExecutorCrm(caller, scope) : readExecutorSquad(caller, scope);
}

export async function prepareExecutorAction(caller, scope, integrations = {}) {
  executorOperation(scope.app, 'write', scope.action);
  if (['save_automation', 'activate_automation', 'pause_automation'].includes(scope.action)) return prepareExecutorAutomation(caller, scope);
  if (scope.app === 'atlas') return prepareExecutorMemory(caller, scope);
  if (scope.app === 'crm' && scope.action === 'send_message') return prepareExecutorCrmDelivery(caller, scope);
  if (scope.app === 'gestor' && scope.action === 'create_meta_campaign') return prepareExecutorMetaCampaign(caller, scope, integrations);
  if (scope.app === 'gestor' && scope.action === 'update_meta') return prepareExecutorMetaUpdate(caller, { ...integrations, ...scope });
  return scope.app === 'crm' ? prepareExecutorCrm(caller, scope) : prepareExecutorSquad(caller, scope);
}
