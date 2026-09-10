import { Component, type ReactNode } from 'react';
import { diagnosticKind, reportClientError } from '@/lib/clientDiagnostics';
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { reportClientError(diagnosticKind(error, 'render')); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="flex min-h-[70dvh] items-center justify-center p-5" role="alert">
      <section className="card w-full max-w-md space-y-4 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-ink-900">This page couldn’t open</h1>
        <p className="text-sm leading-6 text-ink-600">Please check your connection and reload the page. If you were submitting something, check whether it was saved before trying again.</p>
        <p className="text-xs leading-5 text-ink-500">Reloading may clear unsaved changes. It won’t delete your saved messages or account.</p>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => window.location.reload()} className="btn-primary">Reload page</button><a href="/dashboard" className="btn-secondary">Go to dashboard</a><a href="/contact" className="btn-secondary">Contact support</a></div>
      </section>
    </main>;
  }
}
