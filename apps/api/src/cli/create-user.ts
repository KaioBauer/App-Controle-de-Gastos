import { createInterface } from 'node:readline/promises';
import argon2 from 'argon2';
import { prisma } from '../lib/db';

/**
 * Cria (ou redefine a senha do) usuário único.
 * Uso: pnpm create-user            (interativo)
 *      docker compose exec api node dist/cli/create-user.js   (no servidor)
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
const existing = await prisma.user.findFirst();
if (existing && existing.username !== username) {
  console.error(`Já existe o usuário "${existing.username}". Este app é de usuário único.`);
  process.exit(1);
}
await prisma.user.upsert({ where: { username }, create: { username, passwordHash }, update: { passwordHash } });
// Redefinir a senha encerra as sessões abertas
if (existing) await prisma.session.deleteMany({ where: { userId: existing.id } });
await prisma.$disconnect();
console.log(`Usuário "${username}" salvo.`);
