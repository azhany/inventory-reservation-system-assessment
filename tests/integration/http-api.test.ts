import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../apps/api/src/app.js';
import { runMigrations } from '../../apps/api/src/db/migrations.js';
import { findInventoryByProductId } from '../../apps/api/src/modules/inventory/inventory-repository.js';
import { PostgresReservationPersistence } from '../../apps/api/src/modules/reservation/postgres-reservation-persistence.js';
import { ReservationService } from '../../apps/api/src/modules/reservation/reservation-service.js';
import { seedProduct } from '../support/seed-product.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithDatabase = describe.runIf(databaseUrl !== undefined);
const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

describeWithDatabase('HTTP API contract', () => {
  let app: ReturnType<typeof buildApp>;
  let now: Date;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await runMigrations(pool, migrationsDirectory);
    const reservations = new ReservationService({
      clock: { now: () => now },
      generateReservationId: randomUUID,
      persistence: new PostgresReservationPersistence(pool),
    });
    app = buildApp({
      checkDatabase: async () => true,
      findInventoryByProductId: async (productId) =>
        findInventoryByProductId(pool, productId),
      reservations,
    });
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE reservations, inventories, products');
    now = new Date('2026-08-12T00:00:00.000Z');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('returns inventory state and validates the product identifier', async () => {
    const product = await seedProduct(pool, { totalStock: 3 });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${product.id}/inventory`,
    });
    const missingResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${randomUUID()}/inventory`,
    });
    const invalidResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/products/not-a-uuid/inventory',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      availableStock: 3,
      productId: product.id,
      reservedStock: 0,
      soldStock: 0,
      totalStock: 3,
    });
    expect(missingResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toEqual({
      code: 'INVENTORY_NOT_FOUND',
      message: 'Inventory was not found for this product.',
    });
    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'The request is invalid.',
    });
  });

  it('creates, reads, and confirms a reservation using the OpenAPI response shape', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const userId = randomUUID();

    const createResponse = await app.inject({
      method: 'POST',
      payload: { userId },
      url: `/api/v1/products/${product.id}/reservations`,
    });
    const created = createResponse.json<{
      id: string;
    }>();
    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/reservations/${created.id}`,
    });
    now = new Date('2026-08-12T00:01:00.000Z');
    const confirmResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/reservations/${created.id}/confirm`,
    });
    const invalidTransitionResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/reservations/${created.id}/cancel`,
    });

    const expectedActiveReservation = {
      cancelledAt: null,
      confirmedAt: null,
      createdAt: '2026-08-12T00:00:00.000Z',
      expiresAt: '2026-08-12T00:02:00.000Z',
      id: created.id,
      productId: product.id,
      status: 'ACTIVE',
      userId,
    };
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toEqual(expectedActiveReservation);
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(expectedActiveReservation);
    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json()).toEqual({
      ...expectedActiveReservation,
      confirmedAt: '2026-08-12T00:01:00.000Z',
      status: 'CONFIRMED',
    });
    expect(invalidTransitionResponse.statusCode).toBe(409);
    expect(invalidTransitionResponse.json()).toEqual({
      code: 'INVALID_RESERVATION_STATE',
      message: 'The reservation cannot transition from its current state.',
    });
  });

  it('cancels an active reservation and reports missing reservations', async () => {
    const product = await seedProduct(pool, { totalStock: 1 });
    const createResponse = await app.inject({
      method: 'POST',
      payload: { userId: randomUUID() },
      url: `/api/v1/products/${product.id}/reservations`,
    });
    const created = createResponse.json<{ id: string }>();

    const cancelResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/reservations/${created.id}/cancel`,
    });
    const missingResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/reservations/${randomUUID()}`,
    });

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({
      cancelledAt: '2026-08-12T00:00:00.000Z',
      id: created.id,
      status: 'CANCELLED',
    });
    expect(missingResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toEqual({
      code: 'RESERVATION_NOT_FOUND',
      message: 'Reservation was not found.',
    });
  });

  it('validates reserve input and maps unavailable inventory to conflict', async () => {
    const product = await seedProduct(pool, { totalStock: 0 });

    const invalidResponse = await app.inject({
      method: 'POST',
      payload: { userId: 'invalid' },
      url: `/api/v1/products/${product.id}/reservations`,
    });
    const malformedResponse = await app.inject({
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      payload: '{"userId":',
      url: `/api/v1/products/${product.id}/reservations`,
    });
    const conflictResponse = await app.inject({
      method: 'POST',
      payload: { userId: randomUUID() },
      url: `/api/v1/products/${product.id}/reservations`,
    });

    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'The request is invalid.',
    });
    expect(malformedResponse.statusCode).toBe(400);
    expect(malformedResponse.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'The request is invalid.',
    });
    expect(conflictResponse.statusCode).toBe(409);
    expect(conflictResponse.json()).toEqual({
      code: 'OUT_OF_STOCK',
      message: 'No inventory is currently available for reservation.',
    });
  });
});
