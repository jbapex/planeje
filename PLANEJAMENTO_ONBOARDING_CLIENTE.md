# 📋 Planejamento: Sistema de Onboarding de Cliente Melhorado

## 🎯 Objetivo

Criar um sistema de onboarding mais intuitivo e eficiente, onde é possível:
1. **Criar tarefas diretamente no cliente** com título e data de entrega
2. **Visualizar tarefas por item** de forma clara e organizada
3. **Concluir tarefas por check** de forma simples e rápida

---

## 📊 Situação Atual

### O que já existe:
- ✅ Sistema de checklists por cliente (`client_checklists`)
- ✅ Itens dentro dos checklists com:
  - Título
  - Descrição
  - Data de entrega (`due_date`)
  - Responsável (`assignee_id`)
  - Status de conclusão (`is_completed`)
  - Data de conclusão (`completed_at`)
- ✅ Visualização em colunas (por cliente)
- ✅ Visualização em timeline
- ✅ Filtros por cliente e responsável

### Limitações atuais:
- ❌ Precisa criar um "checklist" antes de adicionar tarefas
- ❌ Interface não é tão intuitiva para criar tarefas rapidamente
- ❌ Visualização por item pode ser melhorada
- ❌ Não há uma visão consolidada de todas as tarefas de onboarding

---

## 🚀 Proposta de Melhoria

### 1. **Criação Simplificada de Tarefas**

#### Fluxo Proposto:
```
Cliente → Botão "Nova Tarefa" → Modal/Dialog → Preencher → Salvar
```

#### Campos do Formulário:
- **Título da Tarefa** (obrigatório)
  - Exemplo: "Criar capa de perfil"
- **Data de Entrega** (obrigatório)
  - Seletor de data com calendário
- **Responsável** (opcional)
  - Dropdown com lista de colaboradores
- **Descrição** (opcional)
  - Textarea para detalhes adicionais
- **Categoria/Checklist** (opcional)
  - Permitir agrupar em checklists existentes ou criar novo

#### Interface:
```
┌─────────────────────────────────────────┐
│  Nova Tarefa de Onboarding              │
├─────────────────────────────────────────┤
│                                         │
│  Título *                               │
│  [Criar capa de perfil          ]      │
│                                         │
│  Data de Entrega *                      │
│  [📅 15/01/2025              ▼]        │
│                                         │
│  Responsável                            │
│  [Selecione um responsável        ▼]   │
│                                         │
│  Descrição                              │
│  [                                    ] │
│  [                                    ] │
│                                         │
│  Agrupar em Checklist                   │
│  [Checklist existente ou novo    ▼]   │
│                                         │
│  [Cancelar]  [Criar Tarefa]            │
└─────────────────────────────────────────┘
```

---

### 2. **Visualização Melhorada por Item**

#### Opção A: Vista de Lista Consolidada
```
┌─────────────────────────────────────────────────────────────┐
│  📋 Onboarding - Todas as Tarefas                          │
├─────────────────────────────────────────────────────────────┤
│  Filtros: [Cliente ▼] [Status ▼] [Responsável ▼]          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ☑ Criar capa de perfil                                    │
│     Cliente: Cardoso Garden | 📅 15/01/2025 | 👤 João      │
│                                                             │
│  ☐ Configurar bio do Instagram                             │
│     Cliente: Cardoso Garden | 📅 20/01/2025 | 👤 Maria    │
│                                                             │
│  ☐ Criar stories de apresentação                           │
│     Cliente: Cardoso Garden | 📅 25/01/2025 | 👤 João      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Opção B: Vista por Cliente (Melhorada)
```
┌─────────────────────────────────────────────────────────────┐
│  📋 Cardoso Garden                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ☑ Criar capa de perfil                    📅 15/01/2025  │
│     Concluído em: 10/01/2025 às 14:30                     │
│                                                             │
│  ☐ Configurar bio do Instagram             📅 20/01/2025  │
│     👤 Maria | ⏰ Em 5 dias                                │
│                                                             │
│  ☐ Criar stories de apresentação           📅 25/01/2025  │
│     👤 João | ⏰ Em 10 dias                                │
│                                                             │
│  [+ Nova Tarefa]                                           │
└─────────────────────────────────────────────────────────────┘
```

#### Opção C: Vista Kanban (Por Status)
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  📋 A Fazer  │  ⏳ Em And.  │  ✅ Concluído│  ⚠️ Atrasado │
├──────────────┼──────────────┼──────────────┼──────────────┤
│              │              │              │              │
│  Criar capa  │              │  Criar logo  │              │
│  📅 15/01    │              │  ✅ 10/01     │              │
│  👤 João     │              │              │              │
│              │              │              │              │
│  [+ Nova]    │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

---

### 3. **Sistema de Check Simplificado**

#### Interação:
- **Checkbox grande e visível** ao lado de cada tarefa
- **Click no checkbox** = marcar/desmarcar como concluído
- **Feedback visual imediato**:
  - ✅ Tarefa riscada quando concluída
  - 🎉 Animação de confirmação
  - 📅 Data de conclusão exibida automaticamente

#### Comportamento:
```
Antes do check:
☐ Criar capa de perfil | 📅 15/01/2025 | 👤 João

