import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from '../../apps/api/src/db/migrations.js';
import { findInventoryByProductId } from '../../apps/api/src/modules/inventory/inventory-repository.js';
import { PostgresReservationPersistence } from '../../apps/api/src/modules/reservation/postgres-reservation-persistence.js';
import {
  InvalidReservationStateError,
} from '../../apps/api/src/modules/reservation/reservation.js';
import { ReservationService } from '../../apps/api/src/modules/reservation/reservation-service.js';
import { seedProduct } from '../support/seed-product.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithDatabase = describe.runIf(databaseUrl !== undefined);
const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

describeWithDatabase('reservation lifecycle', () => {
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

  it('looks up an existing reservation and returns null when it is absent', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const created = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });

    expect(await reservations.get(created.id)).toEqual(created);
    expect(await reservations.get(randomUUID())).toBeNull();
  });

  it('confirms an active reservation and atomically moves reserved stock to sold', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const created = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });
    now = new Date('2026-08-12T00:01:00.000Z');

    const confirmed = await reservations.confirm(created.id);

    expect(confirmed).toEqual({
      ...created,
      confirmedAt: now,
      status: 'CONFIRMED',
    });
    expect(await reservations.get(created.id)).toEqual(confirmed);
    expect(await findInventoryByProductId(pool, product.id)).toEqual({
      availableStock: 0,
      productId: product.id,
      reservedStock: 0,
      soldStock: 1,
      totalStock: 1,
    });
  });

  it('cancels an active reservation and releases its stock', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const created = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });
    now = new Date('2026-08-12T00:01:00.000Z');

    const cancelled = await reservations.cancel(created.id);

    expect(cancelled).toEqual({
      ...created,
      cancelledAt: now,
      status: 'CANCELLED',
    });
    expect(await findInventoryByProductId(pool, product.id)).toEqual({
      availableStock: 1,
      productId: product.id,
      reservedStock: 0,
      soldStock: 0,
      totalStock: 1,
    });
  });

  it('rejects transitions from confirmed and cancelled terminal states', async () => {
    const product = await seedProduct(pool, { totalStock: 2 });
    const confirmedReservation = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });
    const cancelledReservation = await reservations.reserve({
      productId: product.id,
      userId: randomUUID(),
    });
    await reservations.confirm(confirmedReservation.id);
    await reservations.cancel(cancelledReservation.id);

    await expect(reservations.cancel(confirmedReservation.id))
      .rejects.toBeInstanceOf(InvalidReservationStateError);
    await expect(reservations.confirm(cancelledReservation.id))
      .rejects.toBeInstanceOf(InvalidReservationStateError);
    expect(await findInventoryByProductId(pool, product.id)).toEqual({
      availableStock: 1,
      productId: product.id,
      reservedStock: 0,
      soldStock: 1,
      totalStock: 2,
    });
  });
});
