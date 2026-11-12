# Eventos Google — publicação em 28/10/2026

Publicado às **07h33 de São Paulo**, após Josias responder “pode” à publicação da nova interface. Publicação e verificação técnica concluídas; aceite humano de uso permanece pendente.

## Resultado

A lista Google usa o padrão visual da Meta, identifica contato/telefone quando o vínculo armazenado é válido, abre a ficha existente e agrupa as tentativas da mesma conversão. Resultado atual e contadores deixam de tratar reenvios como novas conversões; histórico conserva erros anteriores. Botões agem somente sobre a tentativa atual, com trava imediata e recarga vigente antes de liberar outra ação, incluindo refresh concorrente.

Histórico/totais correspondem ao período carregado, até 500 tentativas; exceder o teto produz aviso. Registros sem clique/evento/ação completos permanecem separados. IDs de contato divergentes ou sem registro acessível do mesmo cliente não autorizam inventar nome ou refazer vínculos. A sessão autenticada confirmou esses avisos em registros antigos, e uma consulta agregada somente leitura, restrita ao mesmo cliente, confirmou as referências ausentes. Nenhuma correção de dados/backfill foi feita.

## Operação e preservação

Base herdada: google-event-source-20261027-01/candidate. Nova base: **/root/planeje-releases/google-events-ui-20261028-01/candidate**. Conferidas 1.752 fontes vigentes antes de compor cinco sobreposições: tela, novo histórico, helper de agrupamento, CSS e teste puro. Inventário final: **1.753 fontes**. Perfil produtivo .env.production.local herdado exclusivamente dentro da VPS, com hash preservado; nenhum perfil/valor foi transferido ao Mac ou exposto.

Artefatos: **index.179378ec.js / index.27608c4d.css**. HTML trocado atomicamente após guardas de fonte, candidata, assets e revisão. Assets anteriores e Atlas Office preservados; não promover dist antigo da raiz. Próxima publicação deve herdar esta candidata/perfil e confirmar concorrência. Não repetir publicador já iniciado/concluído ou migrações antigas.

Sem SQL, novo endpoint, mudança de RLS/auth, reinício de serviço ou escrita no runtime Edge. Cinco serviços Atlas ativos com units iguais, Edge em execução e hashes do runtime preservados. Seis HTTP 200/hash: HTML, main/CSS novos, main/CSS anteriores e escritório.

## Evidência e limites

24 testes de publicação/recuperação passaram no Mac e na VPS; sete scripts dirigidos da candidata (incluindo 48 casos do handler, 5 do cliente e 6 de identidade), build produtivo e perfil passaram. Verificação local anterior inclui check completo, UI isolada 1440/390/320, erro parcial, limite/paginação e RED→GREEN do refresh durante a chamada. Revisões de produto e operação encerradas sem achados abertos; relatórios privados fora do repositório.

Na sessão real foram abertos a nova lista, o histórico agrupado e a ficha de um contato vinculado, cuja conversa carregou. Nenhuma marcação/renomeação, consulta de processamento Google, reenvio real ou mensagem de teste foi executada. Estados enviados já persistidos foram apenas lidos; atribuição na campanha não foi validada nesta publicação. Celular físico produtivo e aceite permanecem pendentes. Provas de navegador privadas em `/Users/josiasbonfimdefaria/.codex/planeje-google-events-ui-20261028`; não copiar nomes, telefones, payloads ou telas de cliente para documentação.

[Registro técnico sanitizado](../evidencias/releases/google-eventos-interface-producao-2026-10-28.json) · [Contrato/testes locais](google-eventos-interface-local-2026-10-28.md).
