import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSupportHistory } from '../src/lib/supportHistory.ts';
import type { ContactMessageEntry } from '../src/lib/types';
const entry = (id: string, day: number, unsent_at: string | null = null) => ({ id, created_at: `2026-09-${String(day).padStart(2,'0')}T12:00:00Z`, unsent_at } as ContactMessageEntry);
test('older support cases share one chronological history without duplicates or recalled messages', () => {
  const a=entry('a',1), b=entry('b',3), c=entry('c',2), removed=entry('removed',4,'2026-09-05');
  const threads=[{entries:[b,removed]},{entries:[a,c,b]},{entries:undefined}];
  assert.deepEqual(mergeSupportHistory(threads).map(e=>e.id), ['a','c','b']);
  assert.equal(threads[0].entries?.length,2,'source threads remain unchanged');
  assert.deepEqual(mergeSupportHistory([]),[]);
});
