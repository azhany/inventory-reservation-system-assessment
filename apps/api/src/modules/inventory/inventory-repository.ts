import { type Pool, type PoolClient } from 'pg';

import {
  createInventoryReadModel,
  type InventoryReadModel,
} from './inventory.js';

interface InventoryRow {
  product_id: string;
  reserved_stock: number;
  sold_stock: number;
  total_stock: number;
}

function toInventoryReadModel(row: InventoryRow): InventoryReadModel {
  return createInventoryReadModel({
    productId: row.product_id,
    reservedStock: row.reserved_stock,
    soldStock: row.sold_stock,
    totalStock: row.total_stock,
  });
}

export async function findInventoryByProductId(
  database: Pool | PoolClient,
  productId: string,
): Promise<InventoryReadModel | null> {
  const result = await database.query<InventoryRow>(`
    SELECT product_id, total_stock, reserved_stock, sold_stock
    FROM inventories
    WHERE product_id = $1
  `, [productId]);
  const row = result.rows[0];

  return row === undefined ? null : toInventoryReadModel(row);
}

export async function lockInventoryByProductId(
  transaction: PoolClient,
  productId: string,
): Promise<InventoryReadModel | null> {
  const result = await transaction.query<InventoryRow>(`
    SELECT product_id, total_stock, reserved_stock, sold_stock
    FROM inventories
    WHERE product_id = $1
    FOR UPDATE
  `, [productId]);
  const row = result.rows[0];

  return row === undefined ? null : toInventoryReadModel(row);
}
