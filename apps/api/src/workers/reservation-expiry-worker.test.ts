import { afterEach, describe, expect, it, vi } from 'vitest';

import { startReservationExpiryWorker } from './reservation-expiry-worker.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('reservation expiry worker', () => {
  it('runs expiry periodically without waiting in real time', async () => {
    vi.useFakeTimers();
    const expireStaleReservations = vi.fn(async () => 1);
    const worker = startReservationExpiryWorker({
      expireStaleReservations,
      intervalMilliseconds: 1_000,
      onError: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(3_000);
    await worker.stop();

    expect(expireStaleReservations).toHaveBeenCalledTimes(3);
  });

  it('reports cleanup failures and continues processing later intervals', async () => {
    vi.useFakeTimers();
    const cleanupError = new Error('cleanup failed');
    const expireStaleReservations = vi.fn()
      .mockRejectedValueOnce(cleanupError)
      .mockResolvedValue(0);
    const onError = vi.fn();
    const worker = startReservationExpiryWorker({
      expireStaleReservations,
      intervalMilliseconds: 1_000,
      onError,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    await worker.stop();

    expect(onError).toHaveBeenCalledWith(cleanupError);
    expect(expireStaleReservations).toHaveBeenCalledTimes(2);
  });
});
