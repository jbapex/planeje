import { Bot, ChevronDown, LogOut, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import usePlanejeTheme from '@/hooks/usePlanejeTheme';

export default function WorkspaceHeaderTools({ tone = 'default', className }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const isClient = profile?.role === 'cliente' && profile?.cliente_id;
  const isHero = tone === 'hero';
  const { theme, toggleTheme } = usePlanejeTheme();

  return (
    <div className={cn('planeje-workspace-tools', isHero && 'planeje-workspace-tools--hero', className)}>
      {isClient && (
        <Button
          onClick={() => navigate('/apexia')}
          className={cn(
            isHero
              ? 'planeje-trafego-btn-light'
              : 'jb-gradient-bg hover:opacity-90 text-white border-0 shadow-sm'
          )}
          size="sm"
        >
          <Bot className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Acessar ApexIA</span>
          <span className="sm:hidden">ApexIA</span>
        </Button>
      )}
      {profile ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'planeje-header-user flex h-8 items-center gap-2 px-2.5 outline-none',
                isHero && 'planeje-trafego-hero-user'
              )}
              aria-label="Abrir menu do perfil"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full jb-gradient-bg text-[10px] font-bold text-white">{(profile.full_name || profile.email || 'U').charAt(0).toUpperCase()}</span>
              <span
                className={cn(
                  'max-w-[110px] truncate text-xs font-medium',
                  isHero ? 'text-white' : 'text-gray-700 dark:text-gray-200'
                )}
              >
                {profile.full_name || profile.email || 'Usuário'}
              </span>
              <ChevronDown className={cn('h-3.5 w-3.5', isHero ? 'text-white/70' : 'text-slate-400')} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
            <DropdownMenuLabel className="px-2 py-2">
              <span className="block truncate text-sm">{profile.full_name || profile.email || 'Minha conta'}</span>
              <span className="mt-1 flex items-center gap-1.5 text-xs font-normal text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-400" />Online</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={toggleTheme} className="cursor-pointer rounded-lg">
              {theme === 'dark' ? <Sun className="mr-2 h-4 w-4 text-amber-500" /> : <Moon className="mr-2 h-4 w-4 text-violet-500" />}
              {theme === 'dark' ? 'Usar modo claro' : 'Usar modo escuro'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut} className="cursor-pointer rounded-lg text-red-500 focus:bg-red-50 focus:text-red-500">
              <LogOut className="mr-2 h-4 w-4" />Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
