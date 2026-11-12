# Impacto Noivas: Pixel Planeje existente e origem Google fixa

Etapa posterior desta mesma data: [dois rascunhos preparados, ainda não publicados](impacto-pixel-rascunhos-2026-11-05.md). O texto abaixo registra a conferência anterior, somente leitura.

05/11/2026. Conferência somente leitura após Josias indicar a aba do Tag Manager no Chrome e suspeitar da falta do Pixel Planeje de sete dias.

## Evidências atuais

Contêiner IMPACTO NOIVAS / (WEB) impactonoivas.com.br, GTM-PPPWRPJP, workspace8. Zero alterações pendentes na abertura. A tag HTML `PLANEJE | Substituir links WhatsApp` existe e usa All Pages; Tintim está pausado. Um formulário novo vazio, sem configuração nem conteúdo, foi fechado sem salvar para inspecionar a tag existente. Nenhuma tag, acionador ou versão foi criada, salva ou publicada.

O script realmente presente no DOM do site público contém a chave `impacto_noivas_atribuicao`, validade604800000ms (sete dias), captura GCLID/UTMs e reescreve os botões. Logo, a hipótese de ausência do script não se confirmou. Não foi lido o conteúdo privado de localStorage, cookie ou sessão.

Entretanto, o link-base do script é `https://planeje.jbapex.com.br/r/wge1vif4?utm_source=google&utm_medium=cpc`. Sem parâmetro de entrada, o construtor mantém esse Google/cpc fixo. Os seis links de WhatsApp observados na homepage sem parâmetros de entrada estão com esse mesmo endereço. Consulta READ ONLY do link, restrita à Impacto e ao slug, confirmou também `default_origin=google_ads`, `default_utm_source=google`, `default_utm_medium=cpc`. Assim, uma visita direta/sem evidência pode ser classificada como Google; retirar só a query da tag não basta porque o fallback do link também é Google.

## Interpretação e próxima etapa

Os dez contatos cadastrados como Google na consulta anterior de05/11 são uma contagem da classificação registrada, não dez cliques pagos confirmados. Nenhum desses dez tem GCLID gravado. A configuração atual não permite concluir retrospectivamente qual deles foi tráfego pago; não reclassificar os dez ou remover históricos por inferência.

Correção a preparar/validar: destino neutro do site, padrão Site sem Google/cpc fixo, mantendo UTM/GCLID reais recebidos e retenção existente. Deve considerar tanto a tag quanto defaults do link e preservar o fluxo dos demais links/clientes. Ainda não implementada nem autorizada para publicação nesta conferência.

Sem alteração de banco, tags, site, leads ou release; sem clique real de anúncio, envio de WhatsApp ou conversão. Captura privada em `/Users/josiasbonfimdefaria/.codex/visualizations/2026/11/05/impacto-pixel-sete-dias-existente.png`. A conferência do script publicado não certifica um percurso completo anúncio → site → WhatsApp → webhook.
