# Impacto Noivas: status do CRM no Planeje

Atualização de05/11: [interface e controle por loja](crm-status-interface-local-2026-11-05.md) substituem o procedimento de ativação desta candidata. Esta página preserva a simulação e evidência histórica.

## Estado e autorização

Implementado e validado localmente em 02/11/2026. Josias escolheu Impacto Noivas e pediu continuidade. A origem correta é a VPS 82.29.181.87; o destino é 72.60.14.109. A VPS final 62 não integra este fluxo.

Não houve instalação, alteração de status, migração, reinício, envio ou publicação. A autorização específica de produção continua pendente. Aceite humano é separado da validação técnica.

## Comportamento da candidata

Consulta por API restrita à organização da loja, seguida de reconciliação pelo telefone completo no cliente correspondente. O temporizador aguarda um minuto após cada execução. A primeira consulta cobre os registros disponíveis; execuções seguintes gravam somente diferenças.

Atualiza `crm_apice_lead_status` e sua data em contatos e leads existentes. O trigger atual de leads também atualiza `updated_at`. Preserva status interno, Mini CRM, tarefas, atribuição e mensagens. Leads oficiais prevalecem sobre a Caixa de Entrada, cujo status comercial é `lead_status`, não o ciclo de importação.

Telefones repetidos com status divergentes ou vazios ficam sem escrita, conforme decisão conservadora comunicada. Josias não escolheu usar o cadastro mais recente. Sem correspondência ou remoção de status, o último valor no Planeje é preservado.

Legados sem organização são incluídos somente se o proprietário tiver exatamente uma organização. A leitura real confirmou essa condição para Impacto. Credenciais administrativas permanecem na origem; integração usa segredo próprio e JWT anon no gateway existente.

## Simulação real, somente leitura

Às 14h12 de 02/11/2026, o handler candidato executou em memória no Node 18 instalado na origem, usando o SDK 2.30.0 e a API local existente. O planejador leu o destino por transação READ ONLY. O corpo com telefones ficou em memória; o relatório salvo contém apenas agregados. Nenhum arquivo foi instalado nas VPS.

| Medida | Quantidade |
| --- | ---: |
| Registros de origem | 8.615 |
| Leads oficiais / entradas abertas | 8.559 / 56 |
| Registros de destino examinados | 11.771 |
| Telefones com correspondência segura | 4.976 |
| Contatos com alteração proposta | 4.976 |
| Leads com alteração proposta | 5.559 |
| Total de alterações propostas | 10.535 |
| Telefones com conflito ou status vazio | 144 |
| Registros de destino preservados por esse motivo | 307 |
| Registros de destino sem correspondência | 929 |
| Telefones inválidos na origem | 124 |
| Alterações aplicadas | 0 |

As contagens são uma fotografia; a aplicação deve recalcular o estado vigente. Os 10.535 registros não representam 10.535 pessoas distintas.

## Verificações e revisão

- Cinco testes Node: autenticação, organização fixa, proprietário exclusivo, paginação completa, campos mínimos e falhas sem retorno parcial.
- Quatorze testes Python: telefone, status, precedência, conflitos, isolamento, envelope, datas PostgREST/Python 3.9, configuração privada, HTTPS, redirecionamento, simulação sem escrita e recusa de escrita após leitura demorada.
- Vinte e duas verificações em PostgreSQL 16 descartável: escrita real gerada, cliente correto, campos preservados, idempotência, rollback integral em concorrência/timeout e logs sem telefone, inclusive timeout no COPY.
- Adaptador TypeScript compilado com esbuild sem rede; estrutura das units e orçamento dos processos conferidos. O runtime systemd não foi iniciado.
- Revisão independente somente leitura encontrou isolamento legado ambíguo, deadlines incompatíveis e dados no contexto de erro do banco. Correções: dono exclusivo; mutação em um DO de 25s com lock transacional; COPY separado do SQL e log_error_verbosity=terse somente na sessão. Erros continuam registrados; configuração global permanece intacta.

Comandos e configuração: [pacote operacional](../../../scripts/crm-status-sync/README.md). Decisões: [desenho](../../superpowers/specs/2026-11-02-impacto-crm-status-design.md). Etapas: [plano](../../superpowers/plans/2026-11-02-impacto-crm-status.md).

## Limites e próxima etapa

A origem usa paginação sem snapshot transacional. Contagens variáveis e IDs repetidos abortam; mudança simultânea de status converge na próxima execução. Não há promessa de atualização instantânea ou de limpar status removido. Limites de 25 mil registros e 8 MiB são explícitos.

Ainda não foram exercitados o endpoint novo pelo gateway público, o adaptador no Deno produtivo, o timer instalado nem a escrita real. A simulação não certifica esses componentes.

Depois de autorização específica: conferir fontes/configuração vigentes, instalar somente a API e a rotina deste piloto, validar autenticação e simulação, aplicar uma vez, conferir idempotência e ativar o timer. Sem migração nem frontend novo. Recuperação consiste em parar o timer e preservar os dados; restauração de valores exige conferência própria para não apagar alterações posteriores.
