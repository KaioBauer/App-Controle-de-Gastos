import { parseArgs } from 'node:util';
import { loadEnv } from '../env';
import { asSystem, prisma, runAsUser } from '../lib/db';
import { unreviewedCount } from '../modules/finance/queries';
import { createWebPushSender, sendToAll } from '../modules/push/service';
import { prismaSubscriptionStore } from '../modules/push/store';

/**
 * Envia uma notificação push para os aparelhos de um usuário.
 *
 *   Local:   pnpm push --usuario kaio "Título" "Mensagem" [--url /contas]
 *   VPS:     docker compose -p kaixa exec api node dist/cli/send-push.js --usuario kaio "Título" "Mensagem"
 *   Do PC:   deploy/push.sh --usuario kaio "Título" "Mensagem" [--url /contas]
 *
 * --usuario  quem recebe (obrigatório para enviar)
 * --url      tela aberta ao tocar na notificação (padrão: /)
 * --listar   mostra os usuários e os aparelhos inscritos de cada um, sem enviar
 */
const USAGE = 'Uso: send-push --usuario <nome> "Título" "Mensagem" [--url /tela] | --listar';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    usuario: { type: 'string', short: 'u' },
    url: { type: 'string', default: '/' },
    listar: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const device = (ua: string | null) => ua?.match(/iPhone|iPad|Android|Mac OS|Windows/)?.[0] ?? 'aparelho';

const env = loadEnv();
try {
  if (values.listar) {
    const users = await asSystem(() =>
      prisma.user.findMany({
        where: values.usuario ? { username: values.usuario } : {},
        orderBy: { createdAt: 'asc' },
        include: { pushSubscriptions: { orderBy: { createdAt: 'asc' } } },
      }),
    );
    for (const u of users) {
      console.log(`${u.username}: ${u.pushSubscriptions.length} aparelho(s)`);
      for (const s of u.pushSubscriptions) {
        const last = s.lastSuccessAt ? `última entrega ${s.lastSuccessAt.toISOString()}` : 'nunca entregue';
        console.log(`  · ${device(s.userAgent)} — ${last}${s.lastError ? ` — erro: ${s.lastError}` : ''}`);
      }
    }
    process.exit(0);
  }

  const [title, body] = positionals;
  if (!values.usuario || !title || !body) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!values.url.startsWith('/')) {
    console.error('--url precisa ser um caminho do app, começando com / (ex.: /contas)');
    process.exit(1);
  }
  const user = await asSystem(() => prisma.user.findUnique({ where: { username: values.usuario } }));
  if (!user) {
    console.error(`Usuário "${values.usuario}" não existe. Veja os usuários com --listar.`);
    process.exit(1);
  }

  // Tudo no contexto do usuário: só os aparelhos e o badge dele
  const result = await runAsUser(user.id, async () => {
    if ((await prisma.pushSubscription.count()) === 0) return null;
    return sendToAll(
      { title, body, url: values.url, tag: `manual-${Date.now()}`, badge: await unreviewedCount() },
      prismaSubscriptionStore,
      createWebPushSender(env),
    );
  });
  if (!result) {
    console.error(`${user.username} não tem aparelho inscrito. Ative as notificações em Ajustes › Notificações no iPhone.`);
    process.exit(1);
  }
  console.log(`Enviada para ${user.username}: ${result.sent} entregue(s), ${result.failed} falha(s), ${result.removed} inscrição(ões) expirada(s) removida(s).`);
  process.exit(result.sent > 0 ? 0 : 1);
} finally {
  await prisma.$disconnect();
}