Após o check:
☑ Criar capa de perfil | ✅ Concluído em 10/01/2025 às 14:30
   └─ Texto riscado, cor cinza
```

---

## 🎨 Design da Interface

### Tela Principal - Vista Consolidada

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Onboarding de Clientes                    [+ Nova Tarefa]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [🔍 Buscar] [Cliente: Todos ▼] [Status: Todos ▼]         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📦 Cardoso Garden                    [3/5 concluídas]│   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                     │   │
│  │ ☑ Criar capa de perfil                            │   │
│  │    ✅ Concluído em 10/01/2025 às 14:30            │   │
│  │                                                     │   │
│  │ ☐ Configurar bio do Instagram                      │   │
│  │    📅 20/01/2025 | 👤 Maria | ⏰ Em 5 dias         │   │
│  │                                                     │   │
│  │ ☐ Criar stories de apresentação                    │   │
│  │    📅 25/01/2025 | 👤 João | ⏰ Em 10 dias         │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📦 Outro Cliente                      [0/3 concluídas]│   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                     │   │
│  │ ☐ Tarefa 1                                         │   │
│  │ ☐ Tarefa 2                                         │   │
│  │ ☐ Tarefa 3                                         │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Modal de Criação de Tarefa

```
┌─────────────────────────────────────────┐
│  ✨ Nova Tarefa de Onboarding          │
├─────────────────────────────────────────┤
│                                         │
│  Cliente *                              │
│  [Cardoso Garden                  ▼]   │
│                                         │
│  Título da Tarefa *                    │
│  [Criar capa de perfil          ]      │
│                                         │
│  Data de Entrega *                      │
│  [📅 15/01/2025                  ]     │
│                                         │
│  Responsável                            │
│  [Selecione um responsável        ▼]   │
│                                         │
│  Descrição (opcional)                   │
│  [                                    ] │
│  [                                    ] │
│                                         │
│  Agrupar em Checklist                   │
│  ○ Criar novo checklist                 │
│  ● Adicionar a checklist existente     │
│    [Checklist de Redes Sociais    ▼]   │
│                                         │
│  [Cancelar]  [✨ Criar Tarefa]         │
└─────────────────────────────────────────┘
```

---

## 🗄️ Estrutura de Dados

### Tabela: `client_checklists` (mantida)
```sql
- id (UUID)
- client_id (UUID) → clientes.id
- title (VARCHAR)
- items (JSONB) → Array de itens
- owner_id (UUID) → profiles.id
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Estrutura de um Item (dentro de `items` JSONB):
```json
{
  "id": "uuid",
  "title": "Criar capa de perfil",
  "description": "Criar capa profissional para o perfil",
  "due_date": "2025-01-15T00:00:00Z",
  "assignee_id": "uuid-do-responsavel",
  "is_completed": false,
  "completed_at": null,
  "created_at": "2025-01-10T10:00:00Z"
}
```

---

## 🔄 Fluxos de Trabalho

