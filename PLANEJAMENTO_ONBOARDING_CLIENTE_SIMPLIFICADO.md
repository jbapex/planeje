# 📋 Planejamento: Sistema de Onboarding Simplificado (Inline)

## 🎯 Objetivo

Criar um sistema de onboarding **ultra-simples e inline**, onde:
1. **Tarefas e subtarefas** ficam na mesma linha
2. **Tudo é editável inline** (sem modais)
3. **Ícones ilustram ações** e informações
4. **Zero cliques extras** - tudo visível e editável diretamente

---

## 🎨 Design Simplificado

### Visualização Principal - Tudo Inline

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Onboarding - Cardoso Garden          [+ Nova Tarefa]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ☑ Criar capa de perfil                                    │
│    📅 15/01 | 👤 João | ✅ 10/01 14:30                    │
│                                                             │
│  ☐ Configurar bio do Instagram                             │
│    📅 20/01 | 👤 Maria | ⏰ Em 5 dias                      │
│    └─ ☐ Adicionar link do site                             │
│    └─ ☐ Adicionar call-to-action                           │
│                                                             │
│  ☐ Criar stories de apresentação                           │
│    📅 25/01 | 👤 João | ⏰ Em 10 dias                     │
│    └─ ☑ Story 1: Apresentação                              │
│    └─ ☐ Story 2: Produtos                                  │
│    └─ ☐ Story 3: Depoimentos                               │
│                                                             │
│  [+ Adicionar Tarefa]                                      │
└─────────────────────────────────────────────────────────────┘
```

### Tarefa Inline - Tudo Editável na Mesma Linha

```
┌─────────────────────────────────────────────────────────────┐
│  ☐ [Título da tarefa editável aqui]                        │
│     📅 [15/01/2025] 👤 [João ▼] ➕ 📝 🗑️                  │
│                                                             │
│  └─ ☐ [Subtarefa 1 editável]                              │
│     📅 [20/01/2025] 👤 [Maria ▼] ➕ 📝 🗑️                 │
│                                                             │
│  └─ ☐ [Subtarefa 2 editável]                              │
│     📅 [25/01/2025] 👤 [João ▼] ➕ 📝 🗑️                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔤 Legenda de Ícones

| Ícone | Significado | Ação |
|-------|------------|------|
| ☐ / ☑ | Checkbox | Marcar/desmarcar tarefa |
| 📅 | Data | Editar data de entrega (inline) |
| 👤 | Responsável | Selecionar responsável (dropdown inline) |
| ✅ | Concluído | Data de conclusão |
| ⏰ | Tempo | Dias restantes ou atrasado |
| ➕ | Adicionar | Adicionar subtarefa |
| 📝 | Notas | Adicionar nota/comentário (tooltip ou inline) |
| 🗑️ | Excluir | Excluir tarefa |
| 🔽 | Expandir | Mostrar subtarefas |
| 🔼 | Recolher | Ocultar subtarefas |

---

## 🎯 Funcionalidades Inline

### 1. Edição de Título
```
Estado Normal:
☐ Criar capa de perfil

Ao Clicar:
☐ [Criar capa de perfil          ] ← Input inline
   └─ Pressionar Enter ou clicar fora = salvar
```

### 2. Edição de Data
```
Estado Normal:
📅 15/01/2025

Ao Clicar:
📅 [15/01/2025] ← Input de data ou calendário popover
   └─ Calendário aparece abaixo, seleciona e fecha
```

### 3. Seleção de Responsável
```
Estado Normal:
👤 João

Ao Clicar:
👤 [João ▼] ← Dropdown inline
   └─ Lista aparece abaixo, seleciona e fecha
```

### 4. Adicionar Subtarefa
```
Estado Normal:
☐ Tarefa Principal
   └─ [Nenhuma subtarefa]

Ao Clicar em ➕:
☐ Tarefa Principal
   └─ ☐ [Nova subtarefa          ] ← Input inline
      └─ Pressionar Enter = criar subtarefa
```

### 5. Adicionar Nota/Comentário
```
Estado Normal:
☐ Tarefa Principal 📝

Ao Clicar em 📝:
☐ Tarefa Principal
   └─ 💬 [Digite sua nota aqui...] ← Textarea inline
      └─ Botão "Salvar" ou Enter = salvar nota
      └─ Nota aparece como tooltip ao passar mouse
```

---

## 📐 Estrutura Visual Detalhada

### Tarefa Principal (Expandida)

```
┌─────────────────────────────────────────────────────────────┐
│  ☐ Criar capa de perfil                                    │
│     📅 15/01/2025 | 👤 João | ⏰ Em 5 dias                 │
│     ➕ 📝 🗑️ 🔽                                             │
│                                                             │
│  └─ ☐ Adicionar logo da empresa                            │
│     📅 12/01/2025 | 👤 João | ⏰ Em 2 dias                │
│     ➕ 📝 🗑️                                                 │
│                                                             │
│  └─ ☐ Escolher cores da marca                              │
│     📅 13/01/2025 | 👤 Maria | ⏰ Em 3 dias               │
│     ➕ 📝 🗑️                                                 │
│                                                             │
│  └─ ☐ Revisar e aprovar                                     │
│     📅 15/01/2025 | 👤 João | ⏰ Em 5 dias                │
│     ➕ 📝 🗑️                                                 │
│                                                             │
│  [+ Adicionar Subtarefa]                                    │
└─────────────────────────────────────────────────────────────┘
```

