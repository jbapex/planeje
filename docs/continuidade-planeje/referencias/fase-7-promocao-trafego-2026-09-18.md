# Promoção seletiva de tráfego — 18/09/2026

## Tráfego publicado na produção — 18/09/2026

Josias autorizou: “subir para o ambiente real, essas mudanças em tráfego”. Rotina semanal, tabela por campanha/conjunto, colagem, navegação por teclado, histórico e revisão/otimização independentes estão na produção [Rotina semanal](https://planeje.jbapex.com.br/?traffic=964c2d76#/paid-traffic/rotina).

Bundle desta entrega: `assets/index.964c2d76.js`; CSS `assets/index.1677bef5.css`. Dados, pessoas, senhas, configurações e integrações reais foram preservados. Nenhum registro ou responsável do teste foi importado. Recorrências chegam desativadas e são configuradas explicitamente por cliente; abrir a grade não cria tarefa, salvar é a criação explícita.

**Fase 7 permanece parcial.** Esta publicação supera as pendências anteriores de promoção deste recorte de tráfego; os registros de 17–18/09 sobre “somente staging” descrevem o estado anterior. Aceite geral de uso, restante da fase 7 e fase 6 permanecem pendentes. Outros trabalhos de Rastreamento/CAPI conservam suas próprias evidências e pendências.

Ver [promoção do tráfego](fase-7-promocao-trafego-2026-09-18.md) e [release de produção](../evidencias/releases/trafego-producao-2026-09-18.json).

Validação desta entrega: 30 testes Node de tráfego/tarefas, lint focado, cinco testes SQL transacionais na cópia isolada (tráfego semanal, cadências, tabela, conteúdo/projetos e onboarding), build de produção, mais dois testes de Rastreamento após alterações concorrentes.

Ensaio restaurou banco sem rede/portas e com cron desativado. O bootstrap da imagem acrescentou ACLs na restauração; somente na cópia isolada foram reconciliadas com produção para validar regressões. Essa reconciliação não foi executada no banco real.

Migração real em uma transação preservou contagem/hash das linhas originais de 151 tabelas public/auth/storage. Permissões/proprietários de 179 funções existentes e ACLs de 159 relações conferidos depois. HTTP e hashes dos assets conferidos; serviços reais continuaram saudáveis. UI autenticada abriu conta de anúncios e grade de seis linhas sem salvar/criar tarefa. Nenhum teste de escrita foi executado na produção.

A publicação autorizada não encerra o aceite geral de uso. Roteiro: usuário registra semana real, confere números/análise, conclui revisão e consulta histórico; habilita recorrência/dias/responsável somente quando fizer sentido.


Publicação seletiva em `root@72.60.14.109:/root/planeje`, frontend `/var/www/planeje`. Backup e ensaio privados: `/root/planeje-releases/traffic-20260918`. Não copiar dumps, roles ou inventários privados para documentação. Build próprio com a configuração de produção, sem guardas/origens do staging; fonte de 21 arquivos importada seletivamente. Alterações concorrentes em Rastreamento foram preservadas.

Recuperação visual: restaurar apenas o index anterior privado e conservar assets antigos. Manter o schema aditivo e os registros que venham a ser criados. Não restaurar banco antigo sobre novas operações reais. Recuperação de banco exige avaliar dados novos, não executar reset/dump restore como rotina.
