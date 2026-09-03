// Vercel supplies country at the edge. Never forward or persist IP/city headers.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const origin = req.headers.origin;
  if (!origin || !['https://www.11drive.com', 'https://11drive.com', 'https://bolt-phi-indol.vercel.app'].includes(origin)) return res.status(403).end();
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const country = req.headers['x-vercel-ip-country'];
    const response = await fetch(`${url}/rest/v1/rpc/record_site_visit`, {
      method: 'POST',
      headers: { apikey: key, Authorization: req.headers.authorization || `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_session: body.session, p_path: body.path, p_view: body.view === true, p_country: /^[A-Z]{2}$/.test(country || '') ? country : 'ZZ' }),
      signal: AbortSignal.timeout(8000),
    });
    return res.status(response.ok ? 204 : 400).end();
  } catch { return res.status(400).end(); }
}
