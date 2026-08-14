import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="h-screen w-full flex items-center justify-center p-6 bg-app text-ink">
        <div className="max-w-md w-full bg-card border border-line rounded-xl2 p-8 text-center shadow-raised">
          <div className="text-danger text-lg font-bold mb-2">Something went wrong</div>
          <p className="text-sm text-muted mb-6">
            The interface hit an unexpected error and stopped. Your saved chats and
            notes are untouched — reloading usually clears it.
          </p>
          {this.state.error?.message && (
            <pre className="text-[11px] text-faint bg-card-2 border border-line rounded p-3 mb-6 overflow-auto text-left font-mono">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="w-full text-white rounded-xl py-3 text-sm font-semibold"
            style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
