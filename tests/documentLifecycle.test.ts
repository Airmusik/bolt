import test from 'node:test';
import assert from 'node:assert/strict';
import { expiryCountdown, historyCanEdit, historyState } from '../src/lib/documentLifecycle.ts';
import type { PlatformHistory } from '../src/lib/types.ts';

const now=Date.parse('2026-09-02T12:00:00Z');
const proof={ id:'one',driver_id:'driver',platform:'uber',months_active:12,trips:0,rating:null,proof_url:'private-proof',approved:true,review_status:'approved',created_at:'2026-01-01',expires_at:'2026-09-03T12:00:00Z' } satisfies PlatformHistory;
test('approved proof stays locked until its exact expiry and any pending review locks the batch',()=>{
  assert.equal(historyState(proof,now),'approved');
  assert.equal(historyCanEdit(proof,[proof],now),false);
  const expired={...proof,expires_at:'2026-09-02T12:00:00Z'};
  assert.equal(historyState(expired,now),'expired');
  assert.equal(historyCanEdit(expired,[expired],now),true);
  const pending={...proof,review_status:'pending' as const,approved:false};
  assert.equal(historyCanEdit(expired,[expired,pending],now),false);
  assert.equal(historyCanEdit({...proof,review_status:'rejected'},[],now),true);
});
test('expiry countdown shows days, hours and exact expiry without negative time',()=>{
  assert.equal(expiryCountdown(proof.expires_at,now),'1d 0h remaining');
  assert.equal(expiryCountdown('2026-09-02T12:30:00Z',now),'Less than 1 hour remaining');
  assert.equal(expiryCountdown('2026-09-02T12:00:00Z',now),'Expired — renewal required');
});
