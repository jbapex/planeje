# Preparação local

Use Node 20 compatível e npm 10, preservando lockfiles. Os pacotes são separados:

```sh
npm ci
npm --prefix planeje-mcp ci
npm run check
```

Credenciais ficam fora do Git/docs. Siga [operação](continuidade-planeje/05-AMBIENTE-E-OPERACAO.md)
para configuração autorizada; não copie `.env`, dados ou credenciais produtivos
para testar UI. `npm run dev` usa a porta 3003 e tem fallback de serviços
produtivos: use fixture e bloqueio de rede externa para comprovar o setup.

A fixture atual `scripts/atlas-events-preview/vite.config.mjs` substitui API/autenticação;
confira seus aliases e escolha uma porta livre. Encerre só o processo criado:

```sh
node node_modules/vite/bin/vite.js --config scripts/atlas-events-preview/vite.config.mjs --host 127.0.0.1 --port 4337 --strictPort
```

`npm run build:check` limpa somente sua saída temporária. O build operacional
original também altera ZIPs em `public/downloads` e `dist`. Publicação exige
escopo próprio e guardas/fontes/perfil/flags da continuidade.

Codex lê `AGENTS.md`; skills ficam em `.agents/skills`. Context7 reutiliza a
conexão global; `.codex/config.toml.example` é referência opcional para uma
máquina sem conexão equivalente. Uma nova skill poderá ser descoberta no próximo turno;
confira antes de declarar execução. Trust/OAuth/reinício podem ser necessários
para MCP/plugins. Preserve cliente, modelo principal, provedor e autenticação.

[Setup](setup.md) registra versões, fontes, evidências e manutenção;
[qualidade](quality.md) registra cobertura e comandos. Retomada verifica
checkout/ambiente antes de confiar em relatos anteriores.
