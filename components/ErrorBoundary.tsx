import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

// Top-level error boundary so a render-time throw (e.g. a malformed persisted
// session) shows a recoverable panel instead of a blank white screen.
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
      <div className="h-screen w-full bg-slate-950 text-slate-200 flex items-center justify-center p-6 font-mono">
        <div className="max-w-md w-full jarvis-panel rounded-xl p-8 text-center">
          <div className="text-red-400 font-display text-xl font-bold tracking-widest mb-2">
            SYSTEM FAULT
          </div>
          <p className="text-sm text-slate-400 mb-6">
            The interface hit an unexpected error and stopped. Your saved sessions and
            notes are untouched — reloading usually clears it.
          </p>
          {this.state.error?.message && (
            <pre className="text-[11px] text-slate-500 bg-slate-950/60 border border-slate-800 rounded p-3 mb-6 overflow-auto text-left">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="w-full bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 border border-cyan-500/50 rounded py-3 text-xs font-bold tracking-widest uppercase transition-all"
          >
            Reload Interface
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
