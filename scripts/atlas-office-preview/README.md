# Atlas — escritório da agência (prévia local)

Prova de apresentação aprovada como direção por Josias em 15/10/2026, após a análise do Habblaud. Josias conferiu e aprovou a primeira apresentação em 15/10 (“conferi gostei”), pedindo a aplicação da identidade visual do Planeje. Essa revisão de marca ainda aguarda nova avaliação.

Três salas (Tráfego, Design e Edição), seis agentes simulados associados a seis pessoas fictícias e nove tarefas fictícias. Clicar na pessoa ou no personagem mostra sua fila. Clicar numa sala restringe o acompanhamento. “Todas as tarefas” reúne o cenário inteiro.

“Simular material aprovado” conclui o criativo EX-03 da Bia e libera a campanha EX-01 da Ana, mantendo os responsáveis. “Recomeçar exemplo” restaura o cenário. Os dados ficam apenas na memória da página e são descartados ao recarregar. As propostas são textos determinísticos para demonstrar a experiência, sem chamada a modelo de IA.

## Executar

Usa o Vite 4.5.14 já instalado no workspace; não modifica o package.json/lockfile principal. Na raiz do workspace:

```sh
node node_modules/vite/bin/vite.js build --config scripts/atlas-office-preview/vite.config.mjs
node node_modules/vite/bin/vite.js preview --config scripts/atlas-office-preview/vite.config.mjs
```

Abrir `http://127.0.0.1:4330/`. O servidor escuta somente o loopback. A saída está em `.local/atlas-office-preview/dist` e pode ser regenerada.

## Limites e origem

- Só o renderer de pixel art do [Habblaud](https://github.com/marmottajr/habblaud) 0.11.0, commit `4ccce2537472fe5a8d432f06974494d2e778ff15`, foi reaproveitado; ver `UPSTREAM.json` e `vendor/habblaud/LICENSE`.
- Os arquivos TypeScript copiados não foram alterados; testes e art preview não foram copiados. O manifesto de assets substitui a marca original pela placa Planeje na recepção; cópias dos assets oficiais e da licença foram acrescentadas à prévia.
- Sem servidor original, mods, hooks, terminais, leitores de sessões, conexão ao Planeje ou credenciais. A única chamada fetch do renderer é para o manifesto local de arte.
- O adapter local entrega snapshots fictícios ao contrato de apresentação `snapshot` / `on('snapshot')`. O monitor Atlas de produção não é consultado nem ativado.
- Os nomes de agentes, pessoas, clientes, tarefas, prazos e propostas são exemplos. As animações e estados dos personagens não comprovam atividade humana ou execução de IA.
- O motor social original pode guardar seus próprios dados de ambientação no localStorage da origem local. O cenário de tarefas não usa persistência.
- Criar ou organizar tarefas reais depende da integração futura com Tarefas, permissões, regras ainda a definir e validação em teste. Não existe segundo motor operacional nesta prévia.

## Conferência

Build estático e navegação interativa no navegador do Codex. Conferir: pessoa → fila; sala → pessoas; nove tarefas na visão geral; proposta; aprovação → desbloqueio nas duas filas; reinício; celular sem rolagem lateral; console sem erro. A evidência da sessão está na documentação de continuidade.

## Identidade visual — 15/10/2026

`brand.css` usa os valores de `src/styles/planeje-brand.css` e `src/index.css`: terracota #c94a2e, roxo #9333ea/#7c3aed, superfícies claras, menu interno escuro e a mesma família Inter com fallback de sistema. Logo horizontal, símbolo e favicon são cópias exatas de `public/brand`; usados no cabeçalho responsivo, painel Atlas e placa da recepção. Planta, dados, responsáveis, interações e renderer upstream preservados.
