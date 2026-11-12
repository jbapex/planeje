import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/components/atendimento-loja/IaAgentesTab.jsx'), 'utf8');
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/components/atendimento-loja/AtendimentoLoja.css'), 'utf8');

const steps = ['Perfil', 'Comportamento', 'Conhecimento', 'Habilidades', 'Fluxo', 'Conversa e ativação'];
for (const label of steps) {
  if (!src.includes(`'${label}'`)) throw new Error(`Falta a etapa ${label} no designer`);
}
if (src.includes('ABAS_AGENTE')) throw new Error('Designer ainda usa abas do modal antigo');
if (/<EditModal[\s\S]{0,500}Novo agente de IA/.test(src)) throw new Error('Agente ainda abre em modal 40rem');
if (!src.includes('atl-designer')) throw new Error('Falta o overlay atl-designer');
if (!css.includes('.atl-designer {')) throw new Error('Falta o CSS do designer');
if (!css.includes('.atl-choice.is-on')) throw new Error('Falta o card escolhido');
if (!src.includes('Receber uma nova mensagem')) throw new Error('Falta a ativação Receber uma nova mensagem');
if (!src.includes('Nova etapa')) throw new Error('Falta Nova etapa no Fluxo');

console.log('atendimentoIaDesigner: ok');
