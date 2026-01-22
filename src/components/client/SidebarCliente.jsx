import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FileText, Activity, LogOut, User, Info, TrendingUp, ArrowLeft, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { motion } from 'framer-motion';

// Função para determinar o prefixo da rota baseado no perfil
const getRoutePrefix = (profile) => {
  // Se for cliente, usa /cliente
  if (profile?.role === 'cliente' && profile?.cliente_id) {
    return '/cliente';
  }
  // Se for admin/colaborador, usa /client-area
  return '/client-area';
};

// Função para verificar se o usuário tem acesso a uma página
const hasPageAccess = (profile, pageKey) => {
  // Se não for cliente, permite acesso a todas as páginas
  if (profile?.role !== 'cliente' || !profile?.cliente_id) {
    return true;
  }

  // Se allowed_pages é null ou undefined, permite acesso a todas as páginas
  const allowedPages = profile?.allowed_pages;
  if (allowedPages === null || allowedPages === undefined) {
    return true;
  }

  // Se for array, verifica se a página está no array
  if (Array.isArray(allowedPages)) {
    return allowedPages.includes(pageKey);
  }

  // Por padrão, permite acesso
  return true;
};

const getMenuItems = (profile) => {
  const prefix = getRoutePrefix(profile);
  const isAdmin = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;
  
  const items = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      path: `${prefix}/support`,
      icon: LayoutDashboard,
    },
    {
      key: 'trafego',
      label: 'Cadastro Diário',
      path: `${prefix}/trafego`,
      icon: FileText,
    },
    {
      key: 'campaigns-status',
      label: 'Status das Campanhas',
      path: `${prefix}/campaigns-status`,
      icon: ClipboardList,
    },
    {
      key: 'apexia',
      label: 'ApexIA',
      path: '/apexia',
      icon: MessageSquare,
      disabled: profile?.role !== 'cliente', // ApexIA só para clientes
    },
    {
      key: 'pgm-panel',
      label: 'Painel PGM',
      path: `${prefix}/pgm-panel`,
      icon: Activity,
    },
  ];

  // Adicionar Tráfego Semanal apenas para administradores
  if (isAdmin) {
    items.splice(2, 0, {
      key: 'traffic-weekly',
      label: 'Tráfego Semanal',
      path: `${prefix}/traffic-weekly`,
      icon: TrendingUp,
    });
  }

  // Filtrar itens baseado nas permissões do usuário
  return items.filter(item => {
    // Se estiver desabilitado por outro motivo (ex: ApexIA para não-clientes), manter na lista mas desabilitado
    if (item.disabled) {
      return true;
    }
    // Verificar permissão de acesso à página
    return hasPageAccess(profile, item.key);
  });
};

