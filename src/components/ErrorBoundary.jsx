import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturou um erro:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              ⚠️ Erro ao Carregar Aplicação
            </h1>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Ocorreu um erro ao carregar a aplicação. Por favor, tente:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-6">
              <li>Recarregar a página (F5 ou Ctrl+R)</li>
              <li>Limpar o cache do navegador</li>
              <li>Verificar o console do navegador (F12) para mais detalhes</li>
            </ol>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Detalhes do Erro (Desenvolvimento)
                </summary>
                <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded text-xs overflow-auto max-h-64">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

