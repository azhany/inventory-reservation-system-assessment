import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from '../../apps/api/src/db/migrations.js';
import { findInventoryByProductId } from '../../apps/api/src/modules/inventory/inventory-repository.js';
import { PostgresReservationPersistence } from '../../apps/api/src/modules/reservation/postgres-reservation-persistence.js';
import {
  createReserveInventory,
  OutOfStockError,
} from '../../apps/api/src/modules/reservation/reserve-inventory.js';
import { seedProduct } from '../support/seed-product.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithDatabase = describe.runIf(databaseUrl !== undefined);
const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

describeWithDatabase('reserve inventory', () => {
  const now = new Date('2026-08-12T00:00:00.000Z');
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

  it('creates a two-minute active reservation and holds one available item', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const userId = randomUUID();
    const reservationId = randomUUID();
    const reserveInventory = createReserveInventory({
      clock: { now: () => now },
      generateReservationId: () => reservationId,
      persistence: new PostgresReservationPersistence(pool),
    });

    const reservation = await reserveInventory({ productId: product.id, userId });

    expect(reservation).toEqual({
      cancelledAt: null,
      confirmedAt: null,
      createdAt: now,
      expiresAt: new Date('2026-08-12T00:02:00.000Z'),
      id: reservationId,
      productId: product.id,
      status: 'ACTIVE',
      userId,
    });
    expect(await findInventoryByProductId(pool, product.id)).toEqual({
      availableStock: 0,
      productId: product.id,
      reservedStock: 1,
      soldStock: 0,
      totalStock: 1,
    });

    const persisted = await pool.query<{
      created_at: Date;
      expires_at: Date;
      status: string;
    }>(`
      SELECT status, created_at, expires_at
      FROM reservations
      WHERE id = $1
    `, [reservationId]);
    expect(persisted.rows).toEqual([{
      created_at: now,
      expires_at: new Date('2026-08-12T00:02:00.000Z'),
      status: 'ACTIVE',
    }]);
  });

  it('rejects unavailable inventory without creating a reservation or changing counters', async () => {
    const product = await seedProduct(pool, { totalStock: 0 });
    const reserveInventory = createReserveInventory({
      clock: { now: () => now },
      generateReservationId: randomUUID,
      persistence: new PostgresReservationPersistence(pool),
    });

    await expect(reserveInventory({
      productId: product.id,
      userId: randomUUID(),
    })).rejects.toBeInstanceOf(OutOfStockError);

    const reservationCount = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM reservations WHERE product_id = $1',
      [product.id],
    );
    expect(reservationCount.rows[0]?.count).toBe('0');
    expect(await findInventoryByProductId(pool, product.id)).toEqual({
      availableStock: 0,
      productId: product.id,
      reservedStock: 0,
      soldStock: 0,
      totalStock: 0,
    });
  });
});
