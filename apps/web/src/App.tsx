import { useState } from 'react';

import {
  type Inventory,
  type InventoryApi,
  inventoryApi,
  type Reservation,
} from './api/inventory-api';
import { InventorySummary } from './components/InventorySummary';
import { ReservationPanel } from './components/ReservationPanel';

type AppProps = Readonly<{
  api?: InventoryApi;
  initialProductId?: string;
  initialUserId?: string;
}>;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

export function App({
  api = inventoryApi,
  initialProductId = import.meta.env.VITE_PRODUCT_ID ?? '',
  initialUserId = '',
}: AppProps) {
  const [productId, setProductId] = useState(initialProductId);
  const [userId, setUserId] = useState(initialUserId);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshInventory = async (id: string): Promise<void> => {
    setInventory(await api.getInventory(id));
  };

  const loadInventory = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setReservation(null);

    try {
      await refreshInventory(productId);
    } catch (caughtError) {
      setInventory(null);
      setError(errorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  };

  const reserve = async (): Promise<void> => {
    if (inventory === null) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const createdReservation = await api.reserve({
        productId: inventory.productId,
        userId,
      });
      setReservation(createdReservation);
      await refreshInventory(inventory.productId);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  };

  const refreshReservation = async (): Promise<void> => {
    if (reservation === null) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const refreshedReservation = await api.getReservation(reservation.id);
      setReservation(refreshedReservation);
      await refreshInventory(refreshedReservation.productId);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  };

  const transitionReservation = async (
    transition: (reservationId: string) => Promise<Reservation>,
  ): Promise<void> => {
    if (reservation === null) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const updatedReservation = await transition(reservation.id);
      setReservation(updatedReservation);
      await refreshInventory(updatedReservation.productId);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">Inventory control room</p>
        <h1>Reserve the last item with confidence.</h1>
        <p className="hero-copy">
          Inspect live stock, create a two-minute hold, then confirm or release it.
          PostgreSQL remains the concurrency authority.
        </p>
      </header>

      <section className="panel lookup-panel" aria-labelledby="lookup-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Step one</p>
            <h2 id="lookup-title">Choose a product</h2>
          </div>
        </div>
        <form
          className="input-row"
          onSubmit={(event) => {
            event.preventDefault();
            void loadInventory();
          }}
        >
          <label>
            Product ID
            <input
              autoComplete="off"
              onChange={(event) => setProductId(event.target.value)}
              placeholder="90ea4659-161c-46ae-9370-4a26db65f21c"
              required
              type="text"
              value={productId}
            />
          </label>
          <button className="button button--primary" disabled={busy} type="submit">
            Load inventory
          </button>
        </form>
      </section>

      {error === null ? null : <div className="error-banner" role="alert">{error}</div>}

      {inventory === null ? (
        <section className="empty-state">
          <p>Enter a product UUID to inspect its current inventory.</p>
        </section>
      ) : (
        <div className="workspace-grid">
          <InventorySummary inventory={inventory} />

          <section className="panel reserve-panel" aria-labelledby="reserve-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Step two</p>
                <h2 id="reserve-title">Reserve one item</h2>
              </div>
            </div>
            <label>
              User ID
              <input
                autoComplete="off"
                onChange={(event) => setUserId(event.target.value)}
                placeholder="4c6210de-507f-44f4-a29e-88275899ab70"
                required
                type="text"
                value={userId}
              />
            </label>
            <button
              className="text-button user-id-button"
              disabled={busy}
              onClick={() => setUserId(globalThis.crypto.randomUUID())}
              type="button"
            >
              Generate a user ID
            </button>
            <button
              className="button button--accent"
              disabled={busy || inventory.availableStock === 0 || userId.length === 0}
              onClick={() => void reserve()}
              type="button"
            >
              Reserve item
            </button>
            {inventory.availableStock === 0 ? (
              <p className="stock-note">No stock is currently available.</p>
            ) : (
              <p className="stock-note">One click creates a two-minute hold.</p>
            )}
          </section>
        </div>
      )}

      {reservation === null ? null : (
        <ReservationPanel
          busy={busy}
          onCancel={() => transitionReservation(api.cancelReservation)}
          onConfirm={() => transitionReservation(api.confirmReservation)}
          onRefresh={refreshReservation}
          reservation={reservation}
        />
      )}
    </main>
  );
}
