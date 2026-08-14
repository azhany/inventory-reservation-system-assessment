export type InventoryCounters = Readonly<{
  reservedStock: number;
  soldStock: number;
  totalStock: number;
}>;

export type InventoryReadModel = Readonly<
  InventoryCounters & {
    availableStock: number;
    productId: string;
  }
>;

export type InventoryReadModelInput = Readonly<
  InventoryCounters & {
    productId: string;
  }
>;

export function calculateAvailableStock(counters: InventoryCounters): number {
  return counters.totalStock - counters.soldStock - counters.reservedStock;
}

function assertInventoryInvariants(counters: InventoryCounters): void {
  if (
    counters.totalStock < 0
    || counters.soldStock < 0
    || counters.reservedStock < 0
    || counters.soldStock + counters.reservedStock > counters.totalStock
  ) {
    throw new RangeError('Inventory counters violate the capacity invariants.');
  }
}

export function createInventoryReadModel(
  input: InventoryReadModelInput,
): InventoryReadModel {
  assertInventoryInvariants(input);

  return {
    availableStock: calculateAvailableStock(input),
    productId: input.productId,
    reservedStock: input.reservedStock,
    soldStock: input.soldStock,
    totalStock: input.totalStock,
  };
}
