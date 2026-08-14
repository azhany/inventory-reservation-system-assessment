import { type Pool, type PoolClient } from 'pg';

import { lockInventoryByProductId } from '../inventory/inventory-repository.js';
import {
  type LockedInventoryTransaction,
  type LockedInventoryWork,
  type LockedReservationWork,
  type ReservationPersistence,
} from './reservation-service.js';
import {
  type Reservation,
  type ReservationStatus,
} from './reservation.js';

interface ReservationRow {
  cancelled_at: Date | null;
  confirmed_at: Date | null;
  created_at: Date;
  expires_at: Date;
  id: string;
  product_id: string;
  status: string;
  user_id: string;
}

function toReservationStatus(status: string): ReservationStatus {
  switch (status) {
    case 'ACTIVE':
    case 'CONFIRMED':
    case 'CANCELLED':
    case 'EXPIRED':
      return status;
    default:
      throw new Error(`Unsupported persisted reservation status: ${status}.`);
  }
}

function toReservation(row: ReservationRow): Reservation {
  return {
    cancelledAt: row.cancelled_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    productId: row.product_id,
    status: toReservationStatus(row.status),
    userId: row.user_id,
  };
}

async function findReservationById(
  database: Pool | PoolClient,
  reservationId: string,
): Promise<Reservation | null> {
  const result = await database.query<ReservationRow>(`
    SELECT
      id,
      product_id,
      user_id,
      status,
      expires_at,
      confirmed_at,
      cancelled_at,
      created_at
    FROM reservations
    WHERE id = $1
  `, [reservationId]);
  const row = result.rows[0];

  return row === undefined ? null : toReservation(row);
}

async function lockReservationById(
  transaction: PoolClient,
  reservationId: string,
): Promise<Reservation | null> {
  const result = await transaction.query<ReservationRow>(`
    SELECT
      id,
      product_id,
      user_id,
      status,
      expires_at,
      confirmed_at,
      cancelled_at,
      created_at
    FROM reservations
    WHERE id = $1
    FOR UPDATE
  `, [reservationId]);
  const row = result.rows[0];

  return row === undefined ? null : toReservation(row);
}

async function findReservationProductId(
  transaction: PoolClient,
  reservationId: string,
): Promise<string | null> {
  const result = await transaction.query<{ product_id: string }>(
    'SELECT product_id FROM reservations WHERE id = $1',
    [reservationId],
  );

  return result.rows[0]?.product_id ?? null;
}

async function insertActiveReservation(
  transaction: PoolClient,
  reservation: Reservation,
): Promise<void> {
  await transaction.query(`
    INSERT INTO reservations (
      id,
      product_id,
      user_id,
      status,
      expires_at,
      confirmed_at,
      cancelled_at,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
  `, [
    reservation.id,
    reservation.productId,
    reservation.userId,
    reservation.status,
    reservation.expiresAt,
    reservation.confirmedAt,
    reservation.cancelledAt,
    reservation.createdAt,
  ]);
}

async function updateReservation(
  transaction: PoolClient,
  reservation: Reservation,
  updatedAt: Date,
): Promise<void> {
  const result = await transaction.query(`
    UPDATE reservations
    SET
      status = $2,
      confirmed_at = $3,
      cancelled_at = $4,
      updated_at = $5
    WHERE id = $1
  `, [
    reservation.id,
    reservation.status,
    reservation.confirmedAt,
    reservation.cancelledAt,
    updatedAt,
  ]);

  if (result.rowCount !== 1) {
    throw new Error(`Reservation ${reservation.id} disappeared while locked.`);
  }
}

async function expireStaleActiveReservations(
  transaction: PoolClient,
  productId: string,
  expiresAt: Date,
  updatedAt: Date,
): Promise<number> {
  const result = await transaction.query(`
    UPDATE reservations
    SET status = 'EXPIRED', updated_at = $3
    WHERE product_id = $1
      AND status = 'ACTIVE'
      AND expires_at <= $2
  `, [productId, expiresAt, updatedAt]);

  return result.rowCount ?? 0;
}

