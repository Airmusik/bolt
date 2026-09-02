import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportPartner } from '../src/lib/supportIdentity.ts';

test('support is identified before the admin profile loads', () => {
  assert.equal(isSupportPartner({ admin_id:'admin',driver_id:'driver',owner_id:null },'driver',null),true);
  assert.equal(isSupportPartner({ admin_id:null,driver_id:'driver',owner_id:'admin' },'driver',{role:'admin'}),true);
});
test('an invited admin does not hide normal member safety actions', () => {
  assert.equal(isSupportPartner({ admin_id:'admin',driver_id:'driver',owner_id:'owner' },'driver',{role:'owner'}),false);
  assert.equal(isSupportPartner({ admin_id:'admin',driver_id:'driver',owner_id:null },'admin',{role:'driver'}),false);
});
