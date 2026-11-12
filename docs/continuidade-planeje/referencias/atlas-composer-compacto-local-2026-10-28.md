**Atualização: publicado em 28/10,21h54.** [Operação e evidência produtiva](atlas-composer-compacto-producao-2026-10-28.md). O registro abaixo preserva a validação local anterior.

# Atlas — campo de conversa compacto

**Implementado e verificado localmente. Não publicado na VPS.**

Pedido: reunir imagem, áudio e envio dentro do próprio campo, reduzindo o espaço ocupado pelos botões grandes. O ajuste usa os componentes existentes, sem mudar regras de envio, fila, orçamento, dados ou transcrição.

O campo tem borda única, texto acima, imagem/tarefa à esquerda e microfone/enviar à direita. O lembrete de30min permanece abaixo, discreto. Enter envia; Shift+Enter quebra linha. Ícones têm nome acessível, foco e descrição. Gravação mantém cronômetro, parar/cancelar e erro/repetição visíveis.

`AtlasDictationButton` e `AtlasChatContext` receberam apresentação `compact` opcional; demais consumidores mantêm a apresentação anterior. Cinco fontes alteradas: `AtlasTeamAssistant.jsx/.css`, `AtlasDictationButton.jsx/.css` e `AtlasChatContext.jsx`. Sem dependência nova ou backend.

![Campo compacto em fixture isolada](../evidencias/atlas-composer-compacto-2026-10-28/campo.png)

## Verificação

- Build temporário passou; ESLint sem erros, com os mesmos oito avisos anteriores de dependências de hooks.
- Oito testes existentes de imagens/ditado e17checksUI de teclado, ACK/retry, rascunho, anexos privados e escolha da tarefa passaram.
- Conferidos1280/390/320px: campo101px e compositor151px no estado normal; botões36×36 sem overflow. Gravar, parar, falha de transcrição e cancelar preservam o rascunho. O erro pode expandir o campo para ficar legível.
- Microfone, áudio, transcrição e fontes de teste fictícios; rede externa bloqueada. Sem captura real, IA, chamada à equipe ou teste em produção.

[Evidência com hashes e medidas](../evidencias/atlas-composer-compacto-2026-10-28/checks.json) · [Chat390px](../evidencias/atlas-composer-compacto-2026-10-28/chat-390.png).

## Publicação

Este pedido autoriza o ajuste local. A autorização anterior era específica para o gerente integrado já publicado; não promove automaticamente esta apresentação nova. Se solicitada a publicação, herdar a release/perfil vigentes e aplicar somente o delta visual revisado, com QA/build da candidata. Não aplicar migrações, reiniciar workers ou promover o dist da raiz para esta mudança.
