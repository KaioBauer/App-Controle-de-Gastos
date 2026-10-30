import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from './api';

export const passkeysSupported = () => browserSupportsWebAuthn();

/** Mensagem amigável para os erros mais comuns do Face ID/WebAuthn. */
function friendly(err: unknown): Error {
  const e = err as { name?: string; message?: string };
  if (e?.name === 'NotAllowedError') return new Error('Cancelado ou tempo esgotado.');
  if (e?.name === 'InvalidStateError') return new Error('Este aparelho já tem uma passkey cadastrada.');
  return err instanceof Error ? err : new Error(String(err));
}

/** Cadastra uma passkey neste aparelho (precisa estar logado com a senha). */
export async function registerPasskey() {
  const optionsJSON = await api<Parameters<typeof startRegistration>[0]['optionsJSON']>('/auth/passkey/register/options', { method: 'POST' });
  let response;
  try {
    response = await startRegistration({ optionsJSON });
  } catch (err) {
    throw friendly(err);
  }
  await api('/auth/passkey/register/verify', { method: 'POST', body: response });
}

/** Entra com Face ID/Touch ID; devolve o usuário logado. */
export async function loginWithPasskey() {
  const optionsJSON = await api<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/auth/passkey/login/options', { method: 'POST' });
  let response;
  try {
    response = await startAuthentication({ optionsJSON });
  } catch (err) {
    throw friendly(err);
  }
  return api<{ username: string }>('/auth/passkey/login/verify', { method: 'POST', body: response });
}
