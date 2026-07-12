/** @jest-environment node */

import { webcrypto } from 'crypto';

import { hashPassword, verifyPassword } from './password';

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
});

describe('password hashing', () => {
  it('hashes and verifies a password without storing plaintext', async () => {
    const stored = await hashPassword('correct horse battery staple');

    expect(stored).toMatch(/^pbkdf2-sha256\$310000\$/);
    expect(stored).not.toContain('correct horse battery staple');
    await expect(
      verifyPassword('correct horse battery staple', stored)
    ).resolves.toEqual({ valid: true, needsRehash: false });
    await expect(verifyPassword('wrong password', stored)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it('accepts a matching legacy plaintext password for migration', async () => {
    await expect(
      verifyPassword('legacy-password', 'legacy-password')
    ).resolves.toEqual({
      valid: true,
      needsRehash: true,
    });
  });

  it('rejects malformed password hashes', async () => {
    await expect(
      verifyPassword('password', 'pbkdf2-sha256$invalid$00$00')
    ).resolves.toEqual({ valid: false, needsRehash: false });
  });
});
