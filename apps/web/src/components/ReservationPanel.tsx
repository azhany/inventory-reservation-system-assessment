import { useEffect, useState } from 'react';

import { type Reservation } from '../api/inventory-api';

type ReservationPanelProps = Readonly<{
  busy: boolean;
  onCancel: () => Promise<void>;
  onConfirm: () => Promise<void>;
  onRefresh: () => Promise<void>;
  reservation: Reservation;
}>;

function formatCountdown(expiresAt: string, now: number): string {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - now) / 1_000),
  );
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function ActiveReservationActions({
  busy,
  onCancel,
  onConfirm,
}: Pick<ReservationPanelProps, 'busy' | 'onCancel' | 'onConfirm'>) {
  return (
    <div className="reservation-actions">
      <button className="button button--primary" disabled={busy} onClick={onConfirm} type="button">
        Confirm
      </button>
      <button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">
        Cancel
      </button>
    </div>
  );
}

export function ReservationPanel({
  busy,
  onCancel,
  onConfirm,
  onRefresh,
  reservation,
}: ReservationPanelProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (reservation.status !== 'ACTIVE') {
      return undefined;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [reservation.expiresAt, reservation.status]);

  const countdown = formatCountdown(reservation.expiresAt, now);

  return (
    <section className="panel reservation-panel" aria-labelledby="reservation-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Current hold</p>
          <h2 id="reservation-title">Reservation</h2>
        </div>
        <span className={`status-badge status-badge--${reservation.status.toLowerCase()}`}>
          {reservation.status}
        </span>
      </div>

      <dl className="reservation-details">
        <div>
          <dt>Reservation ID</dt>
          <dd>{reservation.id}</dd>
        </div>
        <div>
          <dt>Expires at</dt>
          <dd>{new Date(reservation.expiresAt).toLocaleString()}</dd>
        </div>
      </dl>

      {reservation.status === 'ACTIVE' ? (
        <>
          <div className="countdown" aria-live="polite">
            <span>Time remaining</span>
            <strong>{countdown}</strong>
          </div>
          {countdown === '00:00' ? (
            <p className="hold-ended">The hold time has ended. Refresh to read the server state.</p>
          ) : null}
          <ActiveReservationActions
            busy={busy}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        </>
      ) : (
        <p className="terminal-message">
          This reservation is terminal and cannot be changed again.
        </p>
      )}

      <button className="text-button" disabled={busy} onClick={onRefresh} type="button">
        Refresh reservation
      </button>
    </section>
  );
}
