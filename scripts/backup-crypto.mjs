import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
const MAGIC = Buffer.from('11DBAK01');
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function encryptBackup(bytes, key) {
  if (key.length !== 32) throw new Error('Backup key must be 32 bytes');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}
export function decryptBackup(bytes, key) {
  if (bytes.length < 36 || !bytes.subarray(0,8).equals(MAGIC)) throw new Error('Not an 11Drive encrypted backup');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(8,20));
  decipher.setAAD(MAGIC); decipher.setAuthTag(bytes.subarray(20,36));
  return Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]);
}
