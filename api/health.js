// Read-only dependency check. Never return configuration, credentials or rows.
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET' && req.method!=='HEAD') return res.status(405).end();
  const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_ANON_KEY;
  if(!url || !key) return res.status(503).end();
  try {
    const response=await fetch(`${url}/rest/v1/site_settings?select=key&key=eq.site_name&limit=1`,{method:'HEAD',headers:{apikey:key},signal:AbortSignal.timeout(8000)});
    return res.status(response.ok?204:503).end();
  } catch {return res.status(503).end();}
}
