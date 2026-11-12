# CS IA em produção — 10/11/2026

A release `cs-ia-20261110-01` entrou em produção às 12h26 de Brasília, a pedido de Josias. O CS IA aparece no Squad para as sessões com acesso a Clientes e Atendimento. A release inclui a Carteira, ficha, Grupos, Equipe, Tarefas, Configurações e as integrações com Atlas e Gestor IA. [Abrir CS IA](https://planeje.jbapex.com.br/#/cs-ia/hoje)

## Publicação e verificação

- A candidata foi montada sobre `gestor-ia-20261109-01`, com o perfil de produção daquela release e uma sobreposição de 98 fontes. O HTML aponta para `assets/index.3b12dc20.js` e `assets/index.7a7244f2.css`. O domínio serviu os 20 artefatos novos com hashes conferidos. Os artefatos anteriores e o Escritório Atlas também passaram na verificação.
- O PostgreSQL sem rede ensaiou as 30 migrações do CS e a dependência histórica `20260825010000_cliente_whatsapp_grupo.sql`, confirmada como ausente na produção. Os índices de leitura de inbox e sent foram construídos concorrentemente. As 31 migrações foram aplicadas uma vez em transação, com validação de permissões. A consulta do radar no banco real passou em modo somente leitura.
- A publicação instalou as funções Atlas Chat, Uazapi Group Info e o receptor de eventos de grupo. Os workers Atlas e Atlas Events passaram para a candidata, e o serviço Edge foi reiniciado para carregar as funções. As duas unidades ficaram ativas sem reinícios automáticos, o serviço Edge ficou saudável, e as funções passaram nas consultas HTTP de verificação.
- Passaram 338 testes JS, 17 testes Python, a suíte de leitura em PostgreSQL descartável e a compilação com o perfil produtivo. O navegador carregou `index.3b12dc20.js` no domínio oficial e mostrou o login ao abrir a rota protegida. O teste de interface com sessão autenticada em produção fica para o aceite.

## Ativação e recuperação

A sala de Tarefas começa disponível para quem já tem acesso ao módulo. O radar diário e a automação de tarefas estão desligados. A leitura por grupo exige autorização na ficha. A transcrição no worker está desligada. A ativação, o teste ponta a ponta com WhatsApp e provedor reais e o aceite de uso seguem pendentes.

A pasta privada `/root/planeje-releases/cs-ia-20261110-01` contém manifesto, `published.json`, `verification.json`, recibo da migração, hashes do ensaio e backups do HTML, das fontes, das funções e do esquema. Em caso de recuperação, conferir a versão vigente, restaurar seletivamente a parte afetada e preservar gravações posteriores. As migrações desta release já estão aplicadas.

[Comportamento e testes locais](cs-ia-local-2026-11-09.md) · [Auditoria da referência](cs-ia-scaleos-auditoria-2026-11-09.md)
