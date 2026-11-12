# Gestor IA publicado em 09/11/2026

A release `gestor-ia-20261109-01` entrou na VPS às 16h37min47s em America/Sao_Paulo, por solicitação de Josias. Inclui métricas consolidadas, metas na ficha com projeção e desvio por campanha, histórico de Decisões, Memória com origem e versões, relatórios pelo histórico salvo e controles de PDF, números e avisos na Janela do cliente. Os controles de publicação no portal exigem a ação da equipe e as permissões do cliente. [Abrir Gestor IA](https://planeje.jbapex.com.br/#/gestor-ia/decisoes).

## Base e verificação

- Base anterior `gestor-ia-20261108-04/candidate`. A candidata herdou o perfil produtivo e conciliou 1.897 fontes, com sobreposição de 97 fontes do Gestor e das integrações necessárias. O CS IA continua em prévia separada.
- O HTML publicado tem SHA-256 `22c7d1895f6afa13d4ea0ed9b6a04142e28ff830859ea42f6acc44d7dd9c38eb` e referencia `index.420138fb.js` e `index.2530b700.css`. Foram conferidos os 15 artefatos novos, os artefatos anteriores e quatro URLs. O endereço temporário da candidata foi retirado.
- Os 243 testes locais, 116 testes da candidata, lint das 62 fontes JSX/JS selecionadas e as três verificações em PostgreSQL descartável passaram. No navegador autenticado, foram conferidos Carteira, Metas, Decisões, Memória e Relatórios na candidata e o bundle novo na página principal. A conferência abriu e cancelou um rascunho de meta.
- As 18 migrações do Gestor de 09/11 entraram juntas em uma transação pelo papel de migração do ambiente. A primeira tentativa com o papel padrão foi revertida. Antes do commit, foram conferidos RLS, acesso anônimo, acesso direto às tabelas privadas e o bucket privado de PDFs. A migração `20261108141450` do cache foi preservada. As duas funções do Gestor passaram na verificação HTTP de acesso sem sessão.

## Limites e recuperação

Decisões generativas e Agenda permanecem desativadas na produção. A resposta real do piloto e o worker da Agenda ainda precisam de validação. O resumo de relatório do Atlas usa a redação já disponível. A seleção da Memória vinculada às contas e às datas efetivas do PDF segue pendente.

O manifesto, os recibos `published.json`, `verification.json` e `migration.json`, o esquema anterior e os backups do HTML, das fontes e das funções ficam na pasta privada `/root/planeje-releases/gestor-ia-20261109-01`. Antes de recuperar, conferir a release e os hashes vigentes. Restaurar somente arquivos desta troca e preservar as migrações e os artefatos compartilhados já instalados.
