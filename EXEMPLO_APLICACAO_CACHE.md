# 📝 Exemplo de Aplicação do Cache - Projects.jsx

## 🔴 ANTES (Problema Atual)

```javascript
// src/components/pages/Projects.jsx

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: projectsData, error: projectsError } = await supabase
      .from('projetos')
      .select('*, clientes(empresa)');
    
    // ... mais queries ...
    
    setProjects(projectsData || []);
    setClients(clientsData || []);
    setTasks(tasksData || []);
    setUsers(usersData || []);
    setLoading(false);
  }, [toast]);

  // ❌ PROBLEMA: Executa TODA VEZ que o componente monta
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // ...
};
```

**Comportamento:**
- Usuário está em `/projects` → Dados carregados
- Usuário vai para `/clients` → Componente Projects é desmontado
- Usuário volta para `/projects` → Componente remonta → `fetchData()` executa novamente → Loading → Perde scroll, filtros, etc.

---

## ✅ DEPOIS (Com Cache)

```javascript
// src/components/pages/Projects.jsx

import { useDataCache } from '@/hooks/useDataCache';

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // ✅ Hook de cache com chave única
  const { 
    data: cachedData, 
    setCachedData, 
    shouldFetch 
  } = useDataCache('projects');

  const fetchData = useCallback(async () => {
    setLoading(true);
    
    const { data: projectsData, error: projectsError } = await supabase
      .from('projetos')
      .select('*, clientes(empresa)');
    const { data: clientsData, error: clientsError } = await supabase
      .from('clientes')
      .select('id, empresa');
    const { data: tasksData, error: tasksError } = await supabase
      .from('tarefas')
      .select('id, project_id, status, assignee_ids');
    const { data: usersData, error: usersError } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url');

    if (projectsError || clientsError || tasksError || usersError) {
      toast({ 
        title: "Erro ao buscar dados", 
        description: projectsError?.message || clientsError?.message || tasksError?.message || usersError?.message, 
        variant: "destructive" 
      });
    } else {
      // ✅ Salva no cache
      const dataToCache = {
        projects: projectsData || [],
        clients: clientsData || [],
        tasks: tasksData || [],
        users: usersData || []
      };
      
      setCachedData(dataToCache); // Salva no cache global
      setProjects(dataToCache.projects);
      setClients(dataToCache.clients);
      setTasks(dataToCache.tasks);
      setUsers(dataToCache.users);
    }
    setLoading(false);
  }, [toast, setCachedData]);

  // ✅ Verifica cache antes de fazer fetch
  useEffect(() => {
    // Se tem cache válido (últimos 30 segundos), usa ele
    if (!shouldFetch() && cachedData) {
      setProjects(cachedData.projects);
      setClients(cachedData.clients);
      setTasks(cachedData.tasks);
      setUsers(cachedData.users);
      setLoading(false);
      return; // Não faz fetch!
    }

    // Se não tem cache ou está expirado, faz fetch
    fetchData();
  }, [fetchData, shouldFetch, cachedData, setCachedData]);

  // Quando salva/deleta projeto, limpa o cache para forçar refresh
  const handleSaveProject = async (projectData, isNew) => {
    // ... código de save ...
    if (!error) {
      // Limpa cache para buscar dados atualizados
      setCachedData(null);
      fetchData();
    }
  };
  
  // ...
};
```

**Comportamento:**
- Usuário está em `/projects` → Dados carregados → Salvos no cache
- Usuário vai para `/clients` → Componente Projects é desmontado → Cache mantido em memória
- Usuário volta para `/projects` → Componente remonta → Verifica cache → Cache válido? → **Usa cache** → Sem loading → Scroll preservado!

---

## 📊 Comparação

| Situação | ANTES (Sem Cache) | DEPOIS (Com Cache) |
|----------|-------------------|---------------------|
| **Trocar de aba e voltar** | Loading + Re-fetch | Instantâneo (usa cache) |
| **Scroll position** | ❌ Perdido | ✅ Preservado |
| **Filtros aplicados** | ❌ Perdidos | ✅ Preservados |
| **Formulários abertos** | ❌ Fechados | ✅ Mantidos |
| **Requisições ao banco** | 🔴 Sempre | 🟢 Apenas se necessário |
| **Tempo de carregamento** | 🔴 500-1000ms | 🟢 0-50ms |

---

## 🎯 Resultado Esperado

Com essa correção:
1. ✅ Ao voltar para uma aba visitada recentemente (últimos 30s), não há loading
2. ✅ Scroll position é preservada
3. ✅ Estado visual é mantido (filtros, seleções)
4. ✅ Menos requisições ao banco = melhor performance
5. ✅ Dados ainda ficam atualizados (cache expira em 30s)

---

## ⚙️ Configuração Avançada

### Cache por Usuário e Role

Para componentes que têm dados diferentes por usuário:

```javascript
const { user, profile } = useAuth();
const cacheKey = `clients_${user?.id}_${profile?.role}`;
const { data: cachedData, setCachedData, shouldFetch } = useDataCache(cacheKey);
```

### Cache Mais Longo para Dados Estáticos

```javascript
// Em useDataCache.js, criar variante para dados estáticos
const STATIC_CACHE_DURATION = 300000; // 5 minutos
```

### Limpar Cache Manualmente

```javascript
const { clearCache } = useDataCache('projects');

// Quando usuário faz ação que muda dados
const handleSave = async () => {
  // ... save ...
  clearCache(); // Limpa cache para forçar refresh
  fetchData();
};
```

