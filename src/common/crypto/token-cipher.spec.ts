import { randomBytes } from 'crypto';
import { decrypt, encrypt } from './token-cipher';

const VALID_KEY = randomBytes(32).toString('hex');

describe('token-cipher', () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it('round-trips a plaintext value through encrypt and decrypt', () => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY;

    const plaintext = 'gho_someLongLivedGithubToken1234567890';
    const ciphertext = encrypt(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext on each call (random IV)', () => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY;

    const plaintext = 'same-input';
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it('throws when TOKEN_ENCRYPTION_KEY is not configured', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;

    expect(() => encrypt('anything')).toThrow('TOKEN_ENCRYPTION_KEY is not configured');
  });

  it('throws when TOKEN_ENCRYPTION_KEY is not a 32-byte hex string', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'not-the-right-length';

    expect(() => encrypt('anything')).toThrow(/32 bytes/);
  });

  it('fails to decrypt a tampered ciphertext instead of silently returning garbage', () => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY;

    const ciphertext = encrypt('sensitive-value');
    const raw = Buffer.from(ciphertext, 'base64');
    raw[raw.length - 1] ^= 0xff; // flip the last byte of the ciphertext
    const tampered = raw.toString('base64');

    expect(() => decrypt(tampered)).toThrow();
  });
});
