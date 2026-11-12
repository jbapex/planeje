# Planeje

Operação da agência: clientes, projetos, tarefas, atendimento, tráfego,
rastreamento, Mini CRM, financeiro e Atlas. Acesso por papel, módulo e vínculo.
Frontend React 18/JSX, Vite 4, Tailwind/Radix; serviços Supabase/PostgreSQL, Edge
Functions Deno, MCP Node/TypeScript e rotinas Python.

## Começar

Leia [onboarding](docs/onboarding.md): a inicialização normal pode apontar para
serviços produtivos. QA usa fixtures e destinos descartáveis. Existem dois
pacotes npm com lockfiles independentes.

```sh
npm ci
npm --prefix planeje-mcp ci
npm run check
```

`check` combina lint, lint assíncrono do MCP, tipos, autoavaliação das regras,
testes locais selecionados e build temporário. Cobertura e avisos legados em
[qualidade](docs/quality.md); não é a suíte de banco/API completa nem auditoria
de produção. `npm run dev` usa Vite na porta 3003. O `npm run build` original
também altera ZIPs e `dist`; para verificar compilação use `npm run build:check`.

## Mapa

| Caminho | Responsabilidade |
| --- | --- |
| `src/` | Interface, contextos, componentes e bibliotecas |
| `supabase/functions/` | Endpoints e módulos compartilhados |
| `supabase/migrations/` | Histórico SQL; não executar por presumir pendência |
| `planeje-mcp/` | Servidor MCP e testes próprios |
| `scripts/` | Testes, fixtures, ferramentas e rotinas; conferir efeitos |
| `extensao-whatsapp-planeje/`, `extensao-meet-planeje/` | Extensões do build operacional |
| `docs/continuidade-planeje/` | Decisões, ambientes, evidências e releases |
| `.agents/` | Skills locais e fontes fixadas |

[Produto](PRODUCT.md), [arquitetura](docs/architecture.md),
[interface](docs/design.md), [preparação](docs/onboarding.md),
[qualidade](docs/quality.md), [setup/manutenção](docs/setup.md),
[instruções](AGENTS.md), [continuidade](docs/continuidade-planeje/README.md).

Local, homologação, produção e aceite são estados distintos. Esta raiz contém
trabalho ausente de HEAD; preserve arquivos e confira a release vigente antes
de qualquer operação remota.
