import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from '../../apps/api/src/db/migrations.js';
import { findInventoryByProductId } from '../../apps/api/src/modules/inventory/inventory-repository.js';
import { PostgresReservationPersistence } from '../../apps/api/src/modules/reservation/postgres-reservation-persistence.js';
import { InvalidReservationStateError } from '../../apps/api/src/modules/reservation/reservation.js';
import { ReservationService } from '../../apps/api/src/modules/reservation/reservation-service.js';
import { seedProduct } from '../support/seed-product.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithDatabase = describe.runIf(databaseUrl !== undefined);
const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

describeWithDatabase('reservation lifecycle concurrency', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await runMigrations(pool, migrationsDirectory);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE reservations, inventories, products');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('allows exactly one concurrent terminal transition', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const reservations = new ReservationService({
      clock: { now: () => new Date('2026-08-12T00:01:00.000Z') },
      generateReservationId: randomUUID,
      persistence: new PostgresReservationPersistence(pool),
    });
    const created = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });

    const results = await Promise.allSettled([
      reservations.confirm(created.id),
      reservations.cancel(created.id),
    ]);
    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBeInstanceOf(InvalidReservationStateError);

    const persisted = await reservations.get(created.id);
    const inventory = await findInventoryByProductId(pool, product.id);
    expect(persisted?.status).toMatch(/^(CONFIRMED|CANCELLED)$/u);
    expect(inventory?.reservedStock).toBe(0);
    expect(inventory?.soldStock).toBe(persisted?.status === 'CONFIRMED' ? 1 : 0);
    expect(inventory?.availableStock).toBe(persisted?.status === 'CANCELLED' ? 1 : 0);
  });
});