### Fluxo 1: Criar Nova Tarefa
```
1. Usuário clica em "Nova Tarefa"
2. Modal abre com formulário
3. Usuário preenche:
   - Cliente (seleciona)
   - Título (digita)
   - Data de entrega (seleciona)
   - Responsável (opcional, seleciona)
   - Descrição (opcional, digita)
   - Checklist (opcional, seleciona ou cria novo)
4. Clica em "Criar Tarefa"
5. Sistema:
   - Se checklist selecionado: adiciona item ao checklist
   - Se "criar novo": cria novo checklist e adiciona item
   - Se nenhum: cria checklist padrão "Onboarding" e adiciona item
6. Tarefa aparece na lista
7. Toast de confirmação: "Tarefa criada com sucesso!"
```

### Fluxo 2: Visualizar Tarefas
```
1. Usuário acessa página de Onboarding
2. Sistema carrega todas as tarefas agrupadas por cliente
3. Exibe:
   - Nome do cliente
   - Progresso (X/Y concluídas)
   - Lista de tarefas com:
     - Checkbox
     - Título
     - Data de entrega
     - Responsável (se houver)
     - Status (concluído/em aberto/atrasado)
4. Usuário pode filtrar por cliente, status, responsável
```

### Fluxo 3: Concluir Tarefa
```
1. Usuário clica no checkbox da tarefa
2. Sistema:
   - Marca como concluída (is_completed = true)
   - Salva data/hora de conclusão (completed_at = now())
   - Atualiza contador de progresso
3. Interface:
   - Tarefa fica riscada
   - Cor muda para cinza
   - Mostra "Concluído em DD/MM/YYYY às HH:mm"
   - Animação de confirmação (opcional)
4. Toast: "Tarefa concluída!"
```

### Fluxo 4: Desfazer Conclusão
```
1. Usuário clica no checkbox de tarefa concluída
2. Sistema:
   - Marca como não concluída (is_completed = false)
   - Remove data de conclusão (completed_at = null)
   - Atualiza contador de progresso
3. Interface:
   - Tarefa volta ao normal
   - Remove riscado
   - Volta cor original
```

---

## 🎯 Funcionalidades Principais

### 1. Criação Rápida de Tarefas
- ✅ Botão "Nova Tarefa" sempre visível
- ✅ Modal simples e rápido de preencher
- ✅ Validação de campos obrigatórios
- ✅ Auto-save em checklist padrão se não especificado

### 2. Visualização Intuitiva
- ✅ Agrupamento por cliente
- ✅ Indicador de progresso (X/Y concluídas)
- ✅ Status visual claro (concluído/em aberto/atrasado)
- ✅ Informações importantes sempre visíveis (data, responsável)

### 3. Conclusão Simples
- ✅ Checkbox grande e fácil de clicar
- ✅ Feedback visual imediato
- ✅ Possibilidade de desfazer
- ✅ Histórico de conclusão

### 4. Filtros e Busca
- ✅ Filtrar por cliente
- ✅ Filtrar por status (todas/concluídas/em aberto/atrasadas)
- ✅ Filtrar por responsável
- ✅ Busca por texto (título da tarefa)

---

## 📱 Responsividade

### Desktop (> 768px)
- Vista em colunas ou lista expandida
- Modal centralizado
- Filtros em linha horizontal

### Mobile (< 768px)
- Vista em lista vertical
- Modal fullscreen ou bottom sheet
- Filtros em dropdowns empilhados
- Checkbox maior para facilitar toque

---

## 🚦 Prioridades de Implementação

### Fase 1: MVP (Essencial)
1. ✅ Botão "Nova Tarefa" na página principal
2. ✅ Modal de criação simplificado
3. ✅ Visualização por cliente melhorada
4. ✅ Sistema de check funcional
5. ✅ Indicador de progresso

### Fase 2: Melhorias (Importante)
1. ✅ Filtros avançados
2. ✅ Busca por texto
3. ✅ Vista Kanban (opcional)
4. ✅ Notificações de tarefas atrasadas
5. ✅ Exportação de relatório

### Fase 3: Avançado (Opcional)
1. ✅ Templates de onboarding
2. ✅ Tarefas recorrentes
3. ✅ Integração com WhatsApp (notificações)
4. ✅ Dashboard de métricas
5. ✅ Histórico completo de alterações

