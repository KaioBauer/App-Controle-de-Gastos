import type { Env } from '../../env';
import { decryptSecret } from '../../lib/crypto';
import { currentUserId, prisma } from '../../lib/db';
import { PluggyClient } from './client';

/**
 * Qual cliente da Pluggy usar para o usuário do contexto. Cada conta do Meu Pluggy só enxerga as
 * próprias conexões, então cada usuário pode cadastrar as suas credenciais (Ajustes › Conexões).
 * Sem elas, vale o par do .env (PLUGGY_CLIENT_ID/SECRET), como antes.
 */
export class PluggyClients {
  // Um cliente por usuário (guarda a apiKey da Pluggy); refeito quando as credenciais mudam
  private cache = new Map<string, { stamp: number; client: PluggyClient }>();

  constructor(
    private env: Env,
    private fallback: PluggyClient | null,
  ) {}

  /** Dá para guardar credenciais por usuário (precisa de CREDENTIALS_KEY no .env). */
  get canStoreCredentials() {
    return !!this.env.CREDENTIALS_KEY;
  }

  async forCurrentUser(): Promise<PluggyClient | null> {
    const userId = currentUserId();
    const cred = await prisma.pluggyCredential.findUnique({ where: { userId } });
    if (!cred || !this.env.CREDENTIALS_KEY) return this.fallback;
    const stamp = cred.updatedAt.getTime();
    const hit = this.cache.get(userId);
    if (hit && hit.stamp === stamp) return hit.client;
    const client = new PluggyClient(cred.clientId, decryptSecret(cred.secretEnc, this.env.CREDENTIALS_KEY));
    this.cache.set(userId, { stamp, client });
    return client;
  }

  /** De onde vêm as credenciais do usuário do contexto (para a tela). */
  async sourceForCurrentUser(): Promise<{ source: 'own' | 'default' | null; clientIdHint: string | null }> {
    const cred = await prisma.pluggyCredential.findUnique({ where: { userId: currentUserId() } });
    if (cred && this.env.CREDENTIALS_KEY) return { source: 'own', clientIdHint: hint(cred.clientId) };
    if (this.fallback && this.env.PLUGGY_CLIENT_ID) return { source: 'default', clientIdHint: hint(this.env.PLUGGY_CLIENT_ID) };
    return { source: null, clientIdHint: null };
  }
}

/** "906dd5eb-…-df0577": dá para reconhecer sem expor o id inteiro. */
function hint(clientId: string) {
  return clientId.length <= 12 ? clientId : `${clientId.slice(0, 8)}…${clientId.slice(-6)}`;
}
