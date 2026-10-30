import { parseArgs } from 'node:util';
import { loadEnv } from '../env';
import { prisma } from '../lib/db';
import { unreviewedCount } from '../modules/finance/queries';
import { createWebPushSender, sendToAll } from '../modules/push/service';
import { prismaSubscriptionStore } from '../modules/push/store';

/**
 * Envia uma notificação push para todos os aparelhos inscritos.
 *
 *   Local:   pnpm push "Título" "Mensagem" [--url /contas]
 *   VPS:     docker compose -p kaixa exec api node dist/cli/send-push.js "Título" "Mensagem" [--url /contas]
 *   Do PC:   deploy/push.sh "Título" "Mensagem" [--url /contas]
 *
 * --url    tela aberta ao tocar na notificação (padrão: /)
 * --listar só mostra os aparelhos inscritos, sem enviar
 */
const USAGE = 'Uso: send-push "Título" "Mensagem" [--url /tela] | --listar';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: '/' },
    listar: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const env = loadEnv();
try {
  const subs = await prisma.pushSubscription.findMany({ orderBy: { createdAt: 'asc' } });
  if (values.listar) {
    console.log(`${subs.length} aparelho(s) inscrito(s):`);
    for (const s of subs) {
      const last = s.lastSuccessAt ? `última entrega ${s.lastSuccessAt.toISOString()}` : 'nunca entregue';
      console.log(`  · ${s.userAgent?.match(/iPhone|iPad|Android|Mac OS|Windows/)?.[0] ?? 'aparelho'} — ${last}${s.lastError ? ` — erro: ${s.lastError}` : ''}`);
    }
    process.exit(0);
  }

  const [title, body] = positionals;
  if (!title || !body) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!values.url.startsWith('/')) {
    console.error('--url precisa ser um caminho do app, começando com / (ex.: /contas)');
    process.exit(1);
  }
  if (subs.length === 0) {
    console.error('Nenhum aparelho inscrito. Ative as notificações em Ajustes › Notificações no iPhone.');
    process.exit(1);
  }

  const result = await sendToAll(
    { title, body, url: values.url, tag: `manual-${Date.now()}`, badge: await unreviewedCount() },
    prismaSubscriptionStore,
    createWebPushSender(env),
  );
  console.log(`Enviada: ${result.sent} entregue(s), ${result.failed} falha(s), ${result.removed} inscrição(ões) expirada(s) removida(s).`);
  process.exit(result.sent > 0 ? 0 : 1);
} finally {
  await prisma.$disconnect();
}
