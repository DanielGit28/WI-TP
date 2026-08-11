import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM encrypt/decrypt for values stored at rest (currently
 * User.accessToken). Applied as a TypeORM column transformer, which runs
 * outside the DI container — that's why this reads TOKEN_ENCRYPTION_KEY
 * from process.env directly rather than via ConfigService.
 *
 * Output format: base64(iv[12] + authTag[16] + ciphertext). GCM's auth
 * tag means a tampered/corrupted value fails decryption loudly instead of
 * silently returning garbage.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256

function getKey(): Buffer {
  const hexKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not configured');
  }
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH} bytes); got ${key.length} bytes`,
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decrypt(encoded: string): string {
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
