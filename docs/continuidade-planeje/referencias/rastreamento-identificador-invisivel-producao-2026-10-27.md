# Rastreamento: identificador invisível publicado

**Validação posterior em 27/10/2026:** um envio real confirmou o código invisível recebido, associação ao mesmo clique, GCLID igual e origem Google Ads. Source, medium e campaign estavam preenchidos e iguais aos do clique; content e term vieram vazios. A análise foi somente leitura. Nenhum telefone, código de mensagem, identificador de contato ou valor de campanha foi copiado para esta evidência. A confirmação vale para esse envio, sem certificar outros aparelhos/provedores ou desempenho da campanha.

Publicado na VPS em **27/10/2026, às 13h28 de São Paulo**, após autorização atual de Josias: “vamos publicar”. Ativação do único link piloto concluída às 13h29. Verificação técnica encerrada; mensagem real e aceite humano permanecem pendentes. [Evidência e hashes](../evidencias/releases/rastreamento-identificador-invisivel-producao-2026-10-27.json).

## Comportamento e alcance

O marcador `{codigo_oculto}` ativa, por link, o código invisível que associa a mensagem ao clique já gravado. A associação pode recuperar origem, cinco UTMs e gclid sem mostrar `PJ-XXXXXX` na mensagem. Os templates legados são tratados somente nesse modo; sem o marcador, o comportamento anterior continua. [Contrato, testes locais e limites](rastreamento-identificador-invisivel-local-2026-10-27.md).

Foi ativado apenas o link **Google Ads da Dinamac**, mantendo destino, origem padrão `site`, UTMs padrão e opção de código visível existentes. A atualização guardada alterou somente `initial_message` e `updated_at`. Hash dos demais links permaneceu igual; contatos e histórico não foram apagados nem reprocessados.

CTWA, atribuição anterior e claim restrito ao mesmo cliente continuam usando os handlers existentes. Nenhuma configuração da Tray, GTM, campanha, telefone ou outro cliente mudou. O identificador depende de o visitante passar pelo link Planeje; não corrige o desvio do Safari privado para o endereço antigo.

## Publicação e verificações

- Base herdada: `atlas-call-notice-20261026-02/candidate`, conferida contra as 1.735 fontes do manifesto, sem drift no checkout/candidata. Perfil `.env.production.local` herdado exclusivamente na VPS, ambiente de build sem sobreposição de variáveis VITE locais.
- Seis arquivos sobrepostos: codec compartilhado novo, helpers frontend/Edge, orientação no formulário e dois testes. Nenhum handler, migração, dependência ou permissão foi alterado.
- Sete comandos dirigidos na candidata com Node 20.19.1 e build produtivo passaram; incluem os 38 cenários reais de handler com banco e transportes fictícios. A validação local anterior inclui check completo e testes RED→GREEN dos dois achados da feature.
- 23 testes da publicação/recuperação/ativação passaram localmente e na VPS. Revisão independente dos scripts encerrada sem Critical/Important; a observação sobre selar o ativador e seu teste foi atendida no manifesto de arquivos revisados, conferido antes da promoção e novamente antes da ativação.
- Guarda final: **1.737 fontes**. Cinco respostas HTTP tiveram status/hash exatos: HTML principal, JS novo, CSS, JS anterior e escritório. Assets antigos e HTML do escritório foram preservados.
- Somente `supabase-edge-functions` foi reiniciado para carregar os dois módulos compartilhados; imagem existente `supabase/edge-runtime:v1.74.0` preservada. Contêiner saudável, GET dos três webhooks retornou 200 e GET do redirect sem slug retornou o 404 esperado, sem criar clique ou mensagem. Isso verifica carregamento dos imports em Deno, não o transporte real dos caracteres pelo WhatsApp.
- Quatro serviços Atlas ativos e hashes das unidades preservados. Hash das regras de automação permaneceu igual durante a publicação.

Não houve migração ou escrita de banco durante a promoção de código. Depois das verificações, uma atualização de configuração do link foi aplicada em transação, com destino/cliente/slug/frase/estado conferidos e exigência de exatamente uma linha. A indicação `no_sql` do publicador se refere à promoção de código; a entrega completa inclui essa edição guardada de configuração.

## Operação e recuperação

Release: `/root/planeje-releases/rastreamento-invisible-20261027-01`. **Nova base de fontes e perfil para a próxima entrega:** sua pasta `candidate`, com `source-manifest-next.json` e `source-keys-next.json`. Herda a publicação do Atlas, incluindo os recursos anteriores de Mini CRM/webhook.

Frontend: `index.152cf98d.js` / `index.bc73e6cf.css`. [Abrir a versão publicada](https://planeje.jbapex.com.br/?v=152cf98d#/rastreamento?aba=links). Não promover `dist` antigo da raiz nem reaplicar migrações anteriores.

Backups privados de fonte, HTML, runtime e configuração anterior estão na release. O publicador confere hashes, preserva alterações concorrentes e recupera fonte/runtime/HTML em falha de promoção. A ativação tem marcador de tentativa única e backup anterior; não repetir `--publish` ou o ativador. Recuperação futura deve conferir o estado corrente e não sobrescrever edição posterior de outra pessoa.

## Limites e próximo passo

Nenhuma mensagem real, evento sintético de cliente, clique produtivo de teste, IA ou conversão de teste foi enviado pelo agente. O próximo passo é Josias abrir o site no navegador normal, usar “Comprar pelo WhatsApp” e enviar uma mensagem; depois conferir o clique correspondente e suas UTMs, preservando a política de atribuição anterior do contato.

Edição da mensagem ou remoção dos caracteres pelo provedor pode impedir a associação. O fluxo completo em aparelho físico, a renderização e o transporte pelo WhatsApp/Chatvolt ainda não foram certificados. Não inferir esse aceite a partir dos GETs de saúde ou do build aprovado. A revisão examinou o delta e a orquestração; não foi uma auditoria integral de OAuth/RLS/PostgREST/concorrência produtivos.
