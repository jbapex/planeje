# Dinamac: classificação manual como Site — 28/10/2026

**APLICADA E VERIFICADA às14h33 de São Paulo.** Josias pediu marcar como Site os
contatos com a mensagem “Olá! Vim pelo site e gostaria de mais informações.”
ou com “vim do site”, inclusive os caracteres invisíveis. Esta decisão humana
amplia a operação anterior somente para uma classificação manual como Site;
não transforma a frase em prova de campanha Google ou clique individual.

## Resultado

**268 contatos sem origem foram classificados como Site**, com uma entrada de
histórico por contato. **21 contatos já atribuídos foram preservados**, inclusive
Google, Meta e Site anteriores. O total Site da Dinamac passou de8 para276.
Uma nova auditoria encontrou zero alvos restantes entre os289 contatos com as
frases. Nome, telefone, datas, marcações, UTMs e metadados anteriores ficaram
preservados pelas pós-condições transacionais.

A leitura usa as mensagens recebidas da Inbox e os logs Chatvolt do mesmo
cliente. Mensagem anônima só entra com vínculo inequívoco por organização e
conversa; grupos e eventos de saída ficam fora. Normalização trata acentos,
maiúsculas, espaços e caracteres invisíveis. Contatos de outras contas não
entram. Não foram recriados cadastros ausentes.

O registro usa `source=manual_site_phrase`, `method=manual_site_phrase` e referência
à mensagem já salva. Horário do histórico é o recebimento original disponível;
não se inventa clique ou horário original da fala. **Nenhuma UTM ou GCLID foi
criada.** A ficha do caso antigo conferido abriu como Site, sem UTMs e com a
entrada datada no histórico.

## Execução e verificação

Operação privada `/root/planeje-operations/dinamac-manual-site-20261028-01`.
SQL SHA256`1f24bf5fe744dba632d86bc800ef436d36ba516811e6666569fa48823601daac`;
hash do lote aplicado`1f621374a6399dd096a0d3ffcf3087f3`.
`scripts/contact-attribution-history/manual-site.sql` audita e faz rollback por
padrão. Aplicação exige hash conferido, locks e SERIALIZABLE, usando a RPC
canônica. O preflight publicado de persistência/triggers passou antes da escrita.
Saída operacional contém somente totais e hashes, sem payloads ou dados pessoais.

`python3 scripts/contact-attribution-history/manual-site.test.py` passou em
PostgreSQL16 descartável, sem DSN: normalização, limites da frase, conversa
anônima única/ambígua, saída/outra conta, Google protegido, cadastro/datas,
hash desatualizado com rollback, histórico sem clique e repetição zero.
Revisão diferencial inline do delta e controles conectados terminou sem achado
substanciado aberto. Relatório privado SHA256
`d95bb635cff7a4ec0a13ae7407d55768b05940332691c16bff497e1e4844d06d`.

Produção confirmou268 registros manuais distintos, sem clique/GCLID/UTM,
11 contatos Google e3 Meta preservados, HTML intacto e cinco serviços Atlas
ativos. Não houve migração, restart, replay, envio de conversão/mensagem ou nova
regra automática. A classificação é manual pela frase conforme pedido; aceite
de uso continua separado da verificação técnica.
