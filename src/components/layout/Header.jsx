import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Plus, Sun, Moon, Circle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const Header = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [theme, setTheme] = useState(() => {
    if (localStorage.getItem('theme')) {
      return localStorage.getItem('theme');
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleNotImplemented = () => {
    toast({
      title: "🚧 Funcionalidade não implementada!",
      description: "Não se preocupe! Você pode solicitar no próximo prompt! 🚀",
    });
  };

  return (
    <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="relative w-full max-w-xs hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
          <Input
            type="search"
            placeholder="Buscar..."
            className="pl-10 pr-12 bg-gray-100 dark:bg-gray-800 border-none text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
            onClick={handleNotImplemented}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5">
            ⌘K
          </div>
        </div>
        <div className="md:hidden">
            <h1 className="text-xl font-bold gradient-text">JB APEX</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-5 w-5 text-yellow-400" /> : <Moon className="h-5 w-5 text-purple-600" />}
          </Button>
          {profile && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {profile.full_name || profile.email || 'Usuário'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">Online</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;