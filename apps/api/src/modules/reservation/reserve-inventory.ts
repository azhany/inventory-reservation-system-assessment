import {
  type Clock,
  InventoryNotFoundError,
  type LockedInventoryTransaction,
  type LockedInventoryWork,
  OutOfStockError,
  type ReservationPersistence,
  ReservationService,
  type ReserveInventoryInput,
} from './reservation-service.js';
import { type Reservation } from './reservation.js';

type ReserveInventoryDependencies = Readonly<{
  clock: Clock;
  generateReservationId: () => string;
  persistence: ReservationPersistence;
  reservationTtlMilliseconds?: number;
}>;

export function createReserveInventory(
  dependencies: ReserveInventoryDependencies,
): (input: ReserveInventoryInput) => Promise<Reservation> {
  const reservations = new ReservationService(dependencies);
  return async (input) => reservations.reserve(input);
}

export {
  type Clock,
  InventoryNotFoundError,
  type LockedInventoryTransaction,
  type LockedInventoryWork,
  OutOfStockError,
  type ReservationPersistence,
  type ReserveInventoryInput,
};
