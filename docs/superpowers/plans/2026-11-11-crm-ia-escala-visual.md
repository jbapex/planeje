# CRM IA — plano de escala visual

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este refinamento na sessão atual.

**Goal:** Reduzir o espaço ocupado pela navegação e aproximar a densidade do CRM IA da referência observada.

**Architecture:** Reusar tokens da marca e a lateral compartilhada do Squad. Integrar o seletor existente ao título da página do CRM, mantendo um cabeçalho persistente durante carga, erro e troca de conta. Sem mudança de dados ou transporte.

**Tech Stack:** React 18, CSS existente, Vite 4, Node e renderer de testes já instalado para QA.

**Spec:** `docs/superpowers/specs/2026-11-11-crm-ia-escala-visual-design.md`.

## Global Constraints

- Lateral expandida 248 px e recolhida 64 px; nenhuma aplicação de `zoom` ou transformação de escala.
- Preservar trabalho local e a base produtiva com o espaçamento do Gestor já publicado.
- Preservar fontes legíveis, foco, teclado, títulos, seletores e alvos de toque.
- Dados sintéticos e rede externa negada na validação visual; publicação já autorizada, condicionada às verificações.

## Review Focus

- Carregamento/erro deixam a conta selecionável e não mostram uma conta antiga como atual.
- A lateral recolhida preserva nomes acessíveis e não estoura sua largura.
- O cabeçalho acomoda nomes de conta longos e quebra de linha no celular.
- Preferências existentes de expansão/recolhimento continuam funcionando.
- A nova sobreposição CSS preserva o espaçamento concorrente do Rastreamento.

## Execução

- [x] Preservar hashes e cópias dos arquivos-base; observar a geometria da referência e do Planeje.
- [x] Acrescentar ao renderer existente um teste de seletor de conta no cabeçalho e observar a falha.
- [x] Ajustar `src/styles/planeje-brand.css`, `GestorIa.css`, `AtlasConversation.css`, `CrmIa.css`, `CrmIaWorkspace.jsx` e `CrmIaContent.jsx`; nenhuma mudança de autorização ou payload de dados.
- [x] Executar renderer, lint e build; conferir desktop, notebook1280×800,600/320/390px, expansão, teclado e troca de conta. Check completo e109 testes UI finais passaram.
- [x] Revisar diff exato contra a base publicada; revisão independente sem achados pendentes e hashes finais preservados na candidata05b, sem apagar a tentativa05.
- [x] Publicar05b às13h09 BRT e conferir a interface real. O timeout encontrado no Painel foi corrigido em publicação SQL isolada às14h01; Painel/Conversas, lateral248/64px e ausência de transbordamento foram reconferidos. A matriz integral e o aceite humano permanecem separados.
