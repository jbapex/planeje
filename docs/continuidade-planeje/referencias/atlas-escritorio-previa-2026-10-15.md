# Atlas — primeira prévia local do escritório

**Atualização posterior:** Josias conferiu e aprovou a apresentação inicial, solicitando a identidade visual do Planeje. A [revisão de marca](atlas-escritorio-identidade-2026-10-15.md) já está na prévia local e aguarda nova avaliação; o registro abaixo descreve a primeira versão.

15/10/2026, São Paulo. **Prévia interativa local, com dados e agentes fictícios. Não publicada nem integrada ao Planeje.**

## Direção e entrega

Após a análise do Habblaud, Josias respondeu “perfeito”. A direção escolhida foi concretizada numa prova local reversível: três salas (Tráfego, Design e Edição), seis agentes que representam o acompanhamento de seis pessoas fictícias e nove tarefas de exemplo. Esse retorno não foi interpretado como aceite de uma interface ainda não vista, definição das regras operacionais ou autorização de publicação.

Endereço: <http://127.0.0.1:4330/>. Fonte da prévia em `scripts/atlas-office-preview/`; comandos de execução no README dessa pasta. Build em `.local/atlas-office-preview/dist`. Servidor estático vinculado somente a `127.0.0.1`; sua continuidade depende do processo local.

O mapa é o renderer Canvas do [Habblaud](https://github.com/marmottajr/habblaud), versão 0.11.0, commit `4ccce2537472fe5a8d432f06974494d2e778ff15`. Foram copiados 86 arquivos TypeScript de arte/mundo/tipos compartilhados, conferidos byte a byte contra esse commit. Licença MIT preservada no vendor e acessível pela prévia. Os arquivos de código upstream não foram modificados. O manifesto local de arte omite os assets da marca original; a interface e o adapter de dados são próprios da prova Atlas.

## Interações demonstradas

- Pessoa na lateral ou personagem no mapa → agente e fila daquela pessoa.
- Sala → acompanhamento da área, pessoas e tarefas correspondentes.
- Todas as tarefas → nove itens do exemplo, sem truncamento.
- Proposta do agente → texto e três passos do cenário, com aviso de que as regras de ação ainda serão definidas.
- Simular material aprovado → EX-03 da Bia passa a concluída e EX-01 da Ana a fazer, sem trocar responsáveis; o bloqueio sai das duas filas.
- Recomeçar exemplo → restaura os nove itens e os dois bloqueios iniciais.
- Em tela estreita, mapa com controles e painel de acompanhamento abrível; pessoas acessíveis no painel da área.

Os nomes de agentes (Nilo, Íris, Cora), pessoas, clientes, tarefas, horários e propostas são fictícios. A proposta é determinística, não uma resposta de IA. Animações não representam atividade humana medida. Os snapshots e tarefas vivem só na memória da página; a ambientação social do renderer pode usar localStorage da origem local, sem valor operacional.

## Validação realizada

Build estático Vite 4.5.14 concluído, 72 módulos, usando as dependências já existentes. Não foi instalado pacote novo nem executado o servidor original do Habblaud. HTTP 200 e escuta somente no loopback conferidos. Assets finais: `index-5b962a4d.js` e `index-0113259e.css`.

No navegador do Codex, conferidos: fila da Ana com dois itens; proposta com três passos e ressalva das regras; aprovação com desbloqueio; visão de todas as nove tarefas; seleção de Design/Bia e reinício; Edição com três tarefas/duas pessoas e Caio com dois itens; clique direto no personagem da Bia abrindo o agente correspondente. Console sem erro nas consultas efetuadas. Viewports de 1544×904 e 390×844 conferidos, sem rolagem horizontal. No celular, seleção pelo painel e atualização da proposta após aprovação passaram. A configuração temporária de viewport foi removida ao concluir.

Capturas: [computador](../evidencias/atlas-escritorio-notebook-2026-10-15.jpg) e [celular](../evidencias/atlas-escritorio-celular-2026-10-15.jpg). Esses checks validam a apresentação e o cenário local, sem comprovar execução autônoma ou integração real.

## Limites e próximos passos

Nenhuma VPS acessada; nenhum banco, tarefa ou serviço do Planeje alterado; nenhuma chamada a modelo, mensagem externa, hook, mod, terminal ou leitura de sessão local. O monitor Atlas permanece pausado. As fontes integrais de staging e produção não foram substituídas por esta pasta.

Pendentes: avaliação visual e de utilidade por Josias; integração somente leitura com tarefas/usuários completos e permissões do Planeje em teste; estados baseados em eventos reais do Atlas; definição das regras de criar/organizar tarefas; implementação e validação de escrita idempotente no mecanismo oficial Tarefas; eventual publicação mediante escopo autorizado. Não existe segundo motor operacional nem adoção do servidor Habblaud nesta entrega.

[Escopo e pesquisa anterior](atlas-cidade-agentes-2026-10-15.md) · [Evidência](../evidencias/atlas-escritorio-previa-2026-10-15.json) · [Release](../evidencias/releases/atlas-escritorio-previa-2026-10-15.json).
