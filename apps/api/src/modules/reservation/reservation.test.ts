import { describe, expect, it } from 'vitest';

import {
  cancelActiveReservation,
  confirmActiveReservation,
  expireActiveReservation,
  InvalidReservationStateError,
  isReservationExpired,
  ReservationExpiredError,
  type Reservation,
} from './reservation.js';

const activeReservation: Reservation = {
  cancelledAt: null,
  confirmedAt: null,
  createdAt: new Date('2026-08-12T00:00:00.000Z'),
  expiresAt: new Date('2026-08-12T00:02:00.000Z'),
  id: '0c0a8f51-9ee8-4d4c-a950-4f69c0f6d041',
  productId: '90ea4659-161c-46ae-9370-4a26db65f21c',
  status: 'ACTIVE',
  userId: '4c6210de-507f-44f4-a29e-88275899ab70',
};

describe('reservation lifecycle', () => {
  it('confirms an active reservation before its expiry', () => {
    const confirmedAt = new Date('2026-08-12T00:01:59.999Z');

    expect(confirmActiveReservation(activeReservation, confirmedAt)).toEqual({
      ...activeReservation,
      confirmedAt,
      status: 'CONFIRMED',
    });
  });

  it('cancels an active reservation before its expiry', () => {
    const cancelledAt = new Date('2026-08-12T00:01:00.000Z');

    expect(cancelActiveReservation(activeReservation, cancelledAt)).toEqual({
      ...activeReservation,
      cancelledAt,
      status: 'CANCELLED',
    });
  });

  it('treats the reservation as expired when its expiry instant is reached', () => {
    const expiresAt = new Date(activeReservation.expiresAt);

    expect(isReservationExpired(activeReservation, expiresAt)).toBe(true);
    expect(() => confirmActiveReservation(activeReservation, expiresAt))
      .toThrowError(ReservationExpiredError);
    expect(() => cancelActiveReservation(activeReservation, expiresAt))
      .toThrowError(ReservationExpiredError);
    expect(expireActiveReservation(activeReservation, expiresAt)).toEqual({
      ...activeReservation,
      status: 'EXPIRED',
    });
  });

  it.each(['CONFIRMED', 'CANCELLED', 'EXPIRED'] as const)(
    'rejects transitions from the %s terminal state',
    (status) => {
      const terminalReservation = { ...activeReservation, status };
      const now = new Date('2026-08-12T00:01:00.000Z');

      expect(() => confirmActiveReservation(terminalReservation, now))
        .toThrowError(InvalidReservationStateError);
      expect(() => cancelActiveReservation(terminalReservation, now))
        .toThrowError(InvalidReservationStateError);
      expect(() => expireActiveReservation(terminalReservation, now))
        .toThrowError(InvalidReservationStateError);
    },
  );
});
