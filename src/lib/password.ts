const PASSWORD_PREFIX = 'pbkdf2-sha256';
const PASSWORD_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export interface PasswordVerificationResult {
  valid: boolean;
  needsRehash: boolean;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(value: string): Uint8Array | null {
  if (
    value.length === 0 ||
    value.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(value)
  ) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    passwordKey,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return [
    PASSWORD_PREFIX,
    PASSWORD_ITERATIONS,
    bytesToHex(salt),
    bytesToHex(hash),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  storedPassword: string
): Promise<PasswordVerificationResult> {
  if (!storedPassword.startsWith(`${PASSWORD_PREFIX}$`)) {
    const encoder = new TextEncoder();
    const valid = constantTimeEqual(
      encoder.encode(password),
      encoder.encode(storedPassword)
    );
    return { valid, needsRehash: valid };
  }

  const [prefix, rawIterations, rawSalt, rawHash, ...extra] =
    storedPassword.split('$');
  const iterations = Number.parseInt(rawIterations, 10);
  const salt = hexToBytes(rawSalt);
  const expectedHash = hexToBytes(rawHash);

  if (
    prefix !== PASSWORD_PREFIX ||
    extra.length > 0 ||
    !Number.isSafeInteger(iterations) ||
    iterations <= 0 ||
    !salt ||
    salt.length !== SALT_BYTES ||
    !expectedHash ||
    expectedHash.length !== HASH_BYTES
  ) {
    return { valid: false, needsRehash: false };
  }

  const actualHash = await derivePassword(password, salt, iterations);
  const valid = constantTimeEqual(actualHash, expectedHash);
  return {
    valid,
    needsRehash: valid && iterations !== PASSWORD_ITERATIONS,
  };
}
