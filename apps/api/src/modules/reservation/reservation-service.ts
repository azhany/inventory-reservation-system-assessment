import { type InventoryReadModel } from '../inventory/inventory.js';
import {
  cancelActiveReservation,
  confirmActiveReservation,
  expireActiveReservation,
  isReservationExpired,
  type Reservation,
  ReservationExpiredError,
  ReservationNotFoundError,
} from './reservation.js';

const defaultReservationTtlMilliseconds = 2 * 60 * 1_000;

export type ReserveInventoryInput = Readonly<{
  productId: string;
  userId: string;
}>;

export type Clock = Readonly<{
  now: () => Date;
}>;

export type LockedInventoryTransaction = Readonly<{
  createActiveReservation: (reservation: Reservation) => Promise<void>;
  expireStaleActiveReservations: (
    productId: string,
    expiresAt: Date,
    updatedAt: Date,
  ) => Promise<number>;
  incrementReservedStock: (productId: string, updatedAt: Date) => Promise<void>;
  moveReservedStockToSold: (productId: string, updatedAt: Date) => Promise<void>;
  releaseReservedStock: (
    productId: string,
    quantity: number,
    updatedAt: Date,
  ) => Promise<void>;
  updateReservation: (reservation: Reservation, updatedAt: Date) => Promise<void>;
}>;

export type LockedInventoryWork<Result> = (
  inventory: InventoryReadModel | null,
  transaction: LockedInventoryTransaction,
) => Promise<Result>;

export type LockedReservationWork<Result> = (
  reservation: Reservation,
  transaction: LockedInventoryTransaction,
) => Promise<Result>;

export type ReservationPersistence = Readonly<{
  findReservationById: (reservationId: string) => Promise<Reservation | null>;
  findStaleActiveReservationProductIds: (expiresAt: Date) => Promise<readonly string[]>;
  withLockedInventory: <Result>(
    productId: string,
    work: LockedInventoryWork<Result>,
  ) => Promise<Result>;
  withLockedReservation: <Result>(
    reservationId: string,
    work: LockedReservationWork<Result>,
  ) => Promise<Result | null>;
}>;

type ReservationServiceDependencies = Readonly<{
  clock: Clock;
  generateReservationId: () => string;
  persistence: ReservationPersistence;
  reservationTtlMilliseconds?: number;
}>;

type TransitionOutcome =
  | Readonly<{ kind: 'expired' }>
  | Readonly<{ kind: 'transitioned'; reservation: Reservation }>;

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

async function expireStaleReservationsForProduct(
  transaction: LockedInventoryTransaction,
  productId: string,
  now: Date,
): Promise<number> {
  const expiredCount = await transaction.expireStaleActiveReservations(
    productId,
    now,
    now,
  );

  if (expiredCount > 0) {
    await transaction.releaseReservedStock(productId, expiredCount, now);
  }

  return expiredCount;
}

export class ReservationService {
  private readonly reservationTtlMilliseconds: number;

  constructor(private readonly dependencies: ReservationServiceDependencies) {
    this.reservationTtlMilliseconds = dependencies.reservationTtlMilliseconds
      ?? defaultReservationTtlMilliseconds;

    if (
      !Number.isInteger(this.reservationTtlMilliseconds)
      || this.reservationTtlMilliseconds <= 0
    ) {
      throw new RangeError('Reservation TTL must be a positive whole number of milliseconds.');
    }
  }

  async get(reservationId: string): Promise<Reservation | null> {
    return this.dependencies.persistence.findReservationById(reservationId);
  }

  async reserve(input: ReserveInventoryInput): Promise<Reservation> {
    return this.dependencies.persistence.withLockedInventory(
      input.productId,
      async (inventory, transaction) => {
        if (inventory === null) {
          throw new InventoryNotFoundError(input.productId);
        }

        const createdAt = new Date(this.dependencies.clock.now());
        const expiredCount = await expireStaleReservationsForProduct(
          transaction,
          input.productId,
          createdAt,
        );

        if (inventory.availableStock + expiredCount <= 0) {
          throw new OutOfStockError(input.productId);
        }

        const reservation: Reservation = {
          cancelledAt: null,
          confirmedAt: null,
          createdAt,
          expiresAt: new Date(
            createdAt.getTime() + this.reservationTtlMilliseconds,
          ),
          id: this.dependencies.generateReservationId(),
          productId: input.productId,
          status: 'ACTIVE',
          userId: input.userId,
        };

        await transaction.createActiveReservation(reservation);
        await transaction.incrementReservedStock(input.productId, createdAt);

        return reservation;
      },
    );
  }

  async confirm(reservationId: string): Promise<Reservation> {
    const outcome = await this.dependencies.persistence.withLockedReservation(
      reservationId,
      async (reservation, transaction): Promise<TransitionOutcome> => {
        const now = new Date(this.dependencies.clock.now());

        if (isReservationExpired(reservation, now)) {
          const expired = expireActiveReservation(reservation, now);
          await transaction.updateReservation(expired, now);
          await transaction.releaseReservedStock(reservation.productId, 1, now);
          return { kind: 'expired' };
        }

        const confirmed = confirmActiveReservation(reservation, now);
        await transaction.updateReservation(confirmed, now);
        await transaction.moveReservedStockToSold(reservation.productId, now);
        return { kind: 'transitioned', reservation: confirmed };
      },
    );

    return this.resolveTransitionOutcome(reservationId, outcome);
  }

  async cancel(reservationId: string): Promise<Reservation> {
    const outcome = await this.dependencies.persistence.withLockedReservation(
      reservationId,
      async (reservation, transaction): Promise<TransitionOutcome> => {
        const now = new Date(this.dependencies.clock.now());

        if (isReservationExpired(reservation, now)) {
          const expired = expireActiveReservation(reservation, now);
          await transaction.updateReservation(expired, now);
          await transaction.releaseReservedStock(reservation.productId, 1, now);
          return { kind: 'expired' };
        }

        const cancelled = cancelActiveReservation(reservation, now);
        await transaction.updateReservation(cancelled, now);
        await transaction.releaseReservedStock(reservation.productId, 1, now);
        return { kind: 'transitioned', reservation: cancelled };
      },
    );

    return this.resolveTransitionOutcome(reservationId, outcome);
  }

  async expireStaleReservations(): Promise<number> {
    const now = new Date(this.dependencies.clock.now());
    const productIds = await this.dependencies.persistence
      .findStaleActiveReservationProductIds(now);
    let expiredCount = 0;

    for (const productId of productIds) {
      expiredCount += await this.dependencies.persistence.withLockedInventory(
        productId,
        async (inventory, transaction) => {
          if (inventory === null) {
            throw new InventoryNotFoundError(productId);
          }

          return expireStaleReservationsForProduct(transaction, productId, now);
        },
      );
    }

    return expiredCount;
  }

  private resolveTransitionOutcome(
    reservationId: string,
    outcome: TransitionOutcome | null,
  ): Reservation {
    if (outcome === null) {
      throw new ReservationNotFoundError(reservationId);
    }

    if (outcome.kind === 'expired') {
      throw new ReservationExpiredError(reservationId);
    }

    return outcome.reservation;
  }
}
