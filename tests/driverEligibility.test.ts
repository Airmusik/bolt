import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driverNeedsApproval, driverApprovalMessage, driverApprovalLabel } from '../src/lib/driverEligibility.ts';

test('driver gating uses approved proof rather than a generic badge', () => {
  assert.equal(driverNeedsApproval({ role: 'driver', platform_history_approved: false }), true);
  assert.equal(driverNeedsApproval({ role: 'driver', platform_history_approved: true }), false);
  assert.equal(driverNeedsApproval({ role: 'owner' }), false);
  assert.equal(driverNeedsApproval(undefined), false);
});
test('pending and missing proof have distinct, useful explanations', () => {
  assert.match(driverApprovalMessage({ platform_history_submitted: true }), /awaiting admin approval/);
  assert.match(driverApprovalMessage({ platform_history_submitted: false }), /Submit your recent/);
  assert.equal(driverApprovalLabel({ platform_history_submitted: true }), 'Awaiting admin approval');
});
