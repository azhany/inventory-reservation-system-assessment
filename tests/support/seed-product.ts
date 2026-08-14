import { randomUUID } from 'node:crypto';

import { type Pool, type PoolClient } from 'pg';

export type SeedProductOptions = Readonly<{
  id?: string;
  name?: string;
  sku?: string;
  totalStock: number;
}>;

export type SeededProduct = Readonly<{
  id: string;
  name: string;
  reservedStock: number;
  sku: string;
  soldStock: number;
  totalStock: number;
}>;

interface SeededProductRow {
  id: string;
  name: string;
  reserved_stock: number;
  sku: string;
  sold_stock: number;
  total_stock: number;
}

export async function seedProduct(
  database: Pool | PoolClient,
  options: SeedProductOptions,
): Promise<SeededProduct> {
  const id = options.id ?? randomUUID();
  const sku = options.sku ?? `seed-${id}`;
  const name = options.name ?? 'Seed product';

  const result = await database.query<SeededProductRow>(`
    WITH inserted_product AS (
      INSERT INTO products (id, sku, name)
      VALUES ($1, $2, $3)
      RETURNING id, sku, name
    ), inserted_inventory AS (
      INSERT INTO inventories (product_id, total_stock)
      SELECT id, $4 FROM inserted_product
      RETURNING product_id, total_stock, reserved_stock, sold_stock
    )
    SELECT
      inserted_product.id,
      inserted_product.sku,
      inserted_product.name,
      inserted_inventory.total_stock,
      inserted_inventory.reserved_stock,
      inserted_inventory.sold_stock
    FROM inserted_product
    JOIN inserted_inventory
      ON inserted_inventory.product_id = inserted_product.id
  `, [id, sku, name, options.totalStock]);

  const seededProduct = result.rows[0];
  if (seededProduct === undefined) {
    throw new Error('Product seed did not return the inserted product.');
  }

  return {
    id: seededProduct.id,
    name: seededProduct.name,
    reservedStock: seededProduct.reserved_stock,
    sku: seededProduct.sku,
    soldStock: seededProduct.sold_stock,
    totalStock: seededProduct.total_stock,
  };
}
