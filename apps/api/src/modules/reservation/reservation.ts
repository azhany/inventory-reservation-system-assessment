export type ReservationStatus =
  | 'ACTIVE'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

export type Reservation = Readonly<{
  cancelledAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  productId: string;
  status: ReservationStatus;
  userId: string;
}>;

export class InvalidReservationStateError extends Error {
  readonly reservationId: string;
  readonly status: ReservationStatus;

  constructor(reservation: Reservation) {
    super(`Reservation ${reservation.id} cannot transition from ${reservation.status}.`);
    this.name = 'InvalidReservationStateError';
    this.reservationId = reservation.id;
    this.status = reservation.status;
  }
}

export class ReservationExpiredError extends Error {
  readonly reservationId: string;

  constructor(reservationId: string) {
    super('The reservation has expired.');
    this.name = 'ReservationExpiredError';
    this.reservationId = reservationId;
  }
}

export class ReservationNotFoundError extends Error {
  readonly reservationId: string;

  constructor(reservationId: string) {
    super(`Reservation ${reservationId} was not found.`);
    this.name = 'ReservationNotFoundError';
    this.reservationId = reservationId;
  }
}

function assertActive(reservation: Reservation): void {
  if (reservation.status !== 'ACTIVE') {
    throw new InvalidReservationStateError(reservation);
  }
}

export function isReservationExpired(
  reservation: Reservation,
  now: Date,
): boolean {
  return reservation.status === 'ACTIVE'
    && reservation.expiresAt.getTime() <= now.getTime();
}

export function confirmActiveReservation(
  reservation: Reservation,
  confirmedAt: Date,
): Reservation {
  assertActive(reservation);

  if (isReservationExpired(reservation, confirmedAt)) {
    throw new ReservationExpiredError(reservation.id);
  }

  return {
    ...reservation,
    confirmedAt: new Date(confirmedAt),
    status: 'CONFIRMED',
  };
}

export function cancelActiveReservation(
  reservation: Reservation,
  cancelledAt: Date,
): Reservation {
  assertActive(reservation);

  if (isReservationExpired(reservation, cancelledAt)) {
    throw new ReservationExpiredError(reservation.id);
  }

  return {
    ...reservation,
    cancelledAt: new Date(cancelledAt),
    status: 'CANCELLED',
  };
}

export function expireActiveReservation(
  reservation: Reservation,
  expiredAt: Date,
): Reservation {
  assertActive(reservation);

  if (!isReservationExpired(reservation, expiredAt)) {
    throw new RangeError('An active reservation cannot expire before its expiry time.');
  }

  return {
    ...reservation,
    status: 'EXPIRED',
  };
}
