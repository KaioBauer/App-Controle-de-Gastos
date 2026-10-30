import type { FastifyBaseLogger } from 'fastify';
import cron, { type ScheduledTask } from 'node-cron';
import type { PluggyClient } from '../modules/pluggy/client';
import { syncAll } from '../modules/pluggy/sync';

/** Jobs agendados (fuso de São Paulo). Só uma instância da API roda, então não há disputa. */
export function startScheduler(client: PluggyClient | null, log: FastifyBaseLogger) {
  const tasks: ScheduledTask[] = [];

  if (client) {
    // Rede de segurança caso algum webhook da Pluggy se perca
    tasks.push(
      cron.schedule(
        '7 * * * *',
        () => {
          syncAll(client, log).catch((err) => log.error({ err }, 'Sync agendado da Pluggy falhou'));
        },
        { timezone: 'America/Sao_Paulo', name: 'pluggy-sync' },
      ),
    );
  }

  return () => tasks.forEach((t) => t.stop());
}
