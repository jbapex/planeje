# Mini CRM: colunas manuais de follow-up — 31/10/2026

**Atualização 31/10, 20h53:** publicação autorizada e concluída. O relato local
abaixo permanece como histórico. [Operação, resultado e limites](mini-crm-follow-manual-producao-2026-10-31.md).

Correção local solicitada por Josias após o diagnóstico do Kanban. Não publicada;
não houve escrita em contatos/configurações reais, migração ou envio.

## Causa e contrato

`isFollowStatus` reconhecia qualquer chave ou rótulo contendo `follow`.
`followStatusKey` escolhia a primeira correspondência; `applyStatusChange`
chamava `ensureInicial`, que substituía o destino escolhido por essa primeira
coluna. Renomear uma coluna manual não alterava sua chave e mantinha a captura.

A cadência passa a pertencer exclusivamente à chave estável `Follow Up`, já
usada pelos presets e pelo motor de mensagens. Colunas criadas pelo usuário,
inclusive numeradas ou com o rótulo `Follow Up`, permanecem manuais. A ordem e o
nome de exibição não ativam a cadência. Renomear o status do sistema conserva
sua função, como ocorre com os demais status fixos.

O arraste e o seletor de status reutilizam `applyStatusChange`; nenhum segundo
fluxo foi criado. Sair da cadência para uma coluna manual encerra o retorno e
conserva seu histórico. Vendas, qualificação, RLS, automações por mensagens e
salvamento continuam nos caminhos existentes.

## Escopo e uso

Delta funcional somente em `src/lib/miniCrm.js`, nas funções `isFollowStatus`
e `followStatusKey`. Regressões em `scripts/miniCrm.test.mjs`.

Após publicação, a cadência própria usa os status de Configurar e a movimentação
normal dos cartões entre eles. Criar ou renomear uma coluna manual não programa
retornos do sistema. A cadência existente continua disponível nos clientes com
o status reservado e por ações explícitas de programação já existentes.

Retornos já gravados não são apagados pela leitura da tela. Contatos desviados
antes desta correção não são reposicionados automaticamente: o destino que a
pessoa pretendia escolher não pode ser reconstruído somente pelo status salvo.

## Verificação

- Teste novo falhou antes da correção: coluna manual renomeada abria cadência.
- `node scripts/miniCrm.test.mjs`: passou após a correção; seis etapas manuais,
  coluna renomeada, rótulo igual ao do sistema, ordem, chave reservada renomeada,
  encerramento/histórico, preservação de campos e ausência de mutação.
- `miniCrmOrigin.test.mjs`: 17 cenários; `miniCrmConfigCopy.test.mjs`: passou.
- `miniCrmMessageRules.test.mjs`: 52 casos; `miniCrmMessageWebhooks.test.mjs`: 59 casos.
- `npm run check`: saída zero; contexto, quatro testes do harness, lint comum e
  tipado sem erros (com avisos do projeto), tipos, regras, 83 testes locais,
  duas suítes de tráfego, 107 testes MCP e build temporário passaram.
- `npm run verify:context` após os registros e `git diff --check`: passaram.

Revisão dirigida dos consumidores e diff contra a cópia anterior à tarefa.
Não houve teste de arraste com contatos reais nem alteração visual. Estado
anterior, patch restrito a esta tarefa e log de verificação em
`.local/mini-crm-follow-manual-20261031/`.
Publicação exige autorização específica e composição sobre as fontes/perfil da
release vigente, preservando os demais trabalhos locais.
