# CRM IA — telefone e follow-up no cabeçalho

## Estado

Publicado em 11/11/2026 às 22h33 BRT, na release `crm-ia-cabecalho-20261111-01/candidate`, herdando a atualização do Gestor das22h25 e o CRM18. Seis sobreposições, três fontes novas e2.144 fontes no total. Somente a migration19 foi aplicada uma vez; as18anteriores permanecem intactas. Sem build, alteração de frontend ou reinício neste complemento. A conferência visual foi concluída após a reconexão do Chrome, conforme seção final.

## Problema e mudança

O cabeçalho compacto usa `phone` e `followup_due_at`, mas a leitura da lista removia esses campos. A ficha comercial fornecia telefone apenas para contatos com lead vinculado; o estado individual do histórico também não continha os dois valores. Assim, uma conversa autorizada podia mostrar telefone ausente ou ocultar o selo de follow-up apesar dos dados existentes.

A migration `20261111220814_crm_ia_conversation_header.sql` substitui somente o corpo atual de `public.crm_ia_workspace(text,uuid,jsonb)`. A chamada canônica continua autorizando toda a requisição antes da leitura adicional. A página de conversas e o estado das mensagens recebem telefone e prazo de follow-up do cliente/contato exatos. Telefone é o valor cadastrado, bruto e anulável; não é inferido de `@lid`, nome ou outro lead. Follow-up preserva a semântica atual, global por contato.

Não existe novo alias, grant, tabela, índice ou cache. Autoria, fotos, ordem, paginação, total, demais ações e helpers permanecem iguais. OID, owner, assinatura, atributos e ACL completa, inclusive grant option, devem ser preservados. A função privada otimizada na migration 18 permanece intacta.

## Verificação

`node --test --test-concurrency=1 scripts/crm-ia/conversation-header.database.test.mjs` passou oito testes em cerca de 14 segundos, sem falhas ou skips, após RED real por campos ausentes. ESLint do teste passou. A fixture carrega as 18 migrations anteriores em PostgreSQL descartável por socket Unix privado e bloqueia rede externa. Uma primeira tentativa GREEN falhou na inicialização do cluster durante carga local elevada; seu log foi separado, sem subtestes executados. A repetição ocorreu após observar essa condição e passou.

Casos: contato vinculado e sem lead, telefone ausente/`@lid`, estado fora do período da lista, cliente/canal/contato alheios, privado, autorização anterior ao enriquecimento, autor humano comprovado, IA, legado desconhecido e automação. Dez envelopes anteriores são comparados integralmente após remover apenas os dois campos novos. Metadados, alias e helpers são comparados antes/depois. Logs reais ficam na evidência privada; não houve consulta ou mutação produtiva nesse teste.

## Operação e limites

Release prevista `crm-ia-cabecalho-20261111-01`, com pacote explícito e perfil/frontend/runtime herdados da base atual conferida. Aplicar somente a migration 19 em transação guardada, mantendo os locks compartilhados durante preparar, aplicar, promover e verificar. Uma interrupção após COMMIT exige reconciliação do journal e estado real, nunca reaplicação automática.

A inspeção visual produtiva aguarda a reconexão do Chrome solicitada ao titular. Publicação técnica não representa aceite humano. Sem mensagem, modelo, áudio ou evento Google real; a meta integral continua na [matriz de paridade](crm-ia-scaleos-paridade-2026-11-11.md).

## Publicação e evidência

Publicador `8febc922`, escopo `d4a278dd` e pacote `e0940dec`, conferidos pelos hashes completos privados. Revisão SQL sem achados; cinco contraprovas dirigidas do publicador, oito guardas transacionais públicas e oito testes do produto passaram. A revisão adicional do rebase confirmou que somente a base mudou, sem repetir testes de código inalterado.

A primeira execução parou na guarda de fontes, antes de candidata ou journal de início SQL: outra sessão havia publicado `gestor-metricas-colaborador-20261111-01`. As cinco alterações alheias não cruzam os seis arquivos CRM. Entradas antigas foram preservadas; perfil idêntico e frontend/runtime novos do Gestor foram herdados. A execução final manteve ambos os locks durante preparar, aplicar, promover e verificar e terminou com saída zero.

HTML herdado `bf6e452be3ec4e40e2e00c793efb79da6d5c7bca08511993dc62f42884358486`, 26 artefatos e27 verificações HTTPS; perfil, runtime, serviços e assets anteriores preservados. Corpo público `b83d1d130a992f112ab108df2f2d287d` substituído por `a7339ff5cfe7bb22ab1f7c1bc3b1b342`, com mesmo OID/owner/assinatura/atributos/ACL. Não repetir `complete` ou a migration19.

A leitura real autorizada, somente leitura e com limite de8s, retornou duas conversas com os campos do cabeçalho. O histórico consultado tem1.279 mensagens e devolveu a página recente de50 com telefone presente, campos de estado e autoria completos. Foram registrados somente contagens e presença de chaves; nenhum conteúdo, claim, token ou identificador de sessão saiu do PostgreSQL. A evidência não substitui a inspeção visual pendente nem comprova transporte real.

Metadados e logs privados ficam em `.local/crm-ia-cabecalho-20261111-01` e na pasta operacional correspondente da VPS. Esta seção foi atualizada localmente depois da publicação; o manifesto preserva a versão de preparação do documento.

## Conferência visual posterior

Após Josias confirmar a reconexão do Chrome, a inspeção de produção terminou em11/11/2026, 23h13. Histórico passou de50para100 mensagens sem perder rascunho ou foco; a fila do contato estava vazia e Esc restaurou o foco no acionador. Nome e ícone de contato vinculado abriram a mesma ficha canônica, em colunas320/952px; Resumo/Campos/Jornada, Painel e Configurações carregaram. Fotos do contato e autoria desconhecida dos registros legados foram vistas; autores humano/IA comprovados permanecem ensaiados em fixtures, sem gerar envio real apenas para demonstração.

No celular, voltar e reabrir preservou rascunho e foco do compositor, sem overflow. O override solicitado390×844 resultou em433CSSpx na sessão; a evidência registra a medida real, sem apresentá-la como390CSSpx. Override removido: desktop1600×938, cabeçalho único, telefone presente,20fotos carregadas e nenhum erro. Rascunhos sintéticos foram apagados sem enviar. Autonomia/captura continuavam desligadas; nenhuma configuração foi salva. Capturas e JSON ficam privados em .local/crm-ia-cabecalho-20261111-01. A aba final foi preservada para revisão; aceite humano e homologação real permanecem distintos.
