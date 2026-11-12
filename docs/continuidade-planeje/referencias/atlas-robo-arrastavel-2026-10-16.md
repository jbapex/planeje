# Atlas: robô arrastável — 16/10/2026

Josias pediu “quero poder arrastar o robozinho para todo o lado”. Publicado às 15h52, São Paulo, no [Planeje](https://planeje.jbapex.com.br/?v=9c001447#/caixa).

Segurar e arrastar o avatar muda sua posição. Soltar após arraste não abre/recolhe a conversa; clique simples continua fazendo isso. A posição é salva localmente por usuário e navegador, como fração da área utilizável. Recarregar e navegar conservam o lugar; mudança de tamanho adapta e mantém o robô dentro da tela. Bloqueio de localStorage não impede o uso do arraste. Alt + setas permite mover pelo teclado (Shift acelera); Alt + Home volta ao canto original e limpa a preferência.

Conversa e aviso acompanham o robô com contenção nas bordas. A conversa abre abaixo/acima ou ao lado quando cabe; no celular pode reduzir a altura com rolagem interna. Arrastar a conversa aberta não desmonta o formulário nem apaga rascunhos. Cancelamento do gesto devolve a posição anterior. Pointer Events/captura de ponteiro e touch-action:none permitem o mesmo gesto por mouse ou toque. Toque em aparelho físico permanece por conferir; o navegador responsivo foi validado.

## Fontes e publicação

Somente três arquivos: `AtlasTeamAssistant.jsx`, `AtlasTeamAssistant.css` e novo `useAtlasFloatingPosition.js`, em `src/components/atlas/`. Nenhuma regra de IA, destinatário, relógio, aprovação, tarefa ou mensagem foi modificada.

Fonte base anterior: `/root/planeje-releases/atlas-team-production-20261016-01/candidate`. Guarda de 1.638 arquivos conferida no build e na publicação; somente os três arquivos próprios foram sobrepostos. Os ZIPs gerados pela etapa pack foram restaurados à versão produtiva antes do build final, evitando promover arquivos de extensão alheios à mudança. Assessoria/piloto CS não foram promovidos.

Nova candidata base: `/root/planeje-releases/atlas-team-drag-20261016-01/candidate`. Webroot `/var/www/planeje`. Assets novos `index.9c001447.js` / `index.74446f1a.css`; anteriores `index.ae721a01.js` / `index.341caecc.css` conservados. Imagem 3D e flags de produção anteriores preservadas. Fontes próprias sincronizadas em `/root/planeje`; índice público trocado atomicamente por último, após conferir concorrência e hashes. O backend continua usando `/root/planeje-releases/atlas-team-production-20261016-01/candidate`; nenhum serviço reiniciado, env/Nginx/SQL alterado ou dado operacional gravado pelo agente.

Backups em `/root/planeje-releases/atlas-team-drag-20261016-01/before/`. Reversão visual: restaurar o índice anterior e as fontes próprias correspondentes, removendo o hook novo somente da base da fonte revertida. Não apagar o novo arquivo de assets: navegador já aberto pode ainda usá-lo. Não executar novamente o promotor sem reconciliar uma nova baseline.

## Conferência realizada

- Componente real em cenário local fictício sem API real: arraste fechado não abre, clique seguinte abre; bordas superior/esquerda e inferior/direita respeitadas; arraste com conversa aberta mantém rascunho; navegar conserva posição e rascunho; recarregar restaura posição; Alt + seta move.
- Aviso fictício no canto oposto/movido e celular 390×844: robô, aviso e chat continuam dentro da tela, sem rolagem horizontal. No centro do celular o chat abriu em x=12..378/y=449..832 e o robô ficou fora da área do chat. Override do viewport restaurado, aba fictícia fechada e Vite de verificação parado.
- Build final completo do frontend passou (52,79 s), com hashes das 1.638 fontes conferidos e flags produtivas mantidas.
- Produção autenticada: robô arrastado de x=285/y=100 para x≈273/y≈648, sem abrir chat. Clique abriu a conversa em x≈12..339/y≈56..636. Recarregar preservou x≈273/y≈648; conversa abriu novamente. Nenhum acompanhamento ou mensagem real iniciado durante o teste.
- HTML e JS/CSS novos/anteriores HTTP 200 com bytes exatos. Nginx, equipe, demandas, escritório e missões permaneceram ativos.

Captura privada de produção `.local/atlas-team-drag/production-proof.png`; [release](../evidencias/releases/atlas-robo-arrastavel-2026-10-16.json). Aceite de uso por Josias pendente. A evolução operacional/WhatsApp e o primeiro acompanhamento real continuam nas pendências anteriores.
