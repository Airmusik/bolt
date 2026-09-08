import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const app = readFileSync('src/App.tsx', 'utf8');

test('maintenance page does not expose the administrator entrance to users', () => {
  assert.doesNotMatch(app, /> Admin sign in/);
  assert.doesNotMatch(app, /Platform administrators can continue managing/);
  assert.match(app, /path\.startsWith\('\/admin'\)/);
});
