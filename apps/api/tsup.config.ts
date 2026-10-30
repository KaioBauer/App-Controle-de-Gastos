import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/create-user.ts', 'src/cli/gen-vapid.ts', 'src/cli/send-push.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  // O pacote compartilhado é TypeScript puro: entra no bundle
  noExternal: ['@financas/shared'],
});
