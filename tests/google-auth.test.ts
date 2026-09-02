import test from 'node:test';
import assert from 'node:assert/strict';
import { googleAuthDestination, googleCallbackError, googleCallbackUrl, googleSetupError } from '../src/lib/googleAuth.ts';

test('Google callbacks use the current origin and a fixed route, never a supplied next URL', () => {
  assert.equal(googleCallbackUrl('https://bolt-phi-indol.vercel.app'), 'https://bolt-phi-indol.vercel.app/auth/callback');
  assert.equal(googleCallbackUrl('http://localhost:5173'), 'http://localhost:5173/auth/callback');
});
test('new Google users must finish registration; existing users keep their destination', () => {
  assert.equal(googleAuthDestination(null, true), '/register');
  assert.equal(googleAuthDestination({ role: 'driver' }, false), '/dashboard');
  assert.equal(googleAuthDestination({ role: 'owner' }, false), '/dashboard');
  assert.equal(googleAuthDestination({ role: 'admin' }, false), '/admin');
  assert.equal(googleAuthDestination({ role: 'owner', is_suspended: true }, false), '/suspended');
});
test('provider cancellation and failures are safe and do not expose tokens or provider descriptions', () => {
  assert.match(googleCallbackError('?error=access_denied', '')!, /cancelled/);
  assert.match(googleCallbackError('', '#error=access_denied')!, /cancelled/);
  assert.equal(googleCallbackError('', '#access_token=secret'), null);
  const message = googleCallbackError('?error=server_error&error_description=private-secret', '');
  assert.match(message!, /could not finish/);
  assert.ok(!message!.includes('private-secret'));
});
test('Google registration errors explain duplicate phones and changed terms', () => {
  assert.match(googleSetupError({ code: '23505' }), /phone number/);
  assert.match(googleSetupError({ message: 'Accept the current Terms of Service' }), /terms have changed/);
  assert.match(googleSetupError({ message: 'Account setup is already complete' }), /already set up/);
  assert.ok(!googleSetupError({ message: 'sensitive database detail' }).includes('sensitive'));
});
