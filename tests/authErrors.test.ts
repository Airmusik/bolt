import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthErrorMessage, LOGIN_REGISTRATION_GUIDANCE } from '../src/lib/authErrors.ts';

test('invalid login offers registration without claiming an email is unregistered', () => {
  assert.equal(getAuthErrorMessage({ message: 'Invalid login credentials' }, 'signin'), LOGIN_REGISTRATION_GUIDANCE);
  assert.match(LOGIN_REGISTRATION_GUIDANCE, /create an account first/);
});

test('network and confirmation failures keep specific guidance', () => {
  assert.match(getAuthErrorMessage(new Error('Failed to fetch'), 'signin'), /internet connection/);
  assert.match(getAuthErrorMessage({message:'Email not confirmed'}, 'signin'), /Confirm your email/);
});
