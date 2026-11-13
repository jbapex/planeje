# Gestor IA — atribuição publicada na VPS

Publicado em **13/11/2026, 01h38 de Brasília**, release `gestor-atribuicao-20261113-01`. Josias autorizou nesta conversa: “vamos publicar então na VPS”, depois da prévia 4395. A autorização vale para esta entrega; o aceite de uso continua separado.

[Abrir a rotina publicada](https://planeje.jbapex.com.br/?v=3526f86b#/gestor-ia/rotina?semana=2026-11-09). [Contrato, arquivos e testes locais](gestor-ia-atribuicao-2026-11-12.md). [Evidência de produção e hashes](../evidencias/releases/gestor-ia-atribuicao-producao-2026-11-13.json).

## Escopo publicado

A candidata herdou as 2.270 fontes da release produtiva `crm-ia-agenda-fuso-20261112-01`. Dezessete sobreposições de fontes, uma do MCP e seis arquivos do runtime resultaram em 2.272 fontes gerenciadas. Agenda, Squad, perfil produtivo, três flags false, configurações e cinco serviços Atlas foram preservados. Não houve checkout/reset de `/root/planeje`, instalação de dependências, mudança de autenticação ou ativação de autonomia.

A fonte Meta da VPS já tinha uma correção de autorização ausente na base Git desta branch. Ela foi preservada, incluindo o dispatch autorizado de `update-adset` e as outras 35 actions. `metaWriteAuthorization.js` foi recuperado para o Git pelo hash produtivo; esse helper já existia na VPS e não entrou no overlay. O runtime Meta recebeu somente o patch revisado de enriquecimento. Uazapi e redirect foram compilados a partir das fontes atuais da VPS, sem recompilar o restante do runtime a partir da branch antiga.

HTML e assets novos: `assets/index.3526f86b.js` e `assets/index.33321bbc.css`. Todos os 1.445 assets anteriores continuam disponíveis. Somente Edge e MCP foram reiniciados; main, saved-v4, workers, cron e Atlas foram conferidos sem alteração.

## Migração e retomada protegida

`supabase/migrations/20261112145805_gestor_ia_atribuicao.sql` foi aplicada **uma vez**. A transação conferiu catálogo, corpos canônicos, OIDs, atributos, grants/RLS e conteúdo das oito tabelas preservadas. Alteração concorrente, timeout ou divergência provocam rollback. O ledger de etapas e os novos campos não reescreveram contatos, revisões ou tarefas.

Depois do commit SQL, a guarda do publisher interrompeu a troca do site porque dois arquivos de teste da candidata divergiam do manifesto gerenciado. Nesse ponto, HTML, fontes produtivas, runtime e MCP ainda estavam intactos. Os testes aprovados foram arquivados com hashes em `qa-inputs`; apenas esses dois arquivos da candidata voltaram aos bytes produtivos anteriores. A retomada revisada exigiu o catálogo do receipt aplicado, fontes/serviços ainda na baseline, quatro locks e um marcador sem repetição. Ela reutilizou o publisher auditado e **não executou DDL novamente**. Receipts e scripts operacionais permanecem no diretório privado `/root/planeje-releases/gestor-atribuicao-20261113-01`.

## Impacto Noivas: resultado real

Coorte por primeira entrada de 09 a 15/11 em `America/Sao_Paulo`. Os dados cresceram desde a investigação inicial; não foram ajustados para reproduzir a expectativa antiga de 70 entradas e 20 agendamentos.

| Medida | Antes da aplicação | Depois |
| --- | ---: | ---: |
| Entradas consultadas na semana | 82 | 82 |
| Contatos com IDs de campanha e conjunto salvos | 0 | 17 |
| Pares de nomes com correspondência única nas nove linhas | 16 | 16 |
| Agendados pela marcação ocorrida na semana | 22 | 22 |
| Agendados novos / antigos | 15 / 7 | 15 / 7 |

O backfill limitado a esse cliente e essa coorte atualizou 17 contatos com CAS de `updated_at`, preservando os demais campos. Dry-run atual e aplicação fizeram oito GETs Graph cada, sem mutação de campanha. Não houve falha, conflito, corrida, conta desvinculada, limite ou truncamento. A conferência posterior encontrou 17 completos; repetir o dry-run fez zero gravações, zero consultas Graph e zero leitura da credencial Meta.

O modelo publicado e as duas RPCs concordaram: 16 leads nas nove linhas selecionadas, 65 sem vínculo utilizável nessa seleção e um com origem Meta confirmada fora dessas linhas. Nenhum contato foi apagado. No modo de marcação semanal aparecem os 22 agendados, sendo quatro atribuídos às linhas e 18 separados. O CPA das linhas usa somente os três novos agendados atribuídos e o gasto informado: R$ 650,34. A revisão permaneceu na versão 2, sem preenchimento ou validação pela operação de publicação.

## Links e limites

Em **Gestor IA → Rastreamento → Links**, o formulário existente oferece campanha e conjunto opcionais. A configuração salva é congelada no clique/mensagem; editar o link depois não muda a origem histórica. Linktree configurado como Meta permanece Meta, respeitando evidência Google/CTWA. Links existentes não receberam IDs inventados nem foram editados automaticamente. Nenhum clique ou envio de WhatsApp foi gerado para testar produção.

A aba do navegador abriu a versão publicada, mas estava sem sessão. Campos e fluxos tiveram testes locais; sessão autenticada real, acesso de colaborador nesta publicação, Neuro externo, carga de toda a carteira e celular real não estão certificados. O cotejo UI=MCP deste relatório compara as RPCs com o mesmo modelo, sem simular uma chamada HTTP autenticada ao processo MCP. Marcações manuais anteriores ao ledger não são recuperáveis sem evidência. A tentativa de consultar o catálogo pelo conector Planeje pediu reautenticação; reconectar a conta é necessário para conferir o Neuro externo. Nenhuma conta alternativa ou autenticação diferente foi usada.

## Verificações

- VPS: 144 testes Node, 115 MCP, tipagem e build passaram; 44 verificações HTTPS e seis OPTIONS antes/depois passaram.
- SQL: 23 grupos de contratos e seis testes adversariais locais, incluindo reabertura humana, permissões e rollback.
- Operação: nove testes do publisher e oito da retomada; revisão sem achados abertos.
- Edge: sete verificações AST/fixtures dos bundles de Links, cinco da reconciliação da fonte Meta e oito do patch do runtime.
- Backfill: 11 testes do transporte e nove do runner; verificador de agregados com oito fixtures e quatro casos de CLI.

Branch `feat/gestor-ia-atribuicao`; implementação original em `a6804ac`. A reconciliação de segurança e este registro acompanham a publicação no GitHub. A rotina antiga e o Rastreamento mantêm os registros e as regras de acesso existentes.
