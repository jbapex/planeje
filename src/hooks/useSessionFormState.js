// Hook para salvar estado de formulários em sessionStorage (persiste enquanto a aba está aberta)
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook para persistir estado de formulário em sessionStorage
 * @param {string} formKey - Chave única para identificar o formulário (ex: 'project_form_123' ou 'client_form_new')
 * @param {object} initialData - Dados iniciais do formulário
 * @param {number} debounceMs - Tempo de debounce para salvar (padrão: 500ms)
 * @returns {[object, function, function]} - [formData, setFormData, clearFormData]
 */
export const useSessionFormState = (formKey, initialData = {}, debounceMs = 500) => {
  const location = useLocation();
  const storageKey = `form_state_${formKey}`;
  const [formData, setFormData] = useState(() => {
    // SEMPRE inicia com initialData (dados do cliente)
    // A restauração de dados salvos será feita no useEffect do componente que usa o hook
    // Isso garante que os dados do cliente sejam sempre mostrados primeiro
    return initialData;
  });

  // Salva no sessionStorage sempre que formData muda (com debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({
          data: formData,
          timestamp: Date.now(),
          path: location.pathname
        }));
      } catch (error) {
        console.error('Error saving form state:', error);
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [formData, storageKey, debounceMs, location.pathname]);

  // Função para atualizar o estado (wrapper do setFormData)
  const updateFormData = useCallback((newData) => {
    setFormData(prev => {
      if (typeof newData === 'function') {
        return newData(prev);
      }
      return { ...prev, ...newData };
    });
  }, []);

  // Função para limpar o estado salvo
  const clearFormData = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
      setFormData(initialData);
    } catch (error) {
      console.error('Error clearing form state:', error);
    }
  }, [storageKey, initialData]);

  // Limpa o estado quando o componente desmonta ou a rota muda significativamente
  useEffect(() => {
    // Limpa quando sair da rota (componente desmonta)
    return () => {
      // Não limpa automaticamente - deixa o usuário voltar
    };
  }, []);

  return [formData, updateFormData, clearFormData];
};

