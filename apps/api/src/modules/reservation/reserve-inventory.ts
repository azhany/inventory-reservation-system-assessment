import { type InventoryReadModel } from '../inventory/inventory.js';
import { type Reservation } from './reservation.js';

const reservationHoldMilliseconds = 2 * 60 * 1_000;

export type ReserveInventoryInput = Readonly<{
  productId: string;
  userId: string;
}>;

export type Clock = Readonly<{
  now: () => Date;
}>;

export type LockedInventoryTransaction = Readonly<{
  createActiveReservation: (reservation: Reservation) => Promise<void>;
  incrementReservedStock: (productId: string) => Promise<void>;
}>;

export type LockedInventoryWork<Result> = (
  inventory: InventoryReadModel | null,
  transaction: LockedInventoryTransaction,
) => Promise<Result>;

export type ReservationPersistence = Readonly<{
  withLockedInventory: <Result>(
    productId: string,
    work: LockedInventoryWork<Result>,
  ) => Promise<Result>;
}>;

type ReserveInventoryDependencies = Readonly<{
  clock: Clock;
  generateReservationId: () => string;
  persistence: ReservationPersistence;
}>;

export class InventoryNotFoundError extends Error {
  readonly productId: string;

  constructor(productId: string) {
    super(`Inventory was not found for product ${productId}.`);
    this.name = 'InventoryNotFoundError';
    this.productId = productId;
  }
}

export class OutOfStockError extends Error {
  readonly productId: string;

  constructor(productId: string) {
    super('No inventory is currently available for reservation.');
    this.name = 'OutOfStockError';
    this.productId = productId;
  }
}

export function createReserveInventory(
  dependencies: ReserveInventoryDependencies,
): (input: ReserveInventoryInput) => Promise<Reservation> {
  return async (input) => dependencies.persistence.withLockedInventory(
    input.productId,
    async (inventory, transaction) => {
      if (inventory === null) {
        throw new InventoryNotFoundError(input.productId);
      }

      if (inventory.availableStock <= 0) {
        throw new OutOfStockError(input.productId);
      }

      const createdAt = new Date(dependencies.clock.now());
      const reservation: Reservation = {
        cancelledAt: null,
        confirmedAt: null,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + reservationHoldMilliseconds),
        id: dependencies.generateReservationId(),
        productId: input.productId,
        status: 'ACTIVE',
        userId: input.userId,
      };

      await transaction.createActiveReservation(reservation);
      await transaction.incrementReservedStock(input.productId);

      return reservation;
    },
  );
}
