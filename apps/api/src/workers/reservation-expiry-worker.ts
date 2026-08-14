export type ReservationExpiryWorker = Readonly<{
  stop: () => Promise<void>;
}>;

type ReservationExpiryWorkerOptions = Readonly<{
  expireStaleReservations: () => Promise<number>;
  intervalMilliseconds: number;
  onError: (error: unknown) => void;
}>;

export function startReservationExpiryWorker(
  options: ReservationExpiryWorkerOptions,
): ReservationExpiryWorker {
  if (!Number.isInteger(options.intervalMilliseconds) || options.intervalMilliseconds <= 0) {
    throw new RangeError('Expiry worker interval must be a positive whole number.');
  }

  let runningCleanup: Promise<void> | null = null;
  const runCleanup = (): void => {
    if (runningCleanup !== null) {
      return;
    }

    runningCleanup = options.expireStaleReservations()
      .then(() => undefined)
      .catch(options.onError)
      .finally(() => {
        runningCleanup = null;
      });
  };
  const timer = setInterval(runCleanup, options.intervalMilliseconds);

  return {
    stop: async () => {
      clearInterval(timer);
      await runningCleanup;
    },
  };
}
