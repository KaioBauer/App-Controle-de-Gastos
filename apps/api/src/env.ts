import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SESSION_DAYS: z.coerce.number().int().positive().default(180),
  VAPID_PUBLIC_KEY: z.string().min(1, 'Gere com: pnpm gen-vapid'),
  VAPID_PRIVATE_KEY: z.string().min(1, 'Gere com: pnpm gen-vapid'),
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, 'Use mailto:email ou uma URL https'),
  // Pluggy é opcional: sem credenciais o app funciona só com lançamentos manuais
  PLUGGY_CLIENT_ID: z.string().trim().optional().transform((v) => v || undefined),
  PLUGGY_CLIENT_SECRET: z.string().trim().optional().transform((v) => v || undefined),
  PLUGGY_WEBHOOK_SECRET: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || v.length >= 24, 'Use pelo menos 24 caracteres aleatórios'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return parsed.data;
}
