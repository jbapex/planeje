# 🔍 Análise: Perda de Progresso ao Trocar de Abas

## 📋 Problema Identificado

Quando o usuário sai de uma aba (navega para outra rota) e volta, o componente é **desmontado e remontado**, perdendo todo o estado em memória. Mesmo que a URL seja a mesma, o React Router faz um remount completo do componente.

---

## 🔴 Causas Raiz Encontradas

### 1. **Componentes Sem Persistência de Estado**

**Problema**: Componentes mantêm estado apenas em `useState`, sem salvar em `localStorage` ou `sessionStorage`.

**Exemplos encontrados:**
- `Projects.jsx`: Estado de projetos, filtros, modo de visualização não são salvos
- `Clients.jsx`: Estado de clientes, filtros, modo de visualização não são salvos  
- `ProjectDetail.jsx`: Estado de planos de campanha, formulários não são salvos
- `Tasks.jsx`: Apenas alguns filtros são salvos, mas tarefas em edição não
- `CampaignPlanner.jsx`: Formulários complexos sem salvamento automático

**Impacto**: ✅ **ALTO** - Qualquer progresso não salvo é perdido

---

### 2. **Re-fetch de Dados a Cada Montagem**

**Problema**: Componentes fazem `fetchData()` toda vez que montam, mesmo se os dados já estiverem carregados.

**Padrão problemático encontrado:**
```javascript
useEffect(() => {
  fetchData(); // Executa TODA VEZ que o componente monta
}, [fetchData]);
```

**Exemplos:**
- `Projects.jsx` linha 84-86: Sempre busca projetos novamente
- `Clients.jsx` linha 79-83: Sempre busca clientes novamente
- `Tasks.jsx` linha 132-150: Sempre busca tarefas novamente
- `ProjectDetail.jsx`: Sempre busca detalhes do projeto novamente

**Impacto**: ✅ **ALTO** - Perde scroll, perde estado de formulários abertos, perde seleções

---

### 3. **ProtectedRoute Causa Re-renderização**

**Problema**: O `ProtectedRoute` verifica `profile` e `moduleSettings` toda vez que renderiza, potencialmente causando re-renderização dos componentes filhos.

**Código em `App.jsx` linha 37-55:**
```javascript
const ProtectedRoute = ({ children, allowedRoles, requiredModule }) => {
  const { profile, loading: authLoading } = useAuth();
  const { moduleSettings, loading: modulesLoading } = useModuleSettings();
  
  // Isso pode causar re-renderização mesmo quando valores não mudam
  if (loading) return <div>Carregando...</div>;
  
  // Validação sempre executa
  const isAllowed = profile?.role && allowedRoles.includes(profile.role);
  const isModuleEnabled = !requiredModule || moduleSettings[requiredModule] === true;
  
  if (!profile || !isAllowed || !isModuleEnabled) {
    return <Navigate to="/tasks/list" replace />;
  }
  
  return children; // Componente filho pode ser remontado
};
```

**Impacto**: ⚠️ **MÉDIO** - Pode causar flickering e re-renderizações desnecessárias

---

### 4. **HashRouter Não Preserva Estado de Componentes**

**Problema**: Mesmo usando `HashRouter` (que não recarrega a página), os componentes React ainda são **desmontados e remontados** ao navegar entre rotas.

**Comportamento atual:**
```
Usuário em /projects → Troca para /clients → Projects é desmontado (unmount)
Usuário volta para /projects → Projects é montado novamente (mount) → Estado perdido
```

**Impacto**: ✅ **ALTO** - É a causa principal da perda de estado

---

### 5. **Falta de Cache Global de Dados**

**Problema**: Não há sistema de cache global. Cada componente busca os mesmos dados repetidamente.

**Exemplo:**
- Usuário está em Projects, busca lista de clientes
- Navega para Clients, busca lista de clientes novamente
- Volta para Projects, busca lista de clientes novamente

**Impacto**: ⚠️ **MÉDIO** - Não causa perda direta, mas aumenta tempo de carregamento

---

### 6. **Formulários e Edições Sem Auto-save**

**Problema**: Formulários complexos (como `CampaignPlanner`, `ProjectDetail`) não têm auto-save para localStorage.

**Exemplos:**
- Usuário preenche "Plano de Campanha" → Sai da aba → Volta → Progresso perdido
- Usuário edita cliente → Sai da aba → Volta → Formulário fechado, dados perdidos
- Usuário está criando tarefa → Sai da aba → Volta → Formulário limpo

**Impacto**: ✅ **CRÍTICO** - Perda direta de trabalho do usuário

---

### 7. **SWR Config Não Previne Re-fetch**

**Problema**: SWR está configurado com `revalidateOnFocus: false`, mas isso não previne que componentes façam fetch manual.

**Código em `main.jsx` linha 24:**
```javascript
<SWRConfig value={{ revalidateOnFocus: false, revalidateOnReconnect: false }}>
```

**Impacto**: ⚠️ **BAIXO** - Ajuda, mas componentes fazem fetch manual de qualquer forma

---

## 📊 Resumo dos Problemas por Severidade

| Severidade | Problema | Componentes Afetados |
|------------|----------|----------------------|
| 🔴 **CRÍTICO** | Formulários sem auto-save | CampaignPlanner, ProjectDetail, ClientForm, TaskForm |
| 🔴 **ALTO** | Estado não persistido | Projects, Clients, Tasks, ProjectDetail |
| 🔴 **ALTO** | Re-fetch a cada montagem | Todos os componentes de páginas |
| 🟡 **MÉDIO** | ProtectedRoute re-renderiza | Todas as rotas protegidas |
| 🟡 **MÉDIO** | Falta de cache global | Todos os componentes |

---

## 💡 Soluções Recomendadas (Sem Implementar Ainda)

1. **Implementar auto-save em formulários** (localStorage com debounce)
2. **Criar sistema de cache global** (Context API ou SWR mais agressivo)
3. **Salvar estado de UI** (filtros, modo de visualização, scroll position)
4. **Otimizar ProtectedRoute** (memoizar para evitar re-renders)
5. **Implementar guarda de navegação** (alertar se houver dados não salvos)
6. **Usar React.memo** em componentes pesados para evitar re-renders desnecessários

---

## 🎯 Priorização

**Prioridade 1 (Crítico):**
- Auto-save em formulários de edição
- Persistência de estado em CampaignPlanner e ProjectDetail

**Prioridade 2 (Alto):**
- Cache de dados já carregados
- Persistência de filtros e modo de visualização

**Prioridade 3 (Médio):**
- Otimização do ProtectedRoute
- Memoização de componentes

