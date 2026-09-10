import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagnosticRoute,diagnosticBrowser,diagnosticKind,DIAGNOSTIC_ROUTES } from '../src/lib/clientDiagnostics.ts';
import { safeDiagnostic } from '../api/client-error.js';
test('diagnostics cannot contain private paths, messages, IDs or credentials',()=>{
  assert.equal(diagnosticRoute('/chat/private-id?token=secret'),'/chat/detail');
  assert.equal(diagnosticRoute('/vehicles/private/edit'),'/vehicles/edit');
  assert.equal(diagnosticRoute('/unknown/email@example.com'),'/other');
  assert.equal(diagnosticRoute('/reset-password#access_token=secret'),'/reset-password');
  const record={kind:'render',route:'/chat/detail',browser:'chrome',release:'123abcd',message:'private text',password:'secret'};
  assert.deepEqual(safeDiagnostic(record),{p_kind:'render',p_route:'/chat/detail',p_browser:'chrome',p_release:'123abcd'});
  assert.equal(safeDiagnostic({...record,route:'/chat/member-id'}),null);
  assert.equal(safeDiagnostic({...record,release:'email@example.com'}),null);
  for(const route of DIAGNOSTIC_ROUTES) assert.ok(safeDiagnostic({...record,route}));
  assert.equal(diagnosticBrowser('Version/17 Safari/604'),'safari');
  assert.equal(diagnosticKind(new Error('Failed to fetch dynamically imported module: /asset'), 'runtime'),'chunk');
});
test('error boundaries enclose both application providers and routed pages',()=>{
  const main=readFileSync('src/main.tsx','utf8'),app=readFileSync('src/App.tsx','utf8');
  assert.match(main,/<AppErrorBoundary><BrowserRouter>/);
  assert.match(app,/<AppErrorBoundary key=\{route.pathname\}>/);
  const boundary=readFileSync('src/components/AppErrorBoundary.tsx','utf8');
  assert.match(boundary,/Reload page/);assert.match(boundary,/check whether it was saved/);
  assert.doesNotMatch(boundary,/setTimeout|localStorage.clear|sessionStorage.clear/);
});
