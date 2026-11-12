# Atlas — pausa de missões automáticas — 09/10/2026

Pedido explícito de Josias: “pausar por hora a missão do altas”.

Em produção, às 20:38 de São Paulo, foi desativada apenas a preferência `atlas_settings.monitor_enabled`, usando o mesmo campo da configuração de acompanhamento da interface. O Atlas continua habilitado para conversa e pedidos manuais. Aprendizado, transcrição, memórias e histórico não foram alterados.

A fila privada do proprietário foi conferida; não havia missões aguardando ou em execução. A atualização condicional de cancelamento, equivalente ao cancelamento existente da interface, afetou zero jobs. A verificação posterior confirmou `monitor_enabled=false`, `enabled=true` e zero jobs `queued/running`.

O worker condiciona a varredura à preferência, e a RPC de enfileiramento proativo também exige `monitor_enabled=true`. Revisão diária e propostas mensais ficam pausadas sem desligar o serviço inteiro. Não há religamento agendado; retomar somente por novo pedido explícito.

Sem mudança de código, publicação de bundle, migração, reinício de serviço, WhatsApp/CAPI ou escrita operacional. Os testes pertinentes foram a conferência do código já existente e a leitura do estado persistido na produção.

Manifesto: [atlas-pausa-2026-10-09.json](../evidencias/releases/atlas-pausa-2026-10-09.json).
