# Métricas do Gestor IA para colaboradores

## Estado

Correção **publicada e tecnicamente verificada** em11/11/2026 às22h25 de Brasília. Josias informou que Rafael abre o Gestor IA, mas não carrega nem atualiza métricas como o superadmin. A auditoria de leitura da VPS confirmou perfil ativo, Tráfego e Rastreamento habilitados, leitura de `meta_resumo` permitida e12 clientes fechados na ACL de tráfego. A permissão `valor` está oculta. Nenhum papel, módulo ou campo individual foi alterado. A homologação no login de Rafael permanece pendente.

A base produtiva conferida é `gestor-rastreamento-identificador-20261111-01/candidate`, com HTML SHA256 `9ebe3f8d448a797e110eab45e4a3ebbe8421794952916b0377150e15cf0a54bd`. As seis fontes examinadas de rota, acesso, dados e contextos correspondiam ao manifesto publicado. O bundle Edge instalado também continha o bloqueio por papel administrativo. As verificações da correção abaixo usam somente dados fictícios.

## Causa e alteração

Havia três bloqueios além da entrada do ambiente: `GestorIaWorkspace` só habilitava métricas detalhadas para admin/superadmin; os dois loaders recusavam colaborador; a função `gestor-ia-meta` repetia a restrição. O consolidado também dependia de `valor`, embora já existisse a permissão de leitura de mídia `meta_resumo`.

A correção alcança somente três fontes de produto:

- `src/components/gestor-ia/GestorIaWorkspace.jsx`: métricas e consolidado seguem o acesso ativo ao Gestor e a leitura de `meta_resumo`.
- `src/components/gestor-ia/gestorIaData.js`: métricas e resumo de contas aceitam os papéis internos já autorizados por `requireAccess`.
- `supabase/functions/gestor-ia-meta/readings.js`: colaborador pode consultar métricas, resumo de contas, compatibilidade legada e solicitar atualização de conta vinculada. O consolidado exige Tráfego e leitura de mídia; `valor` continua protegendo cobrança.

A API mantém a validação autenticada de usuário, sessão vigente, perfil ativo, módulo efetivo, ACL do cliente fechado e vínculo ativo da conta antes do cache, token ou Graph. Lotes mistos só devolvem os pares autorizados. Metas, relatório administrativo e prévia dos números do portal continuam restritos à administração pelas regras anteriores. Os campos contratuais e a cobrança não são liberados por esta mudança.

Não há mudança de SQL, RLS, credenciais, stack, autenticação, limites de atualização ou mecanismo de cache. A leitura inicial continua pelo banco. Filtros reutilizam o histórico disponível; somente a ação manual da conta pode coletar dados da Meta. A edição de metas e os demais controles do Gestor não fazem parte desta correção.

## Verificação

Os testes novos falharam antes da implementação com `Acesso indisponível`, HTTP403 e ausência do consolidado do colaborador. Depois passaram49 testes dos loaders/handler,145 verificações React e191 testes da suíte Gestor inteira. Há casos de sessão/perfil inválidos, módulo/campo negado, cliente/conta fora do escopo, lote misto, cobrança oculta, operações administrativas negadas, atualização explícita, cache, respostas atrasadas e revogação.

Os casos antigos de séries individuais foram movidos para a rota da ficha do cliente, preservando suas asserções. Eles deixam de depender do bloqueio financeiro do consolidado. A prévia passou a simular colaborador com `valor` oculto e atualizou o gate do transporte fictício do consolidado.

`npm run check` completou com saída0: contexto, harness, lint, lint tipado, tipos, regras, testes locais e build temporário. O lint registrou360 avisos e o tipado11, sem erros; não foram suprimidos nem tratados como limpos. O build terminou em35,51s e não promoveu `dist` ou ZIPs. Comandos usaram Node20.20.2. Logs e baseline exato ficam em `.local/gestor-acesso-colaborador-20261111/`.

No navegador da prévia isolada com `?perfil=colaborador`, o consolidado carregou cartões, dois gráficos e campanhas. Selecionar uma conta habilitou **Atualizar agora**; o clique avançou a hora salva. O filtro de14 dias e a comparação mantiveram esse horário. Contas e BM mostrou investimento sem a coluna Saldo de cobrança. A rede externa está bloqueada nessa prévia; isso não é homologação na conta real de Rafael nem prova de coleta real na Meta.

