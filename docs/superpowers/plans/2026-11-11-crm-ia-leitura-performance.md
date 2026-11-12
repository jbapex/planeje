# CRM IA — plano de correção da leitura

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans na coordenação; delegar somente o teste isolado conforme workflow autorizado.

**Goal:** Remover checks de canal repetidos por mensagem, preservando a leitura e as permissões existentes.

**Architecture:** Substituir a função privada no mesmo OID por uma versão que materializa os canais autorizados usando o helper atual. Sem alteração de API, frontend, runtime, dados ou grants.

**Tech Stack:** PostgreSQL17.6 produtivo, PostgreSQL16.15 em fixtures Unix isoladas, Node20/24 e comandos existentes.

**Spec:** `docs/superpowers/specs/2026-11-11-crm-ia-leitura-performance-design.md`.

## Global Constraints

- Quinze migrations aplicadas intactas; nova somente `20261111162400_crm_ia_conversation_read_performance.sql`.
- Não alterar timeout, grants, identidade, módulos, assinatura, função pública ou ordem de latest/período.
- Sem credenciais, dados reais, rede externa ou transportes nas fixtures.
- Comparação contra05b publicada e manifesto vigente; sem usar HEAD antigo como base.

## Review Focus

- Canais negados/arquivados/sem identidade nunca entram na lista materializada.
- A mesma permissão vale nas duas fontes, e grupos/privacidade de contato continuam filtrados.
- Duplicidades e empates não alteram total, vínculo comercial ou última mensagem.
- Revogação entre consultas elimina a leitura seguinte.
- OID e ACL permanecem iguais; a função não fica executável diretamente por authenticated/anon.

## Execução

- [x] Reproduzir timeout, consultar versão/índices/timeout por metadados e provar a hipótese em fixture sem dados reais.
- [x] Teste permanente com helpers privados reais, JSON pré/pós, custo limitado por canal, atributos e casos de fronteira; observar RED com migration vazia antes de implementar.
- [x] Aplicar somente o delta CTE/JOIN na função; atualizar loaders afetados para exercitar a versão nova e executar regressões pertinentes.
- [x] Congelar hashes e revisar SQL/testes de forma independente contra05b; revisão final sem achados pendentes.
- [x] Preparar publicação SQL isolada com guards de fonte, função, perfil e serviços; aplicada uma vez às14h01 BRT, atributos/grants preservados.
- [x] Revalidar Painel/Conversas na sessão autorizada e salvar evidência; continuidade registra também a pendência de propagação de período, sem declarar a meta integral concluída.
