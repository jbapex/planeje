**Continuação vigente:** [release 04, publicada às 08h36](crm-ia-perfis-leads-2026-11-11.md), com perfis, Leads/CSV e conversa integrada. O registro abaixo descreve a release 03.

# CRM IA — Concierge, rascunhos e agenda semanal

## Estado

Publicado em **11/11/2026, às 07h12 BRT**, na release `crm-ia-20261111-03`, sobre a release 02. HTTPS, fontes, runtime, permissões e agenda autenticada foram conferidos. O pedido integral permanece ativo na [matriz de paridade](crm-ia-scaleos-paridade-2026-11-11.md); esta onda não conclui todos os controles. [Desenho](../../superpowers/specs/2026-11-11-crm-ia-paridade-design.md) e [plano](../../superpowers/plans/2026-11-11-crm-ia-paridade.md).

## Comportamento implementado nesta onda

- Concierge propõe confirmar presença, remarcar ou cancelar um compromisso existente. A pergunta sai pela fila atual. Aplicar exige uma afirmação posterior à pergunta efetivamente enviada, no contato/canal exatos e com timestamp original válido. Proposta expira em cinco minutos. Mensagem histórica, negativa, ambígua, intervenção humana ou versão alterada não comprova confirmação.
- Remarcação preserva ID, criador, responsável e chave de criação. Recibo guarda estado anterior/posterior e ator atual. Quando há Google conectado, a resposta depende do recibo atual; cancelar depende de exclusão confirmada. Pendência não consome tentativa de envio; incerteza usa o repasse atual uma vez.
- A equipe pode marcar não comparecimento após o término, usando versão e canal. Recuperação é opt-in, em tentativa única, com atraso e vencimento próprios; reutiliza follow-up/outbox. Nova mensagem, pausa, revogação e mudança da fonte invalidam o convite. Uma limpeza concorrente compara a versão e o marcador completo antes de remover um retorno programado.
- Agentes têm rascunho privado por editor, salvamento serializado, revisão e versão publicada de origem. Publicar e descartar são ações separadas; rascunho incompleto não roda nem autoriza voz. Fechar preserva o rascunho. Conflito conserva os dados para revisão.
- Resposta em áudio oferece Nunca/Sempre/Espelhar e mantém compreensão de entrada independente. Espelhar exige a origem recebida atual, no canal/JID do run; não aceita decisão do modelo. Configuração legada sem modo e o valor `nunca` são preservados. Tons Direto/Entusiasmado chegam ao prompt.
- Agenda alterna lista/semana, mantém navegação e grade vazia, usa o fuso autoritativo devolvido pela RPC, distribui sobreposições e deixa compromissos fora de 7h–20h acessíveis. Insights usam o recorte inteiro autorizado antes da paginação. Editor e ações usam os mesmos registros, versões, disponibilidade e integração Calendar.

## Contrato de etiquetas

A consulta produtiva foi somente de metadados: `leads.etiquetas` é `text[]`. O fixture anterior usava JSONB e mascarava o contrato de captura. A nova migration corrige os escritores de entrada/salvamento/importação, preserva etiquetas quando omitidas e permite limpeza explícita. A verificação usa o tipo nativo; não altera dados de clientes como parte de QA.

A comparação local de metadados abrangeu 168 colunas de tipos nativos compartilhadas com o fixture. Não encontrou outro tipo divergente após o ajuste de etiquetas. Isso não certifica equivalência de constraints, políticas ou todos os campos; duas colunas legadas extras do fixture continuam documentadas separadamente na evidência privada.

## Verificação e limites

O conjunto canônico `npm run check` passou com rede negada, incluindo lint, tipos, regras, testes locais e build temporário. Os testes dirigidos passaram **205/205, sem skips**, em execução serial com rede negada. Runtime, voz, rascunhos e ações de agenda foram integrados com as onze migrations na ordem real. A correção de etiquetas teve RED→GREEN com o tipo produtivo; a limpeza de recuperação teve RED→GREEN com duas transações concorrentes. A revisão independente encerrou sem achados pendentes no escopo de 36 arquivos: 80 testes Node/UI, 20 PostgreSQL e duas verificações de sessão aquecida, com contagens sobrepostas. A candidata remota passou 125/125 testes no Node 20, sem skips, e no build produtivo. CUA conferiu a grade em 390/1800px, o editor em 320px, abertura de compromisso e retomada/descarte de rascunho na prévia isolada. Não houve publicação na referência nem uso de WhatsApp, modelo ou consentimento Google real nesses testes.

As oito migrations das releases 01/02 permanecem aplicadas e imutáveis. As novas `20261111090001`, `20261111090002` e `20261111090003` foram aplicadas uma vez, juntas em uma transação. **As onze migrations estão aplicadas: não editar nem reaplicar.** Uma futura promoção parte das fontes e do perfil vivos da release 03, com bundles ESM completos por entrada, guardas de concorrência e rollback de código. SQL aditivo permanece se houver rollback.

Homologação com telefone autorizado e conta Google depende das escolhas já solicitadas a Josias. Não inferir aceite nem equivalência da engenharia privada do ScaleOS.

## Publicação e recuperação

Release de 36 sobreposições e 2.063 fontes. HTML SHA-256 `9a38244989246eda79703663dcbe68f9ff33f07c9785075a80a80361fa7c3398`, entrada `index.7b77a67f.js` e CSS `index.7d7406ee.css`. HTML e todos os 22 assets foram conferidos por HTTPS/hash; oito entradas Edge foram compiladas em bundles ESM completos e responderam OPTIONS 200. Apenas o mesmo container Edge foi reiniciado. Ambiente, perfil, cinco serviços Atlas, MCP e sincronizador CRM permaneceram preservados.

A primeira preparação parou antes de criar a candidata, migrar ou promover: `docs/quality.md` já existia na VPS fora do manifesto da release 02. O arquivo remoto foi preservado; a documentação local foi atualizada e retirada apenas do overlay remoto. O guard permaneceu intacto. Pacote e logs anteriores estão preservados privadamente; a segunda candidata passou sem falha.

A sessão autenticada exibiu grade semanal vazia, navegação, resumo real de quatro estados e fuso do servidor, sem rolagem horizontal global. Não houve edição de cliente, rascunho ou envio nessa conferência. Após a promoção havia zero configurações CRM, outbox, autorizações de voz, entradas ASR, conexões/jobs Calendar e rascunhos: nenhuma ativação em massa. RLS da tabela de rascunhos estava ligada; papéis anon/authenticated não executam intake, contexto de alteração, início de transporte nem bypass do workspace. [Recibo sanitizado](../evidencias/releases/crm-ia-concierge-rascunhos-producao-2026-11-11.json).
