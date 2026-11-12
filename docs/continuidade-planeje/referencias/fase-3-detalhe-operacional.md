> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Fase 3 — Detalhe operacional da tarefa

**Ambiente:** VPS de testes `2.25.216.103`  
**Data:** 14/09/2026  
**Produção:** não alterada

## Objetivo

Deixar a tarefa mais rápida de entender e operar, mantendo o fluxo, as automações e os dados que já funcionam.

## O que foi entregue

- Resumo operacional acima do formulário: etapa, prazo, responsáveis e canais.
- Cinco áreas claras: `Tarefa`, `Publicações`, `Anexos`, `Comentários` e `Histórico`.
- Publicações por canal retiradas do meio do formulário.
- Quantidade de canais e anexos mostrada nas respectivas abas.
- Navegação adaptada para telas estreitas por rolagem horizontal.
- Ajuda do resumo dentro do ícone `?`.
- Compatibilidade com tarefas antigas, com ou sem canais.
- Campo de data com digitação e botão próprio para abrir o calendário.
- Calendário disponível tanto em `Data da postagem` quanto em `Data publicada`.

## O que foi preservado

- Salvamento e validação de status.
- Automações de troca de responsáveis.
- Briefing, subtarefas, comentários, histórico e impulsionamento.
- Publicações e anexos já cadastrados.
- Valores antigos do campo Plataforma.

## Validação

- `npm run test:task-publications`: aprovado.
- `npm run build`: aprovado, 3.775 módulos.
- Bundle publicado: `assets/index.e62d2f4a.js`.
- Tarefa multicanal: `TESTE FLUIDEZ — Canais e anexos 14/09`.
- Troca rápida de status testada e revertida sem fechar a tarefa.
- Separação de anexos por canal conferida.
- Tarefa antiga sem canais aberta normalmente.
- Calendário de setembro de 2026 aberto pelo botão e exibido com o dia atual da publicação selecionado.
- 13 automações de tarefa, 5 automações de CRM, 2 regras de fluxo e 13 status permanecem cadastrados.

## Recuperação

Backup anterior à fase:

`/opt/planeje-staging/private/phase3-before-20260914T161917Z`

O diretório contém o dump do banco, o build anterior e as somas SHA-256.

## Arquivos centrais

- `src/components/tasks/TaskDetail.jsx`
- `src/components/tasks/details/TaskOperationalSummary.jsx`
- `src/components/tasks/details/TaskDetailsTab.jsx`
- `src/components/tasks/details/TaskAttachmentsTab.jsx`

## Próximo passo

Validar a Fase 3 com o usuário na VPS de testes. Depois iniciar a Fase 4, que tratará escopo mensal, fila, capacidade e SLA. A produção só será considerada após todas as fases e a validação geral.
