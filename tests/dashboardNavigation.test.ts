import assert from 'node:assert/strict';
import test from 'node:test';
import { activeDashboardTab, dashboardDestination, dashboardTabFromSearch, getDashboardTabs } from '../src/lib/dashboardNavigation.ts';

test('drivers can reach all five dashboard sections from any page', () => {
  assert.deepEqual(getDashboardTabs('driver').map(tab => tab.id), ['overview', 'cars', 'applications', 'connections', 'chats']);
});

test('owners keep their available drivers and vehicle management sections', () => {
  assert.deepEqual(getDashboardTabs('owner').map(tab => tab.id), ['overview', 'drivers', 'vehicles', 'applications', 'connections', 'chats']);
});

test('navigation has stable, directly openable destinations including the chat inbox', () => {
  assert.equal(dashboardDestination('overview'), '/dashboard');
  assert.equal(dashboardDestination('chats'), '/chat');
  assert.equal(dashboardDestination('connections'), '/dashboard?tab=connections');
});

test('dashboard selection follows URL changes and browser back to Overview', () => {
  for (const search of ['?tab=cars', '?tab=applications', '?tab=connections', '']) {
    const expected = new URLSearchParams(search).get('tab') || 'overview';
    assert.equal(dashboardTabFromSearch('driver', search), expected);
  }
});

test('invalid and other-role tabs fall back to Overview', () => {
  assert.equal(dashboardTabFromSearch('driver', '?tab=vehicles'), 'overview');
  assert.equal(dashboardTabFromSearch('owner', '?tab=cars'), 'overview');
  assert.equal(dashboardTabFromSearch('owner', '?tab=unknown'), 'overview');
});

test('Chats stays selected in the inbox, a conversation, and legacy history links', () => {
  assert.equal(activeDashboardTab('driver', '/chat', ''), 'chats');
  assert.equal(activeDashboardTab('owner', '/chat/conversation-id', ''), 'chats');
  assert.equal(activeDashboardTab('driver', '/dashboard', '?tab=chats'), 'chats');
});

test('vehicle pages highlight the appropriate role-specific section', () => {
  assert.equal(activeDashboardTab('driver', '/vehicles/car-id', ''), 'cars');
  assert.equal(activeDashboardTab('owner', '/vehicles/car-id/edit', ''), 'vehicles');
  assert.equal(activeDashboardTab('owner', '/vehicles/new', ''), 'vehicles');
  assert.equal(activeDashboardTab('owner', '/browse-drivers', ''), 'drivers');
});

test('extra pages do not falsely highlight Overview', () => {
  for (const path of ['/', '/settings', '/onboarding', '/members/member-id', '/notifications']) {
    assert.equal(activeDashboardTab('driver', path, ''), null);
  }
});
