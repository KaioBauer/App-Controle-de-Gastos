import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Segredos guardados no banco (ex.: Client Secret da Pluggy de cada usuário), cifrados com
 * AES-256-GCM. A chave fica só no .env (CREDENTIALS_KEY): um dump do banco sozinho não abre nada.
 * Formato: v1:<iv>:<tag>:<cifrado>, em base64url.
 */
const VERSION = 'v1';

function key(keyB64: string) {
  const k = Buffer.from(keyB64, 'base64');
  if (k.length !== 32) throw new Error('CREDENTIALS_KEY precisa ter 32 bytes em base64');
  return k;
}

export function encryptSecret(plain: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(keyB64), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}

export function decryptSecret(stored: string, keyB64: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Segredo em formato desconhecido');
  const decipher = createDecipheriv('aes-256-gcm', key(keyB64), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
