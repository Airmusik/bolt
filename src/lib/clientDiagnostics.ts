export const DIAGNOSTIC_ROUTES = ['/', '/login', '/register', '/reset-password', '/auth/callback', '/dashboard', '/browse-cars', '/browse-drivers', '/vehicles/new', '/vehicles/detail', '/vehicles/edit', '/drivers/detail', '/members/detail', '/onboarding', '/chat', '/chat/detail', '/contact', '/updates', '/notifications', '/settings', '/admin', '/admin/login', '/promotions', '/saved', '/help', '/about', '/terms', '/privacy', '/other'] as const;
export type DiagnosticKind = 'render' | 'runtime' | 'promise' | 'chunk';
export function diagnosticRoute(path: string): string {
  const pathname = path.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  if (DIAGNOSTIC_ROUTES.includes(pathname as typeof DIAGNOSTIC_ROUTES[number])) return pathname;
  if (/^\/vehicles\/[^/]+\/edit$/.test(pathname)) return '/vehicles/edit';
  for (const prefix of ['vehicles', 'drivers', 'members', 'chat']) if (new RegExp(`^/${prefix}/[^/]+$`).test(pathname)) return `/${prefix}/detail`;
  return '/other';
}
export function diagnosticBrowser(agent: string): string {
  return /Edg\//.test(agent) ? 'edge' : /Chrome\/|CriOS\//.test(agent) ? 'chrome' : /Firefox\/|FxiOS\//.test(agent) ? 'firefox' : /Safari\//.test(agent) ? 'safari' : 'other';
}
export function diagnosticKind(error: unknown, fallback: DiagnosticKind): DiagnosticKind {
  // Inspect locally only; never send the exception message or stack.
  return error instanceof Error && /dynamically imported module|Loading chunk|Importing a module script/i.test(error.message) ? 'chunk' : fallback;
}
const reported = new Set<string>();
export function reportClientError(kind: DiagnosticKind) {
  if (typeof window === 'undefined' || !import.meta.env?.PROD) return;
  const route = diagnosticRoute(window.location.pathname), key = `${route}:${kind}`;
  if (reported.has(key) || reported.size >= 5) return;
  reported.add(key);
  try { void fetch('/api/client-error', {
    method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, route, browser: diagnosticBrowser(navigator.userAgent), release: typeof __APP_RELEASE__ === 'string' ? __APP_RELEASE__ : 'local' }),
    keepalive: true, signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : undefined,
  }).catch(() => { /* A reporting failure must never cause another error. */ });
  } catch { /* Browser/network API failures must not break recovery either. */ }
}
export function installClientDiagnostics() {
  window.addEventListener('error', event => reportClientError(diagnosticKind(event.error, 'runtime')));
  window.addEventListener('unhandledrejection', event => reportClientError(diagnosticKind(event.reason, 'promise')));
}
