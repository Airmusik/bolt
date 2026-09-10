import assert from 'node:assert/strict';
const origin='https://www.11drive.com';
async function get(path) {
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const response=await fetch(origin+path,{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch {if(attempt===2) throw new Error(`Availability check failed: ${path}`);await new Promise(resolve=>setTimeout(resolve,3000));}
  }
}
for(const path of ['/','/login','/register','/reset-password','/browse-cars','/browse-drivers','/how-it-works','/about','/faq','/terms','/privacy','/contact','/help','/updates','/dashboard','/notifications','/chat','/community','/admin/login','/admin','/api/health']) {
  const response=await get(path);
  if(path!=='/api/health') {
    const html=await response.text();
    assert.match(html,/id="root"/,'App entry point missing');
    assert.match(html,/\/assets\/[^" ]+\.js/,'App script missing');
    if(path==='/') {
      const scripts=[...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(m=>m[1]);
      for(const asset of new Set(scripts)) await get(asset);
    }
  }
  console.log(`PASS ${path}`);
}
console.log('Read-only availability checks passed. These do not log in or submit user actions.');