const SidebarCliente = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [clienteData, setClienteData] = useState(null);
  const [showQuemSomos, setShowQuemSomos] = useState(false);
  const [companyInfo, setCompanyInfo] = useState('');

  useEffect(() => {
    const fetchClienteData = async () => {
      // Se for admin/colaborador, não buscar dados de cliente específico
      if (profile?.role !== 'cliente' || !profile?.cliente_id) {
        setClienteData({ empresa: 'Área do Cliente', nome_contato: null, logo_urls: null });
        return;
      }

      const { data, error } = await supabase
        .from('clientes')
        .select('empresa, nome_contato, logo_urls')
        .eq('id', profile.cliente_id)
        .maybeSingle();

      if (!error && data) {
        setClienteData(data);
      }
    };

    fetchClienteData();
  }, [profile?.cliente_id, profile?.role]);

  // Buscar informações sobre a JB APEX
  useEffect(() => {
    const fetchCompanyInfo = async () => {
      const { data, error } = await supabase
        .from('public_config')
        .select('value')
        .eq('key', 'company_info_for_ai')
        .maybeSingle();

      if (!error && data?.value) {
        setCompanyInfo(data.value);
      }
    };

    fetchCompanyInfo();
  }, []);

  const [clickedApexIA, setClickedApexIA] = useState(false);

  const handleNavigate = (item) => {
    if (item.disabled) return;
    
    // Animação especial para ApexIA
    if (item.key === 'apexia') {
      setClickedApexIA(true);
      // Adicionar delay para ver a animação antes de navegar
      setTimeout(() => {
        navigate(item.path, { state: { fromClientArea: true } });
        // Resetar após navegação
        setTimeout(() => setClickedApexIA(false), 300);
      }, 200);
    } else {
      navigate(item.path);
    }
  };

  const clienteNome = clienteData?.empresa || clienteData?.nome_contato || profile?.full_name || 'Cliente';
  const clienteFoto = clienteData?.logo_urls && clienteData.logo_urls.length > 0 
    ? clienteData.logo_urls[0] 
    : null;
  const iniciais = clienteNome
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  
  // Verificar se é administrador acessando a área do cliente
  const isAdmin = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-border flex-shrink-0 h-screen overflow-hidden md:block" style={{ backgroundColor: '#F9FAFB' }}>
      <div className="h-16 flex items-center gap-3 px-6 border-b border-border flex-shrink-0">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={clienteFoto} alt={clienteNome} />
          <AvatarFallback className="bg-gradient-to-br from-orange-400 to-purple-600 text-white font-semibold">
            {iniciais}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold tracking-tight text-card-foreground truncate">
            {clienteNome}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            Área do Cliente
          </p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 min-h-0">
        <ul className="space-y-1 px-2">
          {getMenuItems(profile).map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            const isApexIA = item.key === 'apexia';

            return (
              <li key={item.key}>
                <motion.button
                  type="button"
                  onClick={() => handleNavigate(item)}
                  disabled={item.disabled}
                  whileTap={isApexIA ? { scale: 0.95 } : { scale: 0.98 }}
                  animate={clickedApexIA && isApexIA ? {
                    scale: [1, 1.05, 1],
                    boxShadow: [
                      '0 0 0px rgba(210, 97, 42, 0)',
                      '0 0 20px rgba(210, 97, 42, 0.6)',
                      '0 0 0px rgba(210, 97, 42, 0)'
                    ]
                  } : {}}
                  transition={{ duration: 0.2 }}
                  className={[
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-all relative',
                    isActive
                      ? 'bg-gradient-to-br from-orange-400 to-purple-600 text-white shadow-sm'
                      : isApexIA
                      ? 'bg-gradient-to-r from-[#FFF5EB] to-white dark:from-orange-950/30 dark:to-orange-900/10 border border-orange-200/60 dark:border-orange-800/40 text-[#D2612A] dark:text-[#E67E3A] hover:from-[#FFE8D6] hover:to-[#FFF5EB] dark:hover:from-orange-950/40 dark:hover:to-orange-900/20 shadow-sm hover:shadow-md hover:-translate-y-0.5'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    item.disabled ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  <motion.div
                    animate={clickedApexIA && isApexIA ? {
                      rotate: [0, 15, -15, 0],
                      scale: [1, 1.2, 1]
                    } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    <Icon className={[
                      'h-4 w-4',
                      isApexIA && !isActive ? 'text-[#D2612A] dark:text-[#E67E3A]' : ''
                    ].join(' ')} />
                  </motion.div>
                  <span className="flex-1 text-left">{item.label}</span>
                  {isApexIA && !isActive && (
                    <motion.span 
                      className="inline-flex items-center rounded-full bg-gradient-to-r from-orange-400 to-purple-600 text-white text-[10px] font-semibold px-1.5 py-0.5"
                      animate={clickedApexIA ? {
                        scale: [1, 1.3, 1],
                        opacity: [1, 0.8, 1]
                      } : {
                        scale: 1,
                        opacity: 1
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      AI
                    </motion.span>
                  )}
                </motion.button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Rodapé com botões inferiores */}
      <div className="border-t border-border flex-shrink-0 p-4 space-y-2">
        {/* Mostrar "Meus Dados" e "Quem Somos" apenas para clientes */}
        {!isAdmin && (
          <>
            <button
              type="button"
              onClick={() => navigate('/cliente/cadastros')}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
            >
              <User className="h-4 w-4" />
              <span>Meus Dados</span>
            </button>
            
            <button
              type="button"
              onClick={() => setShowQuemSomos(true)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
            >
              <Info className="h-4 w-4" />
              <span>Quem Somos</span>
            </button>
          </>
        )}
        
        {isAdmin ? (
          <button
            type="button"
            onClick={() => navigate('/tasks/list')}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar ao menu do Planeje</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </button>
        )}
      </div>

      {/* Dialog Quem Somos */}
      <Dialog open={showQuemSomos} onOpenChange={setShowQuemSomos}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Quem Somos - JB APEX</DialogTitle>
            <DialogDescription>
              Informações sobre a JB APEX e nossos serviços
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {companyInfo ? (
              <div className="prose dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {companyInfo}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Informações sobre a JB APEX serão exibidas aqui.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
};

export default SidebarCliente;

