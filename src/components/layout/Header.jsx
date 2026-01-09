import React, { useState, useEffect } from 'react';
import { Sun, Moon, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const Header = () => {
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

  return (
    <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-3">
      <div className="flex items-center justify-between w-full">
        <div className="md:hidden">
            <h1 className="text-xl font-bold gradient-text">JB APEX</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-3 ml-auto">
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