A revisão diferencial independente encerrou sem achados concretos pendentes nos três produtos, três testes e fixture. O relatório privado `.local/gestor-acesso-colaborador-20261111/security-review.md` vincula os sete hashes finais e examina os cenários adversariais, consumidores CS e o alcance. O pacote local contém somente as três fontes e três testes auxiliares da candidata; estes não sobrescrevem scripts remotos fora do manifesto. A fixture fica fora da publicação. A consulta Context7 não disponibilizou a versão2.30.0 do SDK. Foram preservados o SDK instalado, `getUser(token)` e o cliente com JWT do chamador, exercitados nos testes. Changelog e documentação oficial atuais foram consultados, sem adotar wrappers novos ou atualizar dependências.

## Publicação e limites

Josias autorizou esta publicação expressamente em resposta à pergunta de aprovação: **Publicar correção na VPS (recomendado)**. A release `gestor-metricas-colaborador-20261111-01` foi promovida em `2026-11-12T01:25:49.880424Z`, correspondente a11/11 às22h25 em Brasília. A base final é `crm-ia-acesso-leitura-20261111-01`, com2.141 fontes; ela preserva a correção SQL do CRM publicada durante a preparação. A primeira candidata de2.138 fontes foi arquivada sem promoção. Nenhuma migration anterior foi reaplicada.

O overlay gerenciado tem as três fontes funcionais, a entrada produtiva de `gestor-ia-meta` com somente o marcador `saved-v3` → `saved-v4`, e o teste React já presente no manifesto. Os dois testes Node adicionais ficam apenas na candidata privada. O índice da função foi composto da versão produtiva e está em `.local/gestor-acesso-colaborador-20261111/overlay/supabase/functions/gestor-ia-meta/index.ts`; o índice antigo do checkout não foi usado como base nem sobrescrito.

A candidata final passou58 testes Node e build em58,42s, com o perfil produtivo e os bloqueios de geração/agenda preservados. A revisão operacional encontrou um P2 no rollback: arquivo concorrente adicional poderia ser deslocado durante a troca de diretórios. Dois casos vermelhos confirmaram o problema; o inventário ativo e o backup agora são conferidos antes da troca. Dez testes de recuperação passaram também no Linux da VPS, com `renameat2` real em temporários, complementando os24 do helper herdado. A revisão final vinculou os hashes atuais e encerrou com um achado resolvido e nenhum pendente.

A API foi instalada antes do HTML, com troca atômica e validação de OPTIONS200/`saved-v4` e POST sem sessão401/403 com o mesmo marcador. Não houve reinício: Atlas, MCP, sincronizador, unidades efetivas, Edge e os demais runtimes foram preservados. Não houve escrita no banco, alteração de permissões individuais, envio de mensagens, chamada de IA ou coleta real da Meta nesta publicação.

O domínio serve `index.a4b90dc3.js` e o CSS preservado `index.775a6d7c.css`; HTML SHA256 `bf6e452be3ec4e40e2e00c793efb79da6d5c7bca08511993dc62f42884358486`. O runtime Meta tem SHA256 `89f5e0ca7e6985bfbe9c14599441f641c6b0f19121052ab2248d85f88d5b9523`. Foram conferidos28 artefatos HTTPS, incluindo assets anteriores e Escritório Atlas. A sessão disponível no navegador abriu Métricas, os indicadores da carteira e dois gráficos, sem alerta de permissão; isso não foi um teste identificado no login de Rafael. A leitura de metadados após a publicação confirmou que ele continua colaborador, com Tráfego e mídia permitidos, `valor` oculto e12 clientes autorizados.

Recibos, perfis, backups e manifestos ficam em `/root/planeje-releases/gestor-metricas-colaborador-20261111-01`. Não repetir o publicador. Uma futura publicação deve partir dessa base ou de uma sucessora conferida, incluindo o perfil e o runtime atuais. A recuperação preserva modificações concorrentes e usa os backups privados; uma divergência posterior à promoção exige diagnóstico próprio antes de qualquer restauração.

A verificação autenticada na conta de Rafael, o resultado de uma atualização real e o aceite de uso permanecem pendentes. A correção não concede acesso a todos os clientes nem remove as restrições de metas, relatórios administrativos, contratos e cobrança.

[Abrir a versão publicada](https://planeje.jbapex.com.br/?v=a4b90dc3#/gestor-ia/metricas) · [Evidência de produção](../evidencias/releases/gestor-acesso-colaborador-producao-2026-11-11.json).
