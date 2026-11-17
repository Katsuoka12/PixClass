import 'dotenv/config';
import { z } from 'zod';

export const configSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().regex(/^[a-zA-Z0-9_]+$/).default('student_tag'),
  DB_USER: z.string().min(1).default('root'),
  DB_PASS: z.string().default(''),
  JWT_SECRET: z.string().min(32).refine(value => !value.startsWith('replace-') && !value.startsWith('change-me'), 'Replace the example JWT secret'),
  WEB_URL: z.url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  }, 'WEB_URL must be an HTTP(S) origin without a trailing slash'),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_BOT_USERNAME: z.string().default(''),
  TELEGRAM_MODE: z.enum(['polling', 'webhook']).default('polling'),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
  JITSI_DOMAIN: z.string().regex(/^[a-zA-Z0-9.-]+(?::\d+)?$/).default('meet.jit.si'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
}).superRefine((value, context) => {
  if (value.TELEGRAM_BOT_TOKEN || value.TELEGRAM_BOT_USERNAME) {
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(value.TELEGRAM_BOT_TOKEN)) context.addIssue({ code: 'custom', path: ['TELEGRAM_BOT_TOKEN'], message: 'Invalid bot token' });
    if (!/^[A-Za-z][A-Za-z0-9_]{1,28}bot$/i.test(value.TELEGRAM_BOT_USERNAME)) context.addIssue({ code: 'custom', path: ['TELEGRAM_BOT_USERNAME'], message: 'Invalid bot username' });
    if (value.TELEGRAM_MODE === 'webhook') {
      if (!/^[A-Za-z0-9_-]{32,256}$/.test(value.TELEGRAM_WEBHOOK_SECRET)) context.addIssue({ code: 'custom', path: ['TELEGRAM_WEBHOOK_SECRET'], message: 'Webhook secret required' });
      if (!URL.canParse(value.WEB_URL) || !value.WEB_URL.startsWith('https://') || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value.WEB_URL).hostname)) context.addIssue({ code: 'custom', path: ['WEB_URL'], message: 'Webhook requires public HTTPS' });
    }
  }
  if (value.NODE_ENV === 'production' && !value.WEB_URL.startsWith('https://')) {
    context.addIssue({ code: 'custom', path: ['WEB_URL'], message: 'Production requires HTTPS' });
  }
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    // Report field names only: environment values may contain credentials.
    throw new Error(`Invalid environment fields: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  return result.data;
}
