import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptBackup,decryptBackup,digest } from '../scripts/backup-crypto.mjs';
test('backups round-trip and reject corruption or the wrong key',()=>{
  const key=randomBytes(32),data=Buffer.from('Private test file and account data');
  const sealed=encryptBackup(data,key);
  assert.deepEqual(decryptBackup(sealed,key),data);
  assert.ok(!sealed.includes(data));
  assert.notDeepEqual(encryptBackup(data,key),sealed);
  assert.throws(()=>decryptBackup(sealed,randomBytes(32)));
  sealed[sealed.length-1]^=1;
  assert.throws(()=>decryptBackup(sealed,key));
  assert.equal(digest(data).length,64);
});
