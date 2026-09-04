import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBroadNairobi } from '../src/lib/specificLocation.ts';
test('reject broad Nairobi labels, including Places formatted addresses', () => {
  for (const value of ['Nairobi',' NAIROBI ','Nairobi, Kenya','Nairobi City, Nairobi County, Kenya','Nairobi City County']) assert.equal(isBroadNairobi(value),true,value);
});
test('allow specific Nairobi areas and other towns', () => {
  for (const value of ['Westlands, Nairobi, Kenya','Kilimani','Kasarani','Embakasi','Rongai','CBD, Nairobi','Karen','Nairobi West','Mombasa','']) assert.equal(isBroadNairobi(value),false,value);
});
