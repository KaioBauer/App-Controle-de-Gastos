import type { FastifyBaseLogger } from 'fastify';
import cron, { type ScheduledTask } from 'node-cron';
import { forEachUser } from '../lib/db';
import type { Notifier } from '../modules/notifications/service';
import type { PluggyClients } from '../modules/pluggy/clients';
import { syncAll } from '../modules/pluggy/sync';

const TZ = 'America/Sao_Paulo';

/** Jobs agendados (fuso de São Paulo). Só uma instância da API roda, então não há disputa. */
export function startScheduler(clients: PluggyClients, notifier: Notifier, log: FastifyBaseLogger) {
  const tasks: ScheduledTask[] = [];
  const every = (expr: string, name: string, fn: () => Promise<unknown>) =>
    tasks.push(
      cron.schedule(
        expr,
        () => {
          fn().catch((err) => log.error({ err, job: name }, 'Job agendado falhou'));
        },
        { timezone: TZ, name },
      ),
    );

  // Rede de segurança caso algum webhook da Pluggy se perca
  every('7 * * * *', 'pluggy-sync', () => syncAll(clients, log));

  // Avisos: cada usuário com a própria fila, preferências e aparelhos
  const perUser = (name: string, fn: () => Promise<unknown>) => () =>
    forEachUser(fn, (err, userId) => log.error({ err, job: name, userId }, 'Job agendado falhou para um usuário'));

  // Envia o que ficou na fila durante o horário de silêncio
  every('*/15 * * * *', 'notifications-dispatch', perUser('notifications-dispatch', () => notifier.dispatch()));
  // Faturas/contas vencendo e consentimento expirando
  every('0 9 * * *', 'notifications-daily', perUser('notifications-daily', () => notifier.daily()));
  // Resumo semanal no domingo à noite e fechamento do mês no dia 1º
  every('0 20 * * 0', 'notifications-weekly', perUser('notifications-weekly', () => notifier.weekly()));
  every('0 9 1 * *', 'notifications-monthly', perUser('notifications-monthly', () => notifier.monthly()));

  return () => tasks.forEach((t) => t.stop());
}
