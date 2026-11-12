> **Referência histórica.** Consultar [a consolidação atual](../README.md) antes de retomar. Propostas, numeração de fases, contagens e próximos passos deste registro podem ter sido superados.

# Backup do Planeje — 09/09/2026

**Pacote principal criado e copiado para o Mac, com criptografia e integridade verificadas.** A coleta dos componentes originais ocorreu entre 13h41 e 13h42, horário de Brasília. Tamanho do pacote principal: 398.397.472 bytes, aproximadamente 398 MB. Depois da auditoria, foi acrescentado um complemento criptografado do serviço separado de briefing: 102.432 bytes, com 11 arquivos verificados.

Josias informou ter criado um snapshot da VPS. A existência, o conteúdo e a capacidade de restauração desse snapshot não foram verificados por esta auditoria. A restauração completa do backup também permanece pendente.

## Onde está

- Pacote principal neste diretório: `planeje-backup.tar.enc`.
- Cópia do pacote principal na VPS: `/root/backups/planeje-manual-20260909T163918Z/planeje-backup.tar.enc`.
- Complemento neste diretório, **somente no Mac**: `complemento-servico-briefing.tar.enc`. Não foi acrescentado ao arquivo principal nem copiado para a VPS.
- Chave de recuperação no Mac: `recuperacao/chave.key`, dentro deste diretório, com permissão restrita. O valor não foi incluído nos relatórios. A cópia temporária da chave na VPS foi removida.

Os dois arquivos criptografados dependem da mesma chave para serem abertos. Ao levar o backup para outro armazenamento, incluir **pacote principal, complemento e manifestos**, guardando a chave separadamente. Não publicar nem versionar a pasta de recuperação.

## O que foi protegido

- Banco principal do Supabase, incluindo dados, autenticação, objetos de Storage, funções, políticas, permissões e histórico de migrations.
- Banco auxiliar `_supabase` e configuração global de papéis/permissões.
- Arquivos locais do Storage: 123 arquivos, em pacote de aproximadamente 135 MB comprimidos.
- Fonte em `/root/planeje`, incluindo `.git` e alterações locais; build efetivamente publicado em `/var/www/planeje`.
- Stack do Supabase, funções, configurações necessárias e material de chave do banco em seu volume de configuração.
- Configurações do proxy, certificados e crons; configurações locais de serviços.
- Banco, configuração e pequenos volumes da integração Evolution/WhatsApp presente nessa VPS.
- Inventário de imagens e configuração efetiva dos containers, protegido dentro do pacote criptografado.
- No complemento: fonte e configuração, incluindo `.env`, do serviço separado `/root/planeje-briefing`, identificado na auditoria como consumidor dos status e responsáveis de tarefas. Foram verificados 11 arquivos. Essa dependência não deve ser omitida na restauração.

Foram excluídos o diretório de dados brutos do PostgreSQL em uso, `node_modules` e caches. Os bancos foram preservados por dumps lógicos; o Storage possui pacote separado. Arquivos externos apenas referenciados, como materiais no Drive, não foram baixados. Referências e vínculos existentes no banco foram preservados.

## Verificações concluídas

- Todos os comandos de coleta concluíram sem erro.
- Catálogos dos dois dumps Supabase conferidos e conteúdo integral decodificado por `pg_restore`, sem conexão a um banco de destino e sem executar SQL.
- Pacotes de arquivos conferidos no servidor.
- Hash SHA-256 da cópia no Mac idêntico ao da VPS.
- Autenticação HMAC-SHA256 e descriptografia verificadas.
- Conteúdo integral do pacote lido; tamanho e hash dos 15 componentes conferidos com o manifesto interno.
- Os arquivos locais do Storage não apresentaram mudança de tamanho/data durante a cópia.
- Complemento de briefing: tamanho de 102.432 bytes; SHA-256 e HMAC registrados; descriptografia e leitura integral do arquivo verificadas, com 11 arquivos confirmados. O complemento tem manifesto próprio e não altera a contagem dos 15 componentes originais.

Detalhes verificáveis do pacote principal: `MANIFEST-public.json`, `INVENTARIO.json` e `VERIFICACAO.json`. Verificação específica do complemento: `COMPLEMENTO-BRIEFING.json`, que registra hash, HMAC, origem, `decryption_and_full_archive_read_valid: true` e `isolated_restore_tested: false`.

## O que ainda falta na fase de proteção

**A restauração completa ainda não foi testada.** Ler o dump e verificar arquivos não comprova que o sistema inteiro voltará a funcionar. Antes das mudanças funcionais, a fase 0 prevê restaurar o pacote principal e o complemento em ambiente separado, com saída de rede para serviços reais bloqueada **antes** de iniciar processos. Crons, webhooks, notificações, lembretes, WhatsApp, publicação e campanhas reais devem permanecer sem disparo durante o teste.

A conferência deve abranger login, dados, permissões, anexos, fonte/build e serviços dependentes, incluindo `/root/planeje-briefing`. Também deve reproduzir os fluxos usados hoje: responsáveis por etapa, revisão com produtor e revisores, retorno ao último histórico A Fazer, passagem para Social, materiais e calendários. Testar reinício sem duplicar notificações nem disparar mensagens acumuladas. O [mapa de preservação](mapa-preservacao-planeje.md) descreve os contratos a conferir.

Cada dump é consistente internamente. A coleta online não é um único instante atômico entre banco, arquivos e serviços; o sistema continuou disponível. O complemento foi coletado posteriormente ao pacote principal. A recuperação das sessões ao vivo de WhatsApp/Redis também depende da homologação.

Esta é uma cópia pontual fora da VPS. Não foi criada recorrência nem alterada a retenção dos backups existentes. O destino permanente, a retenção e o prazo de recuperação serão definidos no plano.

## Informações para recuperação técnica

Formato externo: tar criptografado com AES-256-CBC, PBKDF2-HMAC-SHA256, 600.000 iterações e salt. O manifesto público registra o hash e o HMAC do arquivo criptografado. A chave de HMAC é derivada por SHA-256 de `planeje-backup-auth-v1:` seguido dos bytes da chave de recuperação sem a quebra de linha final.

Validar o hash e o HMAC de **cada arquivo**, usando seu respectivo manifesto, antes de extrair. A descriptografia usa OpenSSL com `-d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256` e `-pass file:` apontando para a mesma chave. Extrair apenas em diretório isolado; ambos contêm configurações sensíveis, e o complemento inclui `.env`. Os dois dumps Supabase estão em formato custom do PostgreSQL; o dump Evolution e os globais estão em SQL.

Não aplicar os arquivos de papéis ou dumps ao banco de produção para testar. Não subir diretamente as configurações originais num ambiente de teste conectado à rede. Preservar IDs, status legados e configuração das automações ao recuperar a operação.

O retorno de uma implantação deve ser compatível com entradas posteriores: priorizar migrações aditivas, piloto e desativação da funcionalidade nova ou retorno a uma versão compatível. **Não restaurar banco antigo para desfazer código depois de novas tarefas, comentários ou anexos terem entrado.** O procedimento de retorno que conserva esses dados deve ser ensaiado antes da implantação.

Nenhum código, configuração funcional, campanha ou dado da aplicação foi alterado para produzir este backup.
