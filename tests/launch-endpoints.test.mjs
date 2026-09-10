import { test } from 'node:test';
import assert from 'node:assert/strict';
import diagnostics from '../api/client-error.js';
import health from '../api/health.js';

function response() {
  return { code: 0, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.code=code;return this; }, end() { return this; } };
}
function configureTestEnvironment(t) {
  for (const [name,value] of Object.entries({VITE_SUPABASE_URL:'https://example.invalid',VITE_SUPABASE_ANON_KEY:'synthetic-key'})) {
    const previous=process.env[name];
    process.env[name]=value;
    t.after(()=>{if(previous===undefined) delete process.env[name];else process.env[name]=previous;});
  }
}

test('diagnostic endpoint validates requests and forwards only safe fields', async (t) => {
  t.mock.method(globalThis,'fetch', async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { p_kind:'render',p_route:'/chat/detail',p_browser:'chrome',p_release:'123abcd' });
    assert.equal(options.headers.Authorization,undefined);
    return { ok:true };
  });
  configureTestEnvironment(t);
  const request={method:'POST',headers:{origin:'https://www.11drive.com','content-type':'application/json'},body:{kind:'render',route:'/chat/detail',browser:'chrome',release:'123abcd',message:'must never be forwarded'}};
  assert.equal((await diagnostics(request,response())).code,204);
  for(const change of [{method:'GET'},{headers:{...request.headers,origin:'https://untrusted.invalid'}},{body:{...request.body,route:'/chat/private-id'}},{headers:{...request.headers,'content-length':'3000'}}]) {
    assert.ok([400,403,405].includes((await diagnostics({...request,...change},response())).code));
  }
  assert.equal(globalThis.fetch.mock.callCount(),1);
});

test('health endpoint uses a read-only request and exposes no response data',async(t)=>{
  configureTestEnvironment(t);
  t.mock.method(globalThis,'fetch',async(_url,options)=>{assert.equal(options.method,'HEAD');return {ok:true};});
  const res=await health({method:'GET'},response());
  assert.equal(res.code,204);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.equal((await health({method:'POST'},response())).code,405);
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('private backend details');});
  assert.equal((await health({method:'GET'},response())).code,503);
});
