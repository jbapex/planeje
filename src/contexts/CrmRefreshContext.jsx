import React, { createContext, useContext, useState, useCallback } from 'react';

const CrmRefreshContext = createContext(null);

export function CrmRefreshProvider({ children }) {
  const [refreshFn, setRefreshFn] = useState(() => () => {});
  const refresh = useCallback(() => {
    refreshFn();
  }, [refreshFn]);
  return (
    <CrmRefreshContext.Provider value={{ setRefreshFn, refresh }}>
      {children}
    </CrmRefreshContext.Provider>
  );
}

export function useCrmRefresh() {
  return useContext(CrmRefreshContext);
}
