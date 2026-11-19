import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Push tokens are stored encrypted at rest (AES-256-GCM) and looked up by a keyed
 * hash (HMAC-SHA256), so a database leak alone does not expose usable tokens.
 * Device API keys are random and only their SHA-256 hash is stored.
 */
export class TokenVault {
  private readonly encKey: Buffer;
  private readonly hashKey: Buffer;

  constructor(secret: string) {
    const salt = Buffer.from('clsu-heat-monitor/v1');
    this.encKey = Buffer.from(hkdfSync('sha256', secret, salt, 'token-encryption', 32));
    this.hashKey = Buffer.from(hkdfSync('sha256', secret, salt, 'token-lookup', 32));
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
  }

  decrypt(encoded: string): string {
    const raw = Buffer.from(encoded, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }

  lookupHash(token: string): string {
    return createHmac('sha256', this.hashKey).update(token).digest('hex');
  }
}

export const newDeviceKey = (): string => randomBytes(32).toString('base64url');
export const hashDeviceKey = (key: string): string => createHash('sha256').update(key).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
