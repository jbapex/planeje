import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const errorCount = this.state.errorCount + 1;
    console.error('ErrorBoundary capturou um erro:', error, errorInfo);
    console.error('Stack trace:', error?.stack);
    console.error('Component stack:', errorInfo?.componentStack);
    
    this.setState({
      error,
      errorInfo,
      errorCount
    });

    // Em produção, você pode querer enviar o erro para um serviço de monitoramento
    if (process.env.NODE_ENV === 'production') {
      // Exemplo: enviar para serviço de monitoramento
      // logErrorToService(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, errorCount } = this.state;
      const errorMessage = error?.message || 'Erro desconhecido';
      const errorName = error?.name || 'Error';
      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">⚠️</div>
              <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">
                Erro ao Carregar Aplicação
              </h1>
            </div>
            
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">
                {errorName}: {errorMessage}
              </p>
            </div>

            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Ocorreu um erro ao carregar a aplicação. Por favor, tente:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-6">
              <li>Recarregar a página (F5 ou Ctrl+R)</li>
              <li>Limpar o cache do navegador</li>
              <li>Verificar o console do navegador (F12) para mais detalhes</li>
            </ol>

            {(isDevelopment || errorCount > 1) && error && (
              <details className="mt-4 mb-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 hover:text-gray-900 dark:hover:text-gray-100">
                  {isDevelopment ? 'Detalhes do Erro (Desenvolvimento)' : 'Detalhes do Erro'}
                </summary>
                <div className="mt-2 space-y-2">
                  <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded text-xs overflow-auto max-h-64">
                    <div className="mb-2">
                      <strong className="text-gray-700 dark:text-gray-300">Mensagem:</strong>
                      <pre className="mt-1 text-red-600 dark:text-red-400">{errorMessage}</pre>
                    </div>
                    {error?.stack && (
                      <div className="mb-2">
                        <strong className="text-gray-700 dark:text-gray-300">Stack Trace:</strong>
                        <pre className="mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{error.stack}</pre>
                      </div>
                    )}
                    {errorInfo?.componentStack && (
                      <div>
                        <strong className="text-gray-700 dark:text-gray-300">Component Stack:</strong>
                        <pre className="mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{errorInfo.componentStack}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
              >
                Tentar Novamente
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                title="Limpar cache e recarregar"
              >
                Limpar Cache
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

