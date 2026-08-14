import { buildApp } from './app.js';
import { loadConfig } from './config/config.js';
import { checkDatabase, createDatabasePool } from './db/database.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createDatabasePool(config.databaseUrl);
  const app = buildApp(
    { checkDatabase: async () => checkDatabase(pool) },
    { logger: { level: config.logLevel } },
  );

  app.addHook('onClose', async () => {
    await pool.end();
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down');
    await app.close();
  };

  const requestShutdown = (signal: NodeJS.Signals): void => {
    void shutdown(signal).catch((error: unknown) => {
      app.log.error({ error, signal }, 'Graceful shutdown failed');
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', () => requestShutdown('SIGINT'));
  process.once('SIGTERM', () => requestShutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = 1;
});
