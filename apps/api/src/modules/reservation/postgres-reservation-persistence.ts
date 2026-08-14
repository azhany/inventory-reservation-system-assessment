import { type Pool, type PoolClient } from 'pg';

import { lockInventoryByProductId } from '../inventory/inventory-repository.js';
import {
  type LockedInventoryTransaction,
  type LockedInventoryWork,
  type ReservationPersistence,
} from './reserve-inventory.js';
import { type Reservation } from './reservation.js';

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

async function incrementReservedStock(
  transaction: PoolClient,
  productId: string,
): Promise<void> {
  const result = await transaction.query(`
    UPDATE inventories
    SET reserved_stock = reserved_stock + 1, updated_at = NOW()
    WHERE product_id = $1
  `, [productId]);

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
    incrementReservedStock: async (productId) =>
      incrementReservedStock(client, productId),
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
}
