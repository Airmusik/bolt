import assert from 'node:assert/strict';
import test from 'node:test';
import { canRequestConnection } from '../src/lib/connectionEligibility.ts';

test('only driver-owner pairs can request connections in either direction', () => {
  const roles = ['driver', 'owner', 'admin', 'unknown', null, undefined];
  for (const requester of roles) {
    for (const recipient of roles) {
      const expected = (requester === 'driver' && recipient === 'owner')
        || (requester === 'owner' && recipient === 'driver');
      assert.equal(canRequestConnection(requester, recipient), expected, `${requester} -> ${recipient}`);
    }
  }
});
