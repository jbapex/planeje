# Menu por categorias — publicação na VPS

## Estado e autorização

Publicado em **11/11/2026, 23h43 BRT**, na release
`menu-categorias-20261111-01/candidate`. Josias autorizou explicitamente
“publicar vps” depois de aprovar a organização do menu e pedir o refinamento
dos indicadores. A publicação cobre essas alterações e preserva Gestor IA,
CS IA e CRM IA no rodapé, como seu Squad.

Conferência técnica e visual autenticada no computador concluídas. Aceite de
uso de Josias permanece distinto; o celular foi validado com fixtures, sem
certificar uma sessão móvel real nesta publicação.

## Composição e concorrência

Base efetiva: `crm-ia-cabecalho-20261111-01`, sucessora da atualização do
Gestor IA. As seis fontes produtivas correspondiam byte a byte à baseline da
tarefa. As nove dependências compartilhadas examinadas, incluindo Accordion,
Dialog, avatares e helpers de acesso, também coincidiam com as fontes usadas
nos testes locais.

Sobreposições: `Sidebar.jsx`, `BottomNav.jsx`, `teamNav.js`, `teamNavAccess.js`,
`planeje-brand.css` e `teamNav.test.mjs`. Manifesto final com **2.144 fontes**,
sem adicionar dependência, alterar rotas ou regras de acesso. A candidata
herdou o perfil `.env.production.local` na própria VPS e as três flags
`VITE_GESTOR_IA_{DECISIONS,AGENDA,AGENDA_AI}_ENABLED=false` do builder anterior.
Nenhum conteúdo de ambiente foi copiado para o pacote ou a documentação.

O publicador reutilizou a biblioteca de promoção já conferida, com guardas
de hashes e locks global, CRM e Gestor em cada fase. Fontes, HTML, assets,
perfil e estados dos serviços foram conferidos antes da promoção. Assets
com hash foram disponibilizados antes da troca atômica do HTML; os anteriores
continuam disponíveis. Backups e journal privados impedem repetição automática
de uma tentativa iniciada e preservam alterações externas na recuperação.

## Evidência

- Seis testes das guardas do publicador passaram localmente e na VPS. Pacote restrito, hashes, flags, links, duplicação e caminhos inválidos foram exercitados.
- Na candidata, os dois testes Node de navegação/módulos passaram com Node 20.19.1; o Vite compilou em 47,92 s, gerando 26 artefatos com o perfil herdado.
- Revisão diferencial independente, incluindo publicador, biblioteca, pacote, consumidores e seis diffs, terminou sem achados acionáveis. Aprovação vinculada aos hashes do escopo, programa e relatório privado.
- Promoção e verificação terminaram com saída zero, com asserts habilitados. **39 verificações HTTPS** conferiram status 200 e SHA256 da raiz, Escritório Atlas e união dos assets novos e anteriores.
- Perfil, unidades, inícios de serviços, configuração Edge e hashes do runtime permaneceram iguais à baseline. Não houve migração, reinício ou alteração de permissões.
- A sessão autenticada abriu a versão nova. Foram observados três atalhos, cinco categorias, quatro destinos de Operação e os três acessos do Squad no rodapé. A captura foi restrita ao menu, sem conteúdo de clientes.

Entrada publicada: `index.639996bb.js`; CSS global: `index.2df522b9.css`.
HTML SHA256: `e8145ffc95cbe8662959eccc13c5297715118744db06aca622198ccba88127b9`.

Recibos, logs, escopo e revisão ficam em
`.local/menu-publicacao-20261111-01` e
`/root/planeje-releases/menu-categorias-20261111-01`. A captura autenticada é
`menu-producao.png`; o registro estruturado é `ui-verification.json`.
Não repetir `prepare` ou `publish`. A próxima publicação deve partir desta
base ou de uma sucessora conferida, com perfil, flags e fontes atuais.

[Implementação e refinamento locais](menu-categorias-local-2026-11-11.md) ·
[Interface](../../design.md) · [Qualidade](../../quality.md).