### Tarefa Concluída

```
┌─────────────────────────────────────────────────────────────┐
│  ☑ Criar capa de perfil                                    │
│     ✅ Concluído em 10/01/2025 às 14:30                    │
│     👤 João | 📝 💬 🗑️ 🔼                                   │
│                                                             │
│  └─ ☑ Adicionar logo da empresa                            │
│     ✅ Concluído em 10/01/2025 às 10:00                    │
│                                                             │
│  └─ ☑ Escolher cores da marca                               │
│     ✅ Concluído em 09/01/2025 às 16:00                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🖱️ Interações Inline

### Criar Nova Tarefa Principal

```
1. Clica em [+ Nova Tarefa]
2. Aparece linha nova:
   ☐ [Digite o título da tarefa...]
   📅 [Hoje] 👤 [Selecione ▼] ➕ 📝 🗑️
3. Digita título e pressiona Enter
4. Tarefa é criada e fica editável
```

### Criar Subtarefa

```
1. Clica em ➕ ao lado da tarefa principal
2. Aparece subtarefa inline:
   └─ ☐ [Digite o título da subtarefa...]
      📅 [Mesma data da principal] 👤 [Mesmo responsável]
3. Digita título e pressiona Enter
4. Subtarefa é criada
```

### Editar Título

```
1. Clica no título da tarefa
2. Título vira input editável
3. Digita novo título
4. Pressiona Enter ou clica fora = salva
```

### Editar Data

```
1. Clica no ícone 📅 ou na data
2. Aparece calendário popover abaixo
3. Seleciona nova data
4. Calendário fecha e data atualiza
```

### Selecionar Responsável

```
1. Clica no ícone 👤 ou no nome
2. Aparece dropdown abaixo com lista de colaboradores
3. Seleciona responsável
4. Dropdown fecha e nome atualiza
```

### Adicionar Nota

```
1. Clica no ícone 📝
2. Aparece textarea inline abaixo da tarefa:
   💬 [Digite sua nota aqui...]
   [Salvar] [Cancelar]
3. Digita nota e clica "Salvar"
4. Nota é salva e ícone 📝 fica destacado
5. Ao passar mouse no ícone, mostra tooltip com a nota
```

### Marcar como Concluído

```
1. Clica no checkbox ☐
2. Tarefa fica riscada
3. Data de conclusão aparece automaticamente
4. Ícones mudam (remove ➕, adiciona ✅)
```

---

## 🎨 Componentes Visuais

### Linha de Tarefa (Compacta)

```
┌─────────────────────────────────────────────────────────────┐
│  [☐] [Título editável] [📅 Data] [👤 Responsável] [Ações] │
└─────────────────────────────────────────────────────────────┘
```

### Linha de Tarefa (Expandida com Subtarefas)

```
┌─────────────────────────────────────────────────────────────┐
│  [☐] [Título editável] [📅 Data] [👤 Responsável] [Ações] │
│  │                                                           │
│  └─ [☐] [Subtarefa 1] [📅] [👤] [Ações]                    │
│  └─ [☐] [Subtarefa 2] [📅] [👤] [Ações]                    │
│  └─ [+ Adicionar Subtarefa]                                │
└─────────────────────────────────────────────────────────────┘
```

### Barra de Ações (Sempre Visível)

```
[➕] Adicionar subtarefa
[📝] Adicionar nota/comentário
[🗑️] Excluir tarefa
[🔽/🔼] Expandir/recolher subtarefas
```

---

## 📱 Responsividade Mobile

### Desktop (> 768px)
```
☐ Tarefa Principal
  📅 15/01 | 👤 João | ⏰ Em 5 dias | ➕ 📝 🗑️ 🔽
```

### Mobile (< 768px)
```
☐ Tarefa Principal
  📅 15/01
  👤 João
  ⏰ Em 5 dias
  ➕ 📝 🗑️ 🔽
```

---

## 🗄️ Estrutura de Dados (Simplificada)

### Item de Tarefa (JSONB)
```json
{
  "id": "uuid",
  "title": "Criar capa de perfil",
  "due_date": "2025-01-15T00:00:00Z",
  "assignee_id": "uuid-do-responsavel",
  "is_completed": false,
  "completed_at": null,
  "note": "Lembrar de usar cores da marca",
  "subtasks": [
    {
      "id": "uuid-subtask-1",
      "title": "Adicionar logo",
      "due_date": "2025-01-12T00:00:00Z",
      "assignee_id": "uuid-do-responsavel",
      "is_completed": false,
      "completed_at": null,
      "note": null
    }
  ],
  "created_at": "2025-01-10T10:00:00Z"
}
```

---

## 🚀 Implementação Simplificada

### Componente Principal: `OnboardingTaskItem`

```jsx
<OnboardingTaskItem
  task={task}
  onUpdate={handleUpdate}
  onDelete={handleDelete}
  onAddSubtask={handleAddSubtask}
  profiles={profiles}
