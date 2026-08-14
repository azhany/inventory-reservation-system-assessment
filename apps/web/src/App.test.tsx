import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import {
  type Inventory,
  type InventoryApi,
  type Reservation,
} from './api/inventory-api';

const productId = '90ea4659-161c-46ae-9370-4a26db65f21c';
const userId = '4c6210de-507f-44f4-a29e-88275899ab70';

const availableInventory: Inventory = {
  availableStock: 1,
  productId,
  reservedStock: 0,
  soldStock: 0,
  totalStock: 1,
};

const activeReservation: Reservation = {
  cancelledAt: null,
  confirmedAt: null,
  createdAt: '2026-08-14T04:00:00.000Z',
  expiresAt: '2026-08-14T04:02:00.000Z',
  id: '0c0a8f51-9ee8-4d4c-a950-4f69c0f6d041',
  productId,
  status: 'ACTIVE',
  userId,
};

function createApi(overrides: Partial<InventoryApi> = {}): InventoryApi {
  return {
    cancelReservation: vi.fn(),
    confirmReservation: vi.fn(),
    getInventory: vi.fn().mockResolvedValue(availableInventory),
    getReservation: vi.fn(),
    reserve: vi.fn().mockResolvedValue(activeReservation),
    ...overrides,
  };
}

async function loadInventory(api: InventoryApi): Promise<void> {
  render(
    <App api={api} initialProductId={productId} initialUserId={userId} />,
  );

  await userEvent.click(screen.getByRole('button', { name: 'Load inventory' }));
  await screen.findByRole('heading', { name: 'Inventory' });
}

describe('inventory demo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads and displays the inventory counters', async () => {
    const api = createApi();

    await loadInventory(api);

    expect(api.getInventory).toHaveBeenCalledWith(productId);
    expect(screen.getByText('Total stock')).toHaveAccessibleDescription('1');
    expect(screen.getByText('Available')).toHaveAccessibleDescription('1');
    expect(screen.getByText('Reserved')).toHaveAccessibleDescription('0');
    expect(screen.getByText('Sold')).toHaveAccessibleDescription('0');
  });

  it('reserves an item and shows the active hold countdown', async () => {
    vi.setSystemTime(new Date('2026-08-14T04:00:00.000Z'));
    const reservedInventory = {
      ...availableInventory,
      availableStock: 0,
      reservedStock: 1,
    };
    const api = createApi({
      getInventory: vi
        .fn()
        .mockResolvedValueOnce(availableInventory)
        .mockResolvedValueOnce(reservedInventory),
    });

    await loadInventory(api);
    await userEvent.click(screen.getByRole('button', { name: 'Reserve item' }));

    expect(api.reserve).toHaveBeenCalledWith({ productId, userId });
    expect(await screen.findByText('ACTIVE')).toBeVisible();
    expect(screen.getByText('02:00')).toBeVisible();
    expect(screen.getByText('Available')).toHaveAccessibleDescription('0');
  });

  it('confirms an active reservation and displays its terminal state', async () => {
    const confirmedReservation: Reservation = {
      ...activeReservation,
      confirmedAt: '2026-08-14T04:01:00.000Z',
      status: 'CONFIRMED',
    };
    const api = createApi({
      confirmReservation: vi.fn().mockResolvedValue(confirmedReservation),
    });

    await loadInventory(api);
    await userEvent.click(screen.getByRole('button', { name: 'Reserve item' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(api.confirmReservation).toHaveBeenCalledWith(activeReservation.id);
    expect(await screen.findByText('CONFIRMED')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  it('cancels an active reservation and displays its terminal state', async () => {
    const cancelledReservation: Reservation = {
      ...activeReservation,
      cancelledAt: '2026-08-14T04:01:00.000Z',
      status: 'CANCELLED',
    };
    const api = createApi({
      cancelReservation: vi.fn().mockResolvedValue(cancelledReservation),
    });

    await loadInventory(api);
    await userEvent.click(screen.getByRole('button', { name: 'Reserve item' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(api.cancelReservation).toHaveBeenCalledWith(activeReservation.id);
    expect(await screen.findByText('CANCELLED')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('refreshes an expired reservation and displays its terminal state', async () => {
    const expiredReservation: Reservation = {
      ...activeReservation,
      status: 'EXPIRED',
    };
    const api = createApi({
      getReservation: vi.fn().mockResolvedValue(expiredReservation),
    });

    await loadInventory(api);
    await userEvent.click(screen.getByRole('button', { name: 'Reserve item' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Refresh reservation' }),
    );

    expect(api.getReservation).toHaveBeenCalledWith(activeReservation.id);
    expect(await screen.findByText('EXPIRED')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  it('shows API failures without discarding the loaded inventory', async () => {
    const api = createApi({
      reserve: vi.fn().mockRejectedValue(new Error('No inventory is available.')),
    });

    await loadInventory(api);
    await userEvent.click(screen.getByRole('button', { name: 'Reserve item' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No inventory is available.',
    );
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  });
});
