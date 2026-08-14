import { randomUUID } from 'node:crypto';

import { buildApp } from './app.js';
import { loadConfig } from './config/config.js';
import { checkDatabase, createDatabasePool } from './db/database.js';
import { findInventoryByProductId } from './modules/inventory/inventory-repository.js';
import { PostgresReservationPersistence } from './modules/reservation/postgres-reservation-persistence.js';
import { ReservationService } from './modules/reservation/reservation-service.js';
import {
  type ReservationExpiryWorker,
  startReservationExpiryWorker,
} from './workers/reservation-expiry-worker.js';

const expiryCleanupIntervalMilliseconds = 30_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createDatabasePool(config.databaseUrl);
  const reservations = new ReservationService({
    clock: { now: () => new Date() },
    generateReservationId: randomUUID,
    persistence: new PostgresReservationPersistence(pool),
  });
  const app = buildApp(
    {
      checkDatabase: async () => checkDatabase(pool),
      findInventoryByProductId: async (productId) =>
        findInventoryByProductId(pool, productId),
      reservations,
    },
    { logger: { level: config.logLevel } },
  );
  let expiryWorker: ReservationExpiryWorker | null = null;

  app.addHook('onClose', async () => {
    await expiryWorker?.stop();
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
  expiryWorker = startReservationExpiryWorker({
    expireStaleReservations: async () => reservations.expireStaleReservations(),
    intervalMilliseconds: expiryCleanupIntervalMilliseconds,
    onError: (error) => {
      app.log.error({ error }, 'Reservation expiry cleanup failed');
    },
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = 1;
});
