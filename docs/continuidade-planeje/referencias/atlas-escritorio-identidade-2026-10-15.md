# Atlas escritório — identidade visual do Planeje

15/10/2026. **Revisão local, com dados fictícios; não publicada.**

Josias conferiu a primeira prévia e informou: “conferi gostei, só precisa da nossa identidade visual”. Isso confirma o aceite da apresentação inicial com ajuste solicitado de marca. O aceite desta revisão permanece pendente; não é autorização de integração operacional ou publicação.

## Alteração

No mesmo endereço <http://127.0.0.1:4330/>, a prévia agora usa o logo horizontal, símbolo e favicon oficiais do Planeje, copiados sem alteração de `public/brand`. O cabeçalho mostra Planeje + Atlas; no celular usa o símbolo compacto. O painel do Atlas também traz o símbolo, e o manifesto local de arte apresenta o logo na placa da recepção.

`scripts/atlas-office-preview/brand.css` aplica os valores existentes em `src/styles/planeje-brand.css` e `src/index.css`: terracota `#c94a2e`, roxo `#9333ea`/`#7c3aed`, fundos claros, menu interno escuro, superfícies e cantos arredondados, família Inter com fallback de sistema. As cores das áreas e das etiquetas foram alinhadas a essa paleta. Não há nova fonte remota ou dependência.

Planta, sementes de decoração, pessoas, tarefas, responsáveis e interações da primeira prévia preservados. Os 86 arquivos TypeScript upstream seguem sem modificação. A personalização usa CSS próprio, assets oficiais e a capacidade existente de placa do renderer; proveniência registrada em `UPSTREAM.json`.

## Conferência e limites

Build Vite concluído, 73 módulos: `index-decaabc2.js` / `index-bf0de7a9.css`. No navegador, nove tarefas listadas, seleção da Bia e aprovação simulada continuaram funcionando. Imagens carregadas, terracota do botão conferido como `rgb(201, 74, 46)`, cabeçalho compacto e painel no celular, sem rolagem horizontal em 390×844 e 1440×900. Consultas de console sem erro. Capturas desta revisão em [computador](../evidencias/atlas-escritorio-identidade-notebook-2026-10-15.jpg) e [celular](../evidencias/atlas-escritorio-identidade-celular-2026-10-15.jpg).

Permanece uma prévia isolada com dados e agentes simulados. Nenhuma VPS, código operacional, banco, tarefa real, envio externo ou monitor Atlas foi alterado. Integração de leitura, regras de escrita e eventual publicação continuam pendentes, conforme [escopo anterior](atlas-escritorio-previa-2026-10-15.md).

[Evidência](../evidencias/atlas-escritorio-identidade-2026-10-15.json) · [Release](../evidencias/releases/atlas-escritorio-identidade-2026-10-15.json).
