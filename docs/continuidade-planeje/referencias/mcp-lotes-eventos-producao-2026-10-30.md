# MCP: lotes e eventos Chatvolt publicados — 30/10/2026

Autorização de Josias: “pode sim”. **Versão 2.9.2 publicada e verificada às 15h32 de São Paulo**, sobre a 2.9.1. Release privada `/root/planeje-releases/mcp-lotes-20261030-01`. [Contrato local e diagnóstico](mcp-lotes-eventos-local-2026-10-30.md).

## Comportamento publicado

Leituras do índice temporal e das evidências recuperam UUIDs em sublotes de25, com continuação por data/ID quando a origem impõe cap menor. O GPT pode solicitar até500 por página sem construir uma URI gigante. Não há teto total, corte de texto ou sucesso parcial se um sublote falhar.

No contexto comprovado AGENT_USER_MESSAGE com IA desligada, `#ai-disabled` é controle e não fala da equipe. A entrada e seus anexos são preservados; áudio é reconhecido pelo MIME mesmo quando o registro original tem `type=text`. Textos que apenas citam o marcador permanecem. Registros originais não são regravados.

O contexto Chatvolt expõe evento, estado da IA, agente e responsável atribuído. Responsável não comprova autoria de cada envio. Automação é identificada no evento de resposta padrão com IA habilitada; inconsistências de autoria e contextos divergentes continuam explícitos. Anexos de um evento combinado sem fala de origem comprovada ficam como não atribuídos, respeitando expurgo.

## Publicação e verificação

Sete arquivos seletivos promovidos: dois módulos do leitor, identificação de versão, dois testes e dois arquivos de metadados npm. Dependências instaladas e versões das dependências preservadas. Apenas `planeje-mcp` reiniciado. Sem SQL, backfill, mudança de webhook/Edge, frontend, ambiente, serviços Atlas, dados, envio ou nova transcrição.

A conferência final encontrou uma substituição indevida de versão de `tslib` no lockfile durante o bump do aplicativo. O metadado foi corrigido a partir do backup, sem instalação ou mudança no runtime. Comparação semântica confirmou que package/lock diferem da base apenas na versão do aplicativo; hashes e health foram reconferidos. [Registro da correção](../evidencias/releases/mcp-lotes-eventos-2026-10-30/lock-metadata-repair.json).

107 testes MCP passaram na candidata VPS, incluindo50mil mensagens, páginas120/500 com URI curta, cap menor da origem, falha intermediária, controle, metadados e conflito de autoria. Typecheck e lint dirigido sem erros; avisos tipados preexistentes preservados.

Após a publicação, transporte Supabase somenteGET conferiu as mesmas consultas reais:

| Página solicitada | Mensagens retornadas | Registros examinados | Tempo observado |
|---:|---:|---:|---:|
|30|20|30|741ms|
|60|35|60|931ms|
|120|75|120|988ms|
|500|336|500|3531ms|

Todas sem falha HTTP. Menos mensagens que registros examinados é esperado após filtrar eventos e conciliar evidências; seguir a continuação. São medições pontuais, não SLA.

Caso indicado pelo usuário: nove mensagens conciliadas, dois áudios recebidos, zero falsas respostas `#ai-disabled` da equipe; contexto/responsável nas nove. Evidências não guardam nomes, telefone, corpo de mensagens ou credenciais.

Health público2.9.2, requisição sem credencial retorna401, hashes de todos os sete arquivos conferidos. Runtime Edge, frontend, ambiente e cinco Atlas iguais ao snapshot anterior. Não houve smoke HTTP autenticado porque não existe chave administrativa configurada; validação da sessão OAuth no GPT continua humana.

[Publicação](../evidencias/releases/mcp-lotes-eventos-2026-10-30/published.json) · [Verificação e métricas](../evidencias/releases/mcp-lotes-eventos-2026-10-30/verification.json).

## Próximo uso e limites

Atualizar/reconectar o Planeje e reiniciar a pesquisa no GPT após o restart. Autoria humana sem prova, horários nunca enviados pelo webhook e transcrições inexistentes permanecem lacunas. Esta entrega não consulta a API autenticada do Chatvolt, não transcreve áudios novos e não conclui a auditoria/planilha do cliente. Outros consumidores dos eventos fora do MCP não foram alterados. Aceite humano de uso pendente.
