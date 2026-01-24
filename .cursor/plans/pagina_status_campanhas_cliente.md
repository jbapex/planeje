# Página de Status das Campanhas para Cliente

## Objetivo
Criar uma nova página na área do cliente que exiba todas as tarefas/campanhas relacionadas a ele, organizadas por status, mostrando:
- O que foi feito (publicado)
- O que está em produção (em produção, em revisão, aguardando aprovação)
- O que está agendado
- O que está para fazer
- O que está bloqueado

## Estrutura da Página

### 1. Componente Principal
**Arquivo**: `src/components/pages/ClientCampaignsStatus.jsx`

### 2. Funcionalidades

#### Buscar Tarefas do Cliente
- Buscar todas as tarefas da tabela `tarefas` onde `client_id` = `profile.cliente_id`
- Incluir todos os tipos: `arte`, `video`, `post`, `reels`, `story`, `social_media`
- Incluir todos os status (não filtrar)
- Buscar informações relacionadas: `projetos(name)`, `clientes(empresa)`

#### Organização por Status
Agrupar tarefas pelos seguintes status:
- **Publicado** (`published`) - O que foi feito
- **Agendado** (`scheduled`) - O que está agendado para publicação
- **Em Produção** (`production`) - Em produção
- **Em Revisão** (`review`) - Em revisão
- **Aguardando Aprovação** (`approve`) - Aguardando aprovação do cliente
- **A Fazer** (`todo`) - Para fazer
- **Bloqueado** (`blocked`) - Bloqueado
- **Pendente** (`pending`) - Pendente
- **Standby** (`standby`) - Em espera

#### Visualização
- Cards por status com contador de tarefas
- Lista de tarefas dentro de cada card
- Informações exibidas por tarefa:
  - Título
  - Tipo (Vídeo, Arte, Post, Reels, Story)
  - Data de vencimento/agendamento
  - Projeto (se houver)
  - Status com badge colorido
- Filtros:
  - Por tipo de tarefa
  - Por projeto
  - Por período (últimos 30 dias, mês atual, etc)
- Busca por título

### 3. Design Visual

#### Layout
- Header com título "Status das Campanhas" e descrição
- Filtros no topo (tipo, projeto, período)
- Grid de cards por status (2-3 colunas em desktop, 1 em mobile)
- Cada card com:
  - Header com nome do status e contador
  - Lista scrollável de tarefas
  - Altura máxima para evitar expansão excessiva

#### Cores por Status
- Publicado: Verde
- Agendado: Roxo
- Em Produção: Azul
- Em Revisão: Amarelo
- Aguardando Aprovação: Laranja
- A Fazer: Cinza
- Bloqueado: Vermelho
- Pendente: Amarelo escuro
- Standby: Cinza claro

### 4. Integração com Rotas

#### Adicionar Rota
**Arquivo**: `src/App.jsx`
- Adicionar rota `/cliente/campaigns-status` dentro do `MainLayoutCliente`
- Adicionar rota `/client-area/campaigns-status` para admins

#### Adicionar ao Menu
**Arquivo**: `src/components/client/SidebarCliente.jsx`
- Adicionar item de menu "Status das Campanhas" ou "Produção"
- Ícone: `CheckCircle2` ou `ClipboardList` do lucide-react
- Posicionar após "Cadastro Diário" ou antes de "ApexIA"

### 5. Estrutura de Dados

```javascript
// Exemplo de estrutura de dados
{
  published: [{ tarefa1 }, { tarefa2 }],
  scheduled: [{ tarefa3 }],
  production: [{ tarefa4 }],
  review: [],
  approve: [],
  todo: [],
  blocked: [],
  pending: [],
  standby: []
}
```

### 6. Componentes Auxiliares

#### Card de Status
- Componente reutilizável para cada status
- Props: `status`, `tasks`, `color`, `label`
- Scroll interno quando há muitas tarefas

#### Item de Tarefa
- Componente para exibir cada tarefa
- Mostrar: título, tipo, data, projeto
- Badge de status
- Link para detalhes (se necessário)

## Arquivos a Criar/Modificar

1. **Criar**: `src/components/pages/ClientCampaignsStatus.jsx`
2. **Modificar**: `src/App.jsx` - Adicionar rotas
3. **Modificar**: `src/components/client/SidebarCliente.jsx` - Adicionar item de menu

## Status de Tarefas (baseado em STATUS_INFO)

- `todo`: A Fazer (cinza)
- `production`: Em Produção (azul)
- `review`: Em Revisão (amarelo)
- `approve`: Aprovar Cliente (laranja)
- `scheduled`: Agendado (roxo)
- `published`: Publicado (verde)
- `pending`: Pendente (amarelo escuro)
- `blocked`: Bloqueado (vermelho)
- `standby`: Standby (cinza claro)
