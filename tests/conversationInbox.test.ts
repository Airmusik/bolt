import test from 'node:test';
import assert from 'node:assert/strict';
import { groupConversations, conversationInboxKey, conversationPartnerId } from '../src/lib/conversationInbox.ts';
import type { Conversation } from '../src/lib/types';

const conversation = (id: string, override: Partial<Conversation> = {}) => ({
  id, driver_id: 'driver', owner_id: 'owner', admin_id: null, closed_at: null,
  created_at: '2026-09-01T12:00:00Z', last_message_at: null, ...override,
} as Conversation);

test('reconnections and duplicate results produce one inbox row for both participants', () => {
  const old = conversation('old', { closed_at: '2026-09-02T12:00:00Z' });
  const current = conversation('current', { vehicle_id: 'car-2', last_message_at: '2026-09-05T12:00:00Z' });
  for (const user of ['driver', 'owner']) {
    const groups = groupConversations([old, current, old, current], user);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[0].activeConversation.id, 'current');
    assert.equal(groups[0].latest.id, 'current');
  }
});

test('all direct admins share the support key while invited admins do not change member grouping', () => {
  const direct = conversation('support-a', { owner_id: null, admin_id: 'admin-a' });
  const another = conversation('support-b', { owner_id: null, admin_id: 'admin-b' });
  const invited = conversation('invited', { admin_id: 'admin-a' });
  const plain = conversation('plain');
  const groups = groupConversations([direct, another, invited, plain], 'driver');
  assert.equal(groups.length, 2);
  assert.equal(groups.find(group => group.key === 'support')?.items.length, 2);
  assert.equal(groups.find(group => group.key === 'member:owner')?.items.length, 2);
  assert.equal(conversationInboxKey(direct, 'admin-a'), 'member:driver');
});

test('owner support and an admin in a legacy participant slot are identified', () => {
  assert.equal(conversationInboxKey(conversation('a', { driver_id: null, admin_id: 'admin' }), 'owner'), 'support');
  const admin = { id: 'admin', role: 'admin' } as Conversation['owner'];
  assert.equal(conversationInboxKey(conversation('b', { owner_id: 'admin', owner: admin }), 'driver'), 'support');
});

test('same names and different cars do not merge distinct people', () => {
  const a = conversation('a');
  const b = conversation('b', { driver_id: 'another-driver' });
  assert.equal(groupConversations([a, b], 'owner').length, 2);
  assert.deepEqual(groupConversations([a, b], 'outsider'), []);
  assert.equal(conversationPartnerId(a, 'outsider'), null);
});

test('newest activity is first but sending uses an open conversation; ended history stays', () => {
  const open = conversation('open');
  const ended = conversation('ended', { closed_at: '2026-09-04T12:00:00Z', last_message_at: '2026-09-04T12:00:00Z' });
  const groups = groupConversations([open, ended], 'driver');
  assert.equal(groups[0].latest.id, 'ended');
  assert.equal(groups[0].activeConversation.id, 'open');
  assert.equal(groupConversations([ended], 'driver')[0].activeConversation.id, 'ended');
});

test('missing participants never collapse unrelated historical conversations', () => {
  const groups = groupConversations([conversation('a', { owner_id: null }), conversation('b', { owner_id: null })], 'driver');
  assert.equal(groups.length, 2);
});
