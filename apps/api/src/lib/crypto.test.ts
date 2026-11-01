import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

const KEY = randomBytes(32).toString('base64');

describe('encryptSecret/decryptSecret', () => {
  it('volta o mesmo texto, com acentos', () => {
    const stored = encryptSecret('segredo-ção-123', KEY);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('segredo');
    expect(decryptSecret(stored, KEY)).toBe('segredo-ção-123');
  });

  it('cada cifragem sai diferente (iv aleatório)', () => {
    expect(encryptSecret('x', KEY)).not.toBe(encryptSecret('x', KEY));
  });

  it('chave errada ou dado alterado não abre', () => {
    const stored = encryptSecret('segredo', KEY);
    expect(() => decryptSecret(stored, randomBytes(32).toString('base64'))).toThrow();
    const parts = stored.split(':');
    parts[3] = Buffer.from('outra coisa').toString('base64url');
    expect(() => decryptSecret(parts.join(':'), KEY)).toThrow();
  });

  it('recusa chave de tamanho errado', () => {
    expect(() => encryptSecret('x', randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
