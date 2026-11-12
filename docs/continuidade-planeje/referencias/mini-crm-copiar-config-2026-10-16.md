# Copiar configuração do Mini CRM — 16/10/2026

Josias pediu copiar status e colunas de outro cliente pelo Super Admin. Recurso publicado na aba **Super Admin → Usuários de cliente → Gerenciar logins → Mini CRM**.

O Super Admin ativo escolhe outro cliente, marca Status e cores e/ou Colunas e ordem e abre uma prévia com origem, destino, nomes e contagens. Somente Confirmar cópia grava. Sem configuração salva na origem, usa o modelo efetivo do nicho. Cancelar e trocar opções não gravam.

A origem fornece nomes, cores, ordem e opções de cartão. Itens exclusivos do destino permanecem no final. Mesmo nome com identificador diferente reaproveita a chave do destino; isso evita duplicar etapas como Em Atendimento e conserva a etapa/campo já preenchido. Se uma coluna tem tipo diferente, mantém o tipo do destino e informa na prévia. Colunas fixas continuam protegidas. Duplicidades já existentes no destino com chaves históricas distintas são preservadas; não há consolidação automática de leads. Vendedores, cadência, leads, permissões, flag de não rastreados, dados comerciais e outros módulos não são copiados.

O serviço lê novamente origem e destino antes de gravar e rejeita prévia desatualizada. UPDATE confere updated_at e cliente_id; INSERT não substitui configuração criada simultaneamente. Grava apenas os campos selecionados, no registro do destino, pelas permissões/RLS já existentes. Nenhuma migração ou ampliação de acesso. Perfil sem papel superadmin ativo é recusado pelo componente e helper. Nenhuma mensagem ou conversão é enviada.

Testes cobrem cópia parcial, modelos padrão, cores, ordem, colunas fixas, tipos conflitantes, chaves de mesmo nome, dados imutáveis, vendedor/cadência preservados, papel, prévia antiga, concorrência, inserção e erros. Cinco scripts de regressão e builds completos da fonte produtiva no Mac passaram; quatro scripts repetidos em cada candidata remota. Prévia fictícia no navegador aplicou a cópia e mostrou sucesso. Produção autenticada confirmou a seção e prévia de configurações existentes, sem confirmar cópia real. Aceite de uso e primeira cópia real permanecem com Josias.

Produção final: `index.7ff25f94.js` / `index.8ff25961.css`. Incorpora Meta Link/UTMs, correção de login e todas as entregas produtivas do Atlas. Assets anteriores preservados, inclusive `1ce7cf9a`, `dfb9d42a`, `f19ca1d1`; escritório preservado. Builds na máquina local, sem sobrecarregar a VPS. HTTP conferiu índice e assets por bytes; serviços saudáveis e Atlas ativo. Sem restart ou escrita direta em dados reais.

Release atual: `/root/planeje-releases/mini-crm-config-copy-20261016-02/candidate`. Revisão inicial preservada em `mini-crm-config-copy-20261016-01`. Três arquivos de produto novos/alterados no total; revisão final altera somente helper e componente da cópia. 932 arquivos de fonte/estáticos protegidos por hash na revisão final. Sete arquivos das duas entregas incorporados seletivamente à candidata CS `/opt/planeje-cs-integration/candidate`, com hashes conferidos; sem rebuild/SQL/restart naquele ambiente. Node indisponível no host CS, testes executados no Mac e na candidata produtiva. Assessoria/CS permanece não publicada.

Evidências privadas e capturas: `.local/mini-crm-config-copy-20261016`. Nenhuma senha, token ou dado de atendimento incluído nesta documentação.
