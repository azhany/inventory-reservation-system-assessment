import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from '../../apps/api/src/db/migrations.js';
import { findInventoryByProductId } from '../../apps/api/src/modules/inventory/inventory-repository.js';
import { PostgresReservationPersistence } from '../../apps/api/src/modules/reservation/postgres-reservation-persistence.js';
import { ReservationExpiredError } from '../../apps/api/src/modules/reservation/reservation.js';
import { ReservationService } from '../../apps/api/src/modules/reservation/reservation-service.js';
import { seedProduct } from '../support/seed-product.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithDatabase = describe.runIf(databaseUrl !== undefined);
const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

describeWithDatabase('reservation expiry', () => {
  let now: Date;
  let pool: Pool;
  let reservations: ReservationService;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await runMigrations(pool, migrationsDirectory);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE reservations, inventories, products');
    now = new Date('2026-08-12T00:00:00.000Z');
    reservations = new ReservationService({
      clock: { now: () => now },
      generateReservationId: randomUUID,
      persistence: new PostgresReservationPersistence(pool),
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('supports a configurable TTL while defaulting to two minutes', async () => {
    const product = await seedProduct(pool, { totalStock: 2 });
    const defaultReservation = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });
    const shortReservations = new ReservationService({
      clock: { now: () => now },
      generateReservationId: randomUUID,
      persistence: new PostgresReservationPersistence(pool),
      reservationTtlMilliseconds: 1_000,
    });
    const shortReservation = await shortReservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });

    expect(defaultReservation.expiresAt).toEqual(
      new Date('2026-08-12T00:02:00.000Z'),
    );
    expect(shortReservation.expiresAt).toEqual(
      new Date('2026-08-12T00:00:01.000Z'),
    );
  });

  it('lazily expires stale reservations before checking availability', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const expiredReservation = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });
    now = new Date(expiredReservation.expiresAt);

    const replacement = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });

    expect((await reservations.get(expiredReservation.id))?.status).toBe('EXPIRED');
    expect(replacement.status).toBe('ACTIVE');
    expect(await findInventoryByProductId(pool, product.id)).toEqual({
      availableStock: 0,
      productId: product.id,
      reservedStock: 1,
      soldStock: 0,
      totalStock: 1,
    });
  });

  it.each(['confirm', 'cancel'] as const)(
    'expires a stale active reservation and rejects %s',
    async (operation) => {
      const product = await seedProduct(pool, { totalStock: 1 });
      const created = await reservations.reserve({
        productId: product.id,
        userId: randomUUID(),
      });
      now = new Date(created.expiresAt);

      await expect(reservations[operation](created.id))
        .rejects.toBeInstanceOf(ReservationExpiredError);

      expect((await reservations.get(created.id))?.status).toBe('EXPIRED');
      expect(await findInventoryByProductId(pool, product.id)).toEqual({
        availableStock: 1,
        productId: product.id,
        reservedStock: 0,
        soldStock: 0,
        totalStock: 1,
      });
    },
  );

  it('expires stale active reservations through periodic cleanup behavior', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const created = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });
    now = new Date(created.expiresAt);

    const expiredCount = await reservations.expireStaleReservations();

    expect(expiredCount).toBe(1);
    expect((await reservations.get(created.id))?.status).toBe('EXPIRED');
    expect((await findInventoryByProductId(pool, product.id))?.availableStock).toBe(1);
  });

  it('does not expire or release a confirmed purchase', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const created = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });
    now = new Date('2026-08-12T00:01:00.000Z');
    await reservations.confirm(created.id);
    now = new Date('2026-08-12T00:03:00.000Z');

    const expiredCount = await reservations.expireStaleReservations();

    expect(expiredCount).toBe(0);
    expect((await reservations.get(created.id))?.status).toBe('CONFIRMED');
    expect(await findInventoryByProductId(pool, product.id)).toEqual({
      availableStock: 0,
      productId: product.id,
      reservedStock: 0,
      soldStock: 1,
      totalStock: 1,
    });
  });
});