/>
```

### Funcionalidades do Componente:

1. **Renderização Inline**
   - Título editável (input quando clicado)
   - Data editável (popover calendário)
   - Responsável editável (dropdown)
   - Checkbox para marcar conclusão

2. **Ações Rápidas**
   - ➕ Adicionar subtarefa (inline)
   - 📝 Adicionar nota (textarea inline)
   - 🗑️ Excluir (confirmação rápida)

3. **Subtarefas**
   - Renderizadas inline abaixo da tarefa principal
   - Mesma estrutura de edição
   - Indentação visual (└─)

---

## ✅ Checklist de Implementação

### Fase 1: Estrutura Básica
- [ ] Criar componente `OnboardingTaskItem` inline
- [ ] Implementar edição de título inline
- [ ] Implementar checkbox de conclusão
- [ ] Mostrar data e responsável inline

### Fase 2: Edições Inline
- [ ] Edição de data com calendário popover
- [ ] Seleção de responsável com dropdown inline
- [ ] Adicionar nota com textarea inline
- [ ] Tooltip para mostrar nota salva

### Fase 3: Subtarefas
- [ ] Botão ➕ para adicionar subtarefa
- [ ] Renderizar subtarefas inline abaixo da principal
- [ ] Edição inline de subtarefas
- [ ] Indentação visual (└─)

### Fase 4: Ações e Melhorias
- [ ] Botão 🗑️ para excluir (com confirmação)
- [ ] Botão 🔽/🔼 para expandir/recolher
- [ ] Indicador de progresso (X/Y subtarefas concluídas)
- [ ] Status visual (atrasado, em dia, concluído)

---

## 🎯 Resultado Final Esperado

### Antes (Complexo):
```
1. Clicar em "Editar"
2. Abrir modal
3. Preencher formulário
4. Clicar "Salvar"
5. Modal fecha
6. Ver mudanças
```

### Depois (Simplificado):
```
1. Clicar no campo
2. Editar inline
3. Pressionar Enter
4. Pronto! ✅
```

---

## 💡 Princípios do Design

1. **Zero Modais**: Tudo inline, nada de abrir/fechar diálogos
2. **Ícones Claros**: Cada ação tem um ícone intuitivo
3. **Edição Direta**: Clicar = editar, sem passos extras
4. **Feedback Imediato**: Mudanças aparecem na hora
5. **Visual Limpo**: Tudo na mesma linha, organizado
6. **Ações Rápidas**: Um clique para tudo

---

## 🎨 Exemplo Visual Completo

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Onboarding - Cardoso Garden          [+ Nova Tarefa]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ☑ Criar capa de perfil                                    │
│     📅 15/01/2025 | 👤 João | ✅ 10/01 14:30              │
│     📝 💬 🗑️ 🔼                                            │
│                                                             │
│  ☐ Configurar bio do Instagram                             │
│     📅 20/01/2025 | 👤 Maria | ⏰ Em 5 dias               │
│     ➕ 📝 🗑️ 🔽                                            │
│     └─ ☐ Adicionar link do site                            │
│        📅 18/01/2025 | 👤 Maria | ⏰ Em 3 dias            │
│        ➕ 📝 🗑️                                             │
│     └─ ☐ Adicionar call-to-action                          │
│        📅 20/01/2025 | 👤 Maria | ⏰ Em 5 dias            │
│        ➕ 📝 🗑️                                             │
│     └─ [+ Adicionar Subtarefa]                             │
│                                                             │
│  ☐ Criar stories de apresentação                           │
│     📅 25/01/2025 | 👤 João | ⏰ Em 10 dias               │
│     ➕ 📝 🗑️ 🔽                                            │
│     └─ ☑ Story 1: Apresentação                             │
│        ✅ 08/01/2025 às 10:00                              │
│     └─ ☐ Story 2: Produtos                                 │
│        📅 20/01/2025 | 👤 João | ⏰ Em 5 dias             │
│        ➕ 📝 🗑️                                             │
│     └─ ☐ Story 3: Depoimentos                             │
│        📅 25/01/2025 | 👤 João | ⏰ Em 10 dias             │
│        ➕ 📝 🗑️                                             │
│     └─ [+ Adicionar Subtarefa]                             │
│                                                             │
│  [+ Adicionar Tarefa]                                      │
└─────────────────────────────────────────────────────────────┘
```

---

**Data de Criação:** 2025-01-10  
**Última Atualização:** 2025-01-10  
**Status:** 📝 Planejamento Simplificado - Pronto para Implementação

