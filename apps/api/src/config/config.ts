import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
});

export type AppConfig = Readonly<{
  databaseUrl: string;
  host: string;
  logLevel: z.infer<typeof environmentSchema>['LOG_LEVEL'];
  nodeEnv: z.infer<typeof environmentSchema>['NODE_ENV'];
  port: number;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

export function loadConfig(environment: Environment = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    throw new Error('Invalid application configuration.');
  }

  return {
    databaseUrl: result.data.DATABASE_URL,
    host: result.data.HOST,
    logLevel: result.data.LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
  };
}
