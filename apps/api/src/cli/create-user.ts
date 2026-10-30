import { createInterface } from 'node:readline/promises';
import argon2 from 'argon2';
import { asSystem, prisma, runAsUser } from '../lib/db';
import { ensureDefaults } from '../modules/finance/defaults';

/**
 * Cria um usuário (com dados próprios e separados dos outros) ou redefine a senha de um existente.
 * Uso: pnpm create-user            (interativo)
 *      docker compose exec api node dist/cli/create-user.js   (no servidor)
 *      deploy/create-user.sh       (do PC, via SSH)
 */
const rl = createInterface({ input: process.stdin, output: process.stdout });
const username = process.env.USERNAME_NEW ?? (await rl.question('Usuário: ')).trim();
const password = process.env.PASSWORD_NEW ?? (await rl.question('Senha (mín. 8 caracteres): '));
rl.close();

if (!username || password.length < 8) {
  console.error('Usuário obrigatório e senha com pelo menos 8 caracteres.');
  process.exit(1);
}

const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
await asSystem(async () => {
  const existing = await prisma.user.findUnique({ where: { username } });
  const user = await prisma.user.upsert({ where: { username }, create: { username, passwordHash }, update: { passwordHash } });
  // Redefinir a senha encerra as sessões abertas
  if (existing) await prisma.session.deleteMany({ where: { userId: existing.id } });
  // Categorias padrão e a conta "Dinheiro" do usuário
  await runAsUser(user.id, () => ensureDefaults());
  console.log(existing ? `Senha de "${username}" redefinida.` : `Usuário "${username}" criado, com os próprios dados.`);
});
await prisma.$disconnect();
