# 🔧 Correção: Re-fetch a Cada Montagem

## 📊 Análise do Problema

### Situação Atual

Todos os componentes principais fazem fetch **toda vez que são montados**, mesmo que os dados já tenham sido carregados recentemente:

```javascript
// ❌ PADRÃO PROBLEMÁTICO (encontrado em todos os componentes)
useEffect(() => {
  fetchData(); // Executa SEMPRE que o componente monta
}, [fetchData]);
```

### Componentes Afetados

| Componente | Linha | Problema |
|------------|-------|----------|
| `Projects.jsx` | 84-86 | Sempre busca projetos, clientes, tarefas e usuários |
| `Clients.jsx` | 79-83 | Sempre busca clientes e usuários |
| `Tasks.jsx` | 132-134 | Sempre busca tarefas, clientes, projetos e usuários |
| `ProjectDetail.jsx` | 81-83 | Sempre busca projeto, cliente, tarefas e plano de campanha |
| `Dashboard.jsx` | - | Sempre busca dados de dashboard |
| `Requests.jsx` | 59-71 | Sempre busca solicitações, clientes e projetos |

### Impacto

1. **Perda de scroll position**: Ao voltar para a página, scroll volta ao topo
2. **Perda de estado visual**: Formulários abertos, seleções, filtros aplicados
3. **Performance**: Requisições desnecessárias ao banco
4. **Experiência ruim**: Usuário vê loading toda vez que troca de aba

---

## ✅ Solução Proposta

### Abordagem: Cache em Memória + Verificação de Timestamp

Criar um sistema de cache simples que:
- Armazena dados em memória (durante a sessão)
- Verifica se os dados são recentes (últimos 30 segundos)
- Só faz fetch se dados estão antigos ou ausentes

### Implementação

#### 1. Criar Hook de Cache (`useDataCache.js`)

```javascript
// src/hooks/useDataCache.js
import { useState, useRef, useCallback } from 'react';

const CACHE_DURATION = 30000; // 30 segundos
const cache = new Map(); // Cache global compartilhado

export const useDataCache = (cacheKey) => {
  const [data, setData] = useState(() => {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  });

  const setCachedData = useCallback((newData) => {
    cache.set(cacheKey, {
      data: newData,
      timestamp: Date.now()
    });
    setData(newData);
  }, [cacheKey]);

  const shouldFetch = useCallback(() => {
    const cached = cache.get(cacheKey);
    if (!cached) return true; // Não tem cache, precisa buscar
    if (Date.now() - cached.timestamp >= CACHE_DURATION) return true; // Cache expirado
    return false; // Tem cache válido
  }, [cacheKey]);

  const getCachedData = useCallback(() => {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, [cacheKey]);

  const clearCache = useCallback(() => {
    cache.delete(cacheKey);
    setData(null);
  }, [cacheKey]);

  return {
    data,
    setCachedData,
    shouldFetch,
    getCachedData,
    clearCache
  };
};
```

#### 2. Modificar `Projects.jsx`

**ANTES:**
```javascript
useEffect(() => {
  fetchData();
}, [fetchData]);
```

**DEPOIS:**
```javascript
const { data: cachedData, setCachedData, shouldFetch } = useDataCache('projects');

useEffect(() => {
  // Se tem cache válido, usa ele
  if (!shouldFetch() && cachedData) {
    setProjects(cachedData.projects);
    setClients(cachedData.clients);
    setTasks(cachedData.tasks);
    setUsers(cachedData.users);
    setLoading(false);
    return;
  }

  // Se não tem cache ou está expirado, faz fetch
  fetchData();
}, [fetchData, shouldFetch, cachedData, setCachedData]);

// Modificar fetchData para salvar no cache
const fetchData = useCallback(async () => {
  setLoading(true);
  // ... código de fetch atual ...
  
  if (!projectsError && !clientsError && !tasksError && !usersError) {
    const dataToCache = {
      projects: projectsData || [],
      clients: clientsData || [],
      tasks: tasksData || [],
      users: usersData || []
    };
    setCachedData(dataToCache);
    setProjects(dataToCache.projects);
    setClients(dataToCache.clients);
    setTasks(dataToCache.tasks);
    setUsers(dataToCache.users);
  }
  setLoading(false);
}, [toast, setCachedData]);
```

#### 3. Modificar `Clients.jsx`

**ANTES:**
```javascript
useEffect(() => {
  if (!authLoading) {
    fetchClients();
  }
}, [fetchClients, authLoading]);
```