---

## 🎨 Componentes Necessários

### Novos Componentes:
1. **`CreateOnboardingTaskDialog`**
   - Modal para criar nova tarefa
   - Formulário com validação

2. **`OnboardingTaskItem`** (melhorado)
   - Item de tarefa com checkbox grande
   - Informações visuais claras
   - Ações rápidas (editar, excluir)

3. **`OnboardingClientCard`** (melhorado)
   - Card por cliente
   - Indicador de progresso
   - Lista de tarefas

4. **`OnboardingFilters`**
   - Barra de filtros
   - Busca por texto

### Componentes Existentes (reutilizar):
- `Dialog` (shadcn/ui)
- `Input` (shadcn/ui)
- `Button` (shadcn/ui)
- `Checkbox` (shadcn/ui)
- `Calendar` (shadcn/ui)
- `Select` (shadcn/ui)

---

## 🔧 Alterações Técnicas Necessárias

### Frontend:
1. Atualizar `Onboarding.jsx`:
   - Adicionar botão "Nova Tarefa"
   - Criar componente `CreateOnboardingTaskDialog`
   - Melhorar componente `OnboardingTaskItem`
   - Adicionar filtros e busca
   - Melhorar visualização

2. Criar novos componentes:
   - `CreateOnboardingTaskDialog.jsx`
   - `OnboardingFilters.jsx` (se necessário)

### Backend:
- ✅ Nenhuma alteração necessária (usar estrutura existente)
- ✅ Apenas ajustar lógica de criação/atualização

---

## 📝 Exemplos de Uso

### Cenário 1: Criar Tarefa Rápida
```
1. Usuário está na página de Onboarding
2. Clica em "Nova Tarefa"
3. Seleciona cliente "Cardoso Garden"
4. Digita "Criar capa de perfil"
5. Seleciona data: 15/01/2025
6. Clica "Criar Tarefa"
7. Tarefa aparece imediatamente na lista
```

### Cenário 2: Concluir Tarefa
```
1. Usuário vê tarefa "Criar capa de perfil"
2. Clica no checkbox
3. Tarefa fica riscada e mostra "Concluído em 10/01/2025 às 14:30"
4. Contador de progresso atualiza: "1/3 concluídas"
```

### Cenário 3: Filtrar Tarefas
```
1. Usuário seleciona filtro "Atrasadas"
2. Sistema mostra apenas tarefas com data de entrega passada e não concluídas
3. Usuário pode ver rapidamente o que precisa de atenção
```

---

## ✅ Checklist de Implementação

- [ ] Criar componente `CreateOnboardingTaskDialog`
- [ ] Adicionar botão "Nova Tarefa" na página principal
- [ ] Melhorar componente `OnboardingTaskItem` com checkbox grande
- [ ] Adicionar indicador de progresso por cliente
- [ ] Implementar filtros (cliente, status, responsável)
- [ ] Adicionar busca por texto
- [ ] Melhorar visualização de tarefas concluídas
- [ ] Adicionar feedback visual ao concluir tarefa
- [ ] Testar responsividade mobile
- [ ] Adicionar validações de formulário
- [ ] Testar criação/edição/exclusão de tarefas
- [ ] Documentar mudanças

---

## 🎯 Resultado Esperado

Após a implementação, o sistema de onboarding deve ser:
- ✅ **Mais rápido**: Criar tarefas em poucos cliques
- ✅ **Mais visual**: Ver progresso e status claramente
- ✅ **Mais intuitivo**: Checkbox grande, feedback imediato
- ✅ **Mais organizado**: Filtros e busca facilitam encontrar tarefas
- ✅ **Mais eficiente**: Menos cliques, menos telas, mais produtividade

---

## 💡 Próximos Passos

1. **Revisar este planejamento** com o time
2. **Validar design** com usuários
3. **Priorizar funcionalidades** (MVP primeiro)
4. **Começar implementação** pela Fase 1
5. **Testar e iterar** baseado em feedback

---

**Data de Criação:** 2025-01-10  
**Última Atualização:** 2025-01-10  
**Status:** 📝 Planejamento

