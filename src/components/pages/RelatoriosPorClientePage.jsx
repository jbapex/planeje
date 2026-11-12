import { Navigate, useLocation } from 'react-router-dom';

/** Redireciona para a aba Relatórios dentro de Rastreamento. */
const RelatoriosPorClientePage = () => {
  const location = useLocation();
  return <Navigate to={`/rastreamento?aba=relatorio${location.search ? `&${location.search.slice(1)}` : ''}`} replace />;
};

export default RelatoriosPorClientePage;
