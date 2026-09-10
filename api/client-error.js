const routes = new Set(['/', '/login', '/register', '/reset-password', '/auth/callback', '/dashboard', '/browse-cars', '/browse-drivers', '/vehicles/new', '/vehicles/detail', '/vehicles/edit', '/drivers/detail', '/members/detail', '/onboarding', '/chat', '/chat/detail', '/contact', '/updates', '/notifications', '/settings', '/admin', '/admin/login', '/promotions', '/saved', '/help', '/about', '/terms', '/privacy', '/other']);
export function safeDiagnostic(body) {
  if (!body || !['render', 'runtime', 'promise', 'chunk'].includes(body.kind) || !routes.has(body.route) || !['chrome', 'safari', 'firefox', 'edge', 'other'].includes(body.browser) || !/^(?:[a-f0-9]{7,40}|local)$/.test(body.release || '')) return null;
  // No raw errors, user IDs, URLs, authorization, IPs or form values.
  return { p_kind: body.kind, p_route: body.route, p_browser: body.browser, p_release: body.release };
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!['https://www.11drive.com', 'https://11drive.com'].includes(req.headers.origin)) return res.status(403).end();
  if (!String(req.headers['content-type'] || '').startsWith('application/json') || Number(req.headers['content-length'] || 0) > 2048) return res.status(400).end();
  try {
    if (typeof req.body === 'string' && req.body.length > 2048) return res.status(400).end();
    const payload = safeDiagnostic(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    if (!payload) return res.status(400).end();
    const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return res.status(503).end();
    const response = await fetch(`${url}/rest/v1/rpc/record_client_diagnostic`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
    return res.status(response.ok ? 204 : 503).end();
  } catch { return res.status(503).end(); }
}
