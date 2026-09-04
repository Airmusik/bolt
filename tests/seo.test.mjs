import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('public SEO pages have unique descriptions, titles and matching static routes',async()=>{
 const pages=JSON.parse(await readFile('src/lib/seo-pages.json','utf8'));
 const config=JSON.parse(await readFile('vercel.json','utf8'));
 assert.equal(new Set(Object.values(pages).map(p=>p.title)).size,Object.keys(pages).length);
 for(const [path,page] of Object.entries(pages)){
  assert.ok(page.description.length>60 && page.description.length<180);
  assert.ok(config.rewrites.some(r=>r.source===path));
  assert.ok(!/dashboard|chat|members|admin|notifications/.test(path));
 }
});
test('private fallback and support conversations do not use public metadata',async()=>{
 const {rewrites}=JSON.parse(await readFile('vercel.json','utf8'));
 assert.equal(rewrites.at(-1).destination,'/seo/private.html');
 assert.ok(rewrites.find(r=>r.source==='/contact'&&r.has)?.destination.endsWith('private.html'));
});
