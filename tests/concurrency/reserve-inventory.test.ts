import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from '../../apps/api/src/db/migrations.js';
import { findInventoryByProductId } from '../../apps/api/src/modules/inventory/inventory-repository.js';
import { PostgresReservationPersistence } from '../../apps/api/src/modules/reservation/postgres-reservation-persistence.js';
import {
  OutOfStockError,
  ReservationService,
} from '../../apps/api/src/modules/reservation/reservation-service.js';
import { seedProduct } from '../support/seed-product.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithDatabase = describe.runIf(databaseUrl !== undefined);
const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

describeWithDatabase('reservation concurrency', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 20 });
    await runMigrations(pool, migrationsDirectory);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE reservations, inventories, products');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('allows exactly one of 500 parallel attempts to reserve the final item', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const reservations = new ReservationService({
      clock: { now: () => new Date('2026-08-12T00:00:00.000Z') },
      generateReservationId: randomUUID,
      persistence: new PostgresReservationPersistence(pool),
    });

    const attempts = Array.from({ length: 500 }, () =>
      reservations.reserve({ productId: product.id, userId: randomUUID() }));
    const results = await Promise.allSettled(attempts);
    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(499);
    expect(failures.every(
      (result) => result.reason instanceof OutOfStockError,
    )).toBe(true);
    expect(await findInventoryByProductId(pool, product.id)).toEqual({
      availableStock: 0,
      productId: product.id,
      reservedStock: 1,
      soldStock: 0,
      totalStock: 1,
    });

    const reservationState = await pool.query<{
      active_count: string;
      capacity_is_valid: boolean;
    }>(`
      SELECT
        COUNT(reservations.id) FILTER (WHERE reservations.status = 'ACTIVE') AS active_count,
        BOOL_AND(
          inventories.reserved_stock + inventories.sold_stock
            <= inventories.total_stock
        ) AS capacity_is_valid
      FROM inventories
      LEFT JOIN reservations
        ON reservations.product_id = inventories.product_id
      WHERE inventories.product_id = $1
    `, [product.id]);
    expect(reservationState.rows).toEqual([{
      active_count: '1',
      capacity_is_valid: true,
    }]);
  }, 30_000);

  it('cannot enter the reserve transaction while another transaction holds the inventory lock', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const lockHolder = await pool.connect();
    const lockCheckingPool = new Pool({
      connectionString: databaseUrl,
      options: '-c lock_timeout=250ms',
    });

    try {
      await lockHolder.query('BEGIN');
      await lockHolder.query(
        'SELECT product_id FROM inventories WHERE product_id = $1 FOR UPDATE',
        [product.id],
      );
      const reservations = new ReservationService({
        clock: { now: () => new Date('2026-08-12T00:00:00.000Z') },
        generateReservationId: randomUUID,
        persistence: new PostgresReservationPersistence(lockCheckingPool),
      });

      await expect(reservations.reserve({
        productId: product.id,
        userId: randomUUID(),
      })).rejects.toMatchObject({ code: '55P03' });

      const reservationCount = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM reservations WHERE product_id = $1',
        [product.id],
      );
      expect(reservationCount.rows[0]?.count).toBe('0');
      expect((await findInventoryByProductId(pool, product.id))?.reservedStock).toBe(0);
    } finally {
      await lockHolder.query('ROLLBACK');
      lockHolder.release();
      await lockCheckingPool.end();
    }
  });
});
