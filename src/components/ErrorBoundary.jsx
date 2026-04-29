import React from 'react';

export const ERROR_BOUNDARY_RELOAD_FLAG = 'planeje_err_pending_reload';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturou um erro:', error, errorInfo);

    try {
      if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(ERROR_BOUNDARY_RELOAD_FLAG)) {
        sessionStorage.setItem(ERROR_BOUNDARY_RELOAD_FLAG, '1');
        window.location.reload();
        return;
      }
    } catch (_) {
      /* ignore */
    }

    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    try {
      sessionStorage.removeItem(ERROR_BOUNDARY_RELOAD_FLAG);
    } catch (_) {
      /* ignore */
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            Algo saiu do esperado. Tente recarregar a página.
          </p>
          {this.state.error ? (
            <pre className="max-w-lg max-h-32 overflow-auto rounded-md border bg-muted/50 p-2 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Recarregar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
