import { describe, expect, it } from 'vitest';

import {
  calculateAvailableStock,
  createInventoryReadModel,
} from './inventory.js';

describe('inventory read model', () => {
  it.each([
    {
      counters: { reservedStock: 0, soldStock: 0, totalStock: 5 },
      expectedAvailableStock: 5,
    },
    {
      counters: { reservedStock: 2, soldStock: 3, totalStock: 10 },
      expectedAvailableStock: 5,
    },
    {
      counters: { reservedStock: 2, soldStock: 3, totalStock: 5 },
      expectedAvailableStock: 0,
    },
  ])(
    'derives available stock from the persisted counters: %o',
    ({ counters, expectedAvailableStock }) => {
      expect(calculateAvailableStock(counters)).toBe(expectedAvailableStock);
    },
  );

  it('includes the derived available stock without storing a duplicate source of truth', () => {
    const inventory = createInventoryReadModel({
      productId: '90ea4659-161c-46ae-9370-4a26db65f21c',
      reservedStock: 4,
      soldStock: 3,
      totalStock: 12,
    });

    expect(inventory).toEqual({
      availableStock: 5,
      productId: '90ea4659-161c-46ae-9370-4a26db65f21c',
      reservedStock: 4,
      soldStock: 3,
      totalStock: 12,
    });
  });

  it.each([
    { reservedStock: -1, soldStock: 0, totalStock: 1 },
    { reservedStock: 0, soldStock: -1, totalStock: 1 },
    { reservedStock: 0, soldStock: 0, totalStock: -1 },
    { reservedStock: 1, soldStock: 1, totalStock: 1 },
  ])('rejects counters that violate inventory invariants: %o', (counters) => {
    expect(() => createInventoryReadModel({
      productId: '90ea4659-161c-46ae-9370-4a26db65f21c',
      ...counters,
    })).toThrowError('Inventory counters violate the capacity invariants.');
  });
});