**DEPOIS:**
```javascript
const { data: cachedData, setCachedData, shouldFetch } = useDataCache(`clients_${user?.id}_${userRole}`);

useEffect(() => {
  if (authLoading) return;
  
  // Se tem cache válido, usa ele
  if (!shouldFetch() && cachedData) {
    setClients(cachedData.clients);
    setUsers(cachedData.users);
    setLoading(false);
    return;
  }

  // Se não tem cache ou está expirado, faz fetch
  fetchClients();
}, [fetchClients, authLoading, shouldFetch, cachedData, setCachedData, user?.id, userRole]);
```

#### 4. Modificar `Tasks.jsx`

**ANTES:**
```javascript
useEffect(() => {
  if(user) {
    fetchData();
    // ... realtime subscription ...
  }
}, [fetchData, user, supabase]);
```

**DEPOIS:**
```javascript
const { data: cachedData, setCachedData, shouldFetch } = useDataCache(`tasks_${user?.id}_${userRole}`);

useEffect(() => {
  if (!user) return;
  
  // Se tem cache válido, usa ele
  if (!shouldFetch() && cachedData) {
    setTasks(cachedData.tasks);
    setClients(cachedData.clients);
    setProjects(cachedData.projects);
    setUsers(cachedData.users);
    setStatusOptions(cachedData.statusOptions);
    setLoading(false);
    
    // Ainda configura realtime (mas não faz fetch inicial)
    const channel = supabase.channel('realtime-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setTasks(currentTasks => 
            currentTasks.map(task => 
              task.id === payload.new.id ? { ...task, ...payload.new } : task
            )
          );
        } else {
          fetchData(); // Só busca se houver mudança no banco
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }

  // Se não tem cache ou está expirado, faz fetch
  fetchData();
  const channel = supabase.channel('realtime-tasks')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, (payload) => {
      if (payload.eventType === 'UPDATE') {
        setTasks(currentTasks => 
          currentTasks.map(task => 
            task.id === payload.new.id ? { ...task, ...payload.new } : task
          )
        );
      } else {
        fetchData();
      }
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}, [fetchData, user, supabase, shouldFetch, cachedData, setCachedData]);
```

#### 5. Modificar `ProjectDetail.jsx`

**ANTES:**
```javascript
useEffect(() => {
  fetchData();
}, [fetchData]);
```

**DEPOIS:**
```javascript
const { data: cachedData, setCachedData, shouldFetch } = useDataCache(`project_${id}`);

useEffect(() => {
  // Se tem cache válido, usa ele
  if (!shouldFetch() && cachedData) {
    setProject(cachedData.project);
    setClient(cachedData.client);
    setClients(cachedData.clients);
    setTasks(cachedData.tasks);
    setCampaignPlan(cachedData.campaignPlan);
    setLoading(false);
    return;
  }

  // Se não tem cache ou está expirado, faz fetch
  fetchData();
}, [fetchData, id, shouldFetch, cachedData, setCachedData]);
```

---

## 🎯 Benefícios da Solução

1. ✅ **Preserva estado**: Scroll, seleções, formulários abertos
2. ✅ **Melhora performance**: Reduz requisições desnecessárias
3. ✅ **Melhor UX**: Sem loading ao voltar para página recente
4. ✅ **Mantém dados atualizados**: Cache expira em 30 segundos
5. ✅ **Funciona com Realtime**: Supabase realtime ainda atualiza dados

---

## ⚙️ Configuração

### Duração do Cache

Ajustável no hook `useDataCache.js`:
- `CACHE_DURATION = 30000` (30 segundos) - Padrão recomendado
- `CACHE_DURATION = 60000` (1 minuto) - Mais agressivo
- `CACHE_DURATION = 15000` (15 segundos) - Mais atualizado

### Limpeza de Cache

O cache é limpo automaticamente quando:
- Dados são atualizados manualmente (save/delete)
- Cache expira (após 30 segundos)
- Usuário faz logout

---

## 📝 Notas de Implementação

1. **Realtime ainda funciona**: Mesmo com cache, Supabase realtime continua atualizando dados em tempo real
2. **Cache por usuário**: Cada usuário tem seu próprio cache (baseado em user.id)
3. **Cache por role**: Diferentes roles podem ter dados diferentes (colaborador vs admin)
4. **Limpeza automática**: Cache expira automaticamente, não precisa limpar manualmente

---

## 🚀 Ordem de Implementação Recomendada

1. Criar hook `useDataCache.js`
2. Aplicar em `Projects.jsx` (mais simples)
3. Aplicar em `Clients.jsx`
4. Aplicar em `Tasks.jsx` (mais complexo por causa do realtime)
5. Aplicar em `ProjectDetail.jsx`
6. Testar navegação entre abas

---

## ⚠️ Cuidados

- **Realtime**: Garantir que subscription continue funcionando
- **Dados sensíveis**: Cache não deve expor dados entre usuários
- **Performance**: Cache em memória é rápido, mas cresce com uso
- **Testes**: Testar especialmente troca rápida entre abas

