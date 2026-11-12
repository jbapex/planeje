# CRM IA — execução de notificações e conversa

Base: release04 publicada; treze migrations imutáveis. [Desenho](../specs/2026-11-11-crm-ia-notificacoes-conversas-design.md).

- [x] Conferir fonte atual, referências, consumidores e limites; corrigir distinção feed/conversa e presets diretos da referência.
- [x] Avisos: configurar destinatário, registrar conclusão, enfileirar com prova/recibo e integrar transporte sem tocar conversa fonte; limites do eco precoce registrados.
- [x] Conversas: feed/leitura individual, sinalização IA comprovada, contexto comercial e atalhos da mesma fila.
- [x] Integrar CSS, fixture e loaders/contratos; 383 testes, quinze migrations, check e CUA isolada passaram.
- [x] Fechar a rechecagem independente dos locks e da compatibilidade com recuperação, com hashes finais; ambos os domínios sem achados pendentes.
- [ ] Homologar apenas destinatário autorizado; preparar/conferir Google pela conta indicada, sem ativar outros contatos.
- [x] Publicar incremento05b sobre a base vigente do Gestor e conferir HTTPS/runtime/ACL/interface. Leitura do Painel corrigida em publicação SQL posterior às14h01; sem envio/modelo real.
- [ ] Continuar distribuição/entradas, configuração por chat, conhecimento/catálogo, painel/parceiros e lacunas comprováveis da matriz.

Decisão: dois domínios de implementação independentes com arquivos exclusivos; sem duplicar autores nos componentes comuns. Feed local e resumo WhatsApp são capacidades diferentes. Distribuição inline atual precisa extração e fontes autenticadas, ficando fora deste pacote para não misturar atribuição com envio. A pesquisa de Internas permanece inconclusiva; ausência de fonte não autoriza usar notas como conversas.

Base operacional atualizada: herdar `gestor-rastreamento-espaco-20261111-01`, cuja única diferença para04 é o CSS do Gestor. Google Agenda já foi conectado ao calendário indicado no JB APEX, após ativação da API pelo perfil administrativo correto do Chrome. Mensagens/modelo reais e compromisso externo continuam pendentes; a autonomia geral permanece desligada.