async function updateInventoryCounters(
  transaction: PoolClient,
  query: string,
  values: unknown[],
  productId: string,
): Promise<void> {
  const result = await transaction.query(query, values);

  if (result.rowCount !== 1) {
    throw new Error(`Inventory was not found for product ${productId}.`);
  }
}

function createLockedInventoryTransaction(
  client: PoolClient,
): LockedInventoryTransaction {
  return {
    createActiveReservation: async (reservation) =>
      insertActiveReservation(client, reservation),
    expireStaleActiveReservations: async (productId, expiresAt, updatedAt) =>
      expireStaleActiveReservations(client, productId, expiresAt, updatedAt),
    incrementReservedStock: async (productId, updatedAt) =>
      updateInventoryCounters(client, `
        UPDATE inventories
        SET reserved_stock = reserved_stock + 1, updated_at = $2
        WHERE product_id = $1
      `, [productId, updatedAt], productId),
    moveReservedStockToSold: async (productId, updatedAt) =>
      updateInventoryCounters(client, `
        UPDATE inventories
        SET
          reserved_stock = reserved_stock - 1,
          sold_stock = sold_stock + 1,
          updated_at = $2
        WHERE product_id = $1
      `, [productId, updatedAt], productId),
    releaseReservedStock: async (productId, quantity, updatedAt) =>
      updateInventoryCounters(client, `
        UPDATE inventories
        SET reserved_stock = reserved_stock - $2, updated_at = $3
        WHERE product_id = $1
      `, [productId, quantity, updatedAt], productId),
    updateReservation: async (reservation, updatedAt) =>
      updateReservation(client, reservation, updatedAt),
  };
}

async function rollback(client: PoolClient, transactionError: unknown): Promise<never> {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    throw new AggregateError(
      [transactionError, rollbackError],
      'Reservation transaction failed and could not be rolled back.',
    );
  }

  throw transactionError;
}

export class PostgresReservationPersistence implements ReservationPersistence {
  constructor(private readonly pool: Pool) {}

  async findReservationById(reservationId: string): Promise<Reservation | null> {
    return findReservationById(this.pool, reservationId);
  }

  async findStaleActiveReservationProductIds(
    expiresAt: Date,
  ): Promise<readonly string[]> {
    const result = await this.pool.query<{ product_id: string }>(`
      SELECT DISTINCT product_id
      FROM reservations
      WHERE status = 'ACTIVE' AND expires_at <= $1
      ORDER BY product_id
    `, [expiresAt]);

    return result.rows.map(({ product_id: productId }) => productId);
  }

  async withLockedInventory<Result>(
    productId: string,
    work: LockedInventoryWork<Result>,
  ): Promise<Result> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const inventory = await lockInventoryByProductId(client, productId);
      const result = await work(
        inventory,
        createLockedInventoryTransaction(client),
      );
      await client.query('COMMIT');

      return result;
    } catch (error) {
      return rollback(client, error);
    } finally {
      client.release();
    }
  }

  async withLockedReservation<Result>(
    reservationId: string,
    work: LockedReservationWork<Result>,
  ): Promise<Result | null> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const productId = await findReservationProductId(client, reservationId);

      if (productId === null) {
        await client.query('COMMIT');
        return null;
      }

      const inventory = await lockInventoryByProductId(client, productId);
      if (inventory === null) {
        throw new Error(`Inventory was not found for product ${productId}.`);
      }

      const reservation = await lockReservationById(client, reservationId);
      if (reservation === null) {
        await client.query('COMMIT');
        return null;
      }

      const result = await work(
        reservation,
        createLockedInventoryTransaction(client),
      );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      return rollback(client, error);
    } finally {
      client.release();
    }
  }
}
