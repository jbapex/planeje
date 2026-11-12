# CRM IA — execução de perfis e leads

Base: release 03 publicada às 07h12 BRT, 2.063 fontes e onze migrations aplicadas. [Desenho e contrato](../specs/2026-11-11-crm-ia-perfis-leads-design.md).

- [x] Confirmar campos na referência, escritores/callers, schema real e riscos para gates/histórico.
- [x] Backend: perfis publicados/atribuição/auditoria, modelos seguros e leituras/contadores filtrados.
- [x] Leads: filtros/colunas/ficha/CSV, seleção versionada e Kanban completo.
- [x] Editor de agentes: perfis com identidade/ordem/ações, rascunho/publicação e navegação dos campos existentes.
- [x] Reusar conversa canônica na ficha; integrar CSS, fixtures e contratos comuns.
- [ ] Integrar e revisar o delta sensível, rodar check/testes dirigidos e conferir CUA local.
- [ ] Publicar incremento sobre a release 03 e conferir HTTPS/runtime/ACL/interface.
- [ ] Continuar demais controles da matriz; homologação real depende das escolhas já solicitadas.

Ruling: colunas são preferência local por pessoa+cliente, com nomes permitidos e padrão restaurável — evita usar configuração de automação para estado visual e não cria tabela/engine novo. Custo: a seleção não sincroniza entre navegadores.

Ruling: auditoria privada específica de perfil, sem nova execução/status/tarefas — eventos de funil e interações atuais alimentam métricas e gates e não podem receber classificação artificial.

Ruling: divisão em três domínios com contrato fixo permite implementação paralela sem compartilhar arquivos; revisão independente começa após parar o primeiro escritor, e o coordenador integra/valida o pacote final. Nenhum worker, provider ou transporte real participa dos testes.
