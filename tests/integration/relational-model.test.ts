import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from '../../apps/api/src/db/migrations.js';
import { seedProduct } from '../support/seed-product.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithDatabase = describe.runIf(databaseUrl !== undefined);
const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

describeWithDatabase('Phase 1 relational model', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await runMigrations(pool, migrationsDirectory);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE reservations, inventories, products');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('seeds a product with configurable stock and zeroed counters', async () => {
    const product = await seedProduct(pool, { totalStock: 7 });

    const persisted = await pool.query<{
      id: string;
      name: string;
      reserved_stock: number;
      sku: string;
      sold_stock: number;
      total_stock: number;
    }>(`
      SELECT
        products.id,
        products.sku,
        products.name,
        inventories.total_stock,
        inventories.reserved_stock,
        inventories.sold_stock
      FROM products
      JOIN inventories ON inventories.product_id = products.id
      WHERE products.id = $1
    `, [product.id]);

    expect(persisted.rows).toEqual([{
      id: product.id,
      name: product.name,
      reserved_stock: 0,
      sku: product.sku,
      sold_stock: 0,
      total_stock: 7,
    }]);
  });

  it.each([
    { reservedStock: -1, soldStock: 0, totalStock: 1 },
    { reservedStock: 0, soldStock: -1, totalStock: 1 },
    { reservedStock: 0, soldStock: 0, totalStock: -1 },
    { reservedStock: 1, soldStock: 1, totalStock: 1 },
  ])(
    'rejects inventory counters outside the capacity invariant: %o',
    async ({ reservedStock, soldStock, totalStock }) => {
      const product = await seedProduct(pool, { totalStock: 1 });

      await expect(pool.query(`
        UPDATE inventories
        SET total_stock = $2, reserved_stock = $3, sold_stock = $4
        WHERE product_id = $1
      `, [product.id, totalStock, reservedStock, soldStock])).rejects.toMatchObject({
        code: '23514',
      });
    },
  );

  it('allows only the defined reservation lifecycle statuses', async () => {
    const product = await seedProduct(pool, { totalStock: 4 });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      for (const status of ['ACTIVE', 'CONFIRMED', 'CANCELLED', 'EXPIRED']) {
        await client.query(`
          INSERT INTO reservations (id, product_id, user_id, status, expires_at)
          VALUES ($1, $2, $3, $4, NOW() + INTERVAL '2 minutes')
        `, [randomUUID(), product.id, randomUUID(), status]);
      }
      await client.query(`
        UPDATE inventories
        SET reserved_stock = 1, sold_stock = 1
        WHERE product_id = $1
      `, [product.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await expect(pool.query(`
      INSERT INTO reservations (id, product_id, user_id, status, expires_at)
      VALUES ($1, $2, $3, 'UNKNOWN', NOW() + INTERVAL '2 minutes')
    `, [randomUUID(), product.id, randomUUID()])).rejects.toMatchObject({
      code: '23514',
    });

    const statuses = await pool.query<{ status: string }>(
      'SELECT status FROM reservations ORDER BY status',
    );
    expect(statuses.rows.map(({ status }) => status)).toEqual([
      'ACTIVE',
      'CANCELLED',
      'CONFIRMED',
      'EXPIRED',
    ]);
  });

  it('cascades inventory deletion but restricts deletion of reserved products', async () => {
    const productWithoutReservations = await seedProduct(pool, { totalStock: 1 });
    await pool.query('DELETE FROM products WHERE id = $1', [productWithoutReservations.id]);

    const deletedInventory = await pool.query(
      'SELECT 1 FROM inventories WHERE product_id = $1',
      [productWithoutReservations.id],
    );
    expect(deletedInventory.rowCount).toBe(0);

    const reservedProduct = await seedProduct(pool, { totalStock: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO reservations (id, product_id, user_id, status, expires_at)
        VALUES ($1, $2, $3, 'ACTIVE', NOW() + INTERVAL '2 minutes')
      `, [randomUUID(), reservedProduct.id, randomUUID()]);
      await client.query(`
        UPDATE inventories
        SET reserved_stock = 1
        WHERE product_id = $1
      `, [reservedProduct.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await expect(
      pool.query('DELETE FROM products WHERE id = $1', [reservedProduct.id]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('indexes reservation product status and active expiry lookups', async () => {
    const indexes = await pool.query<{
      definition: string;
      name: string;
      predicate: string | null;
    }>(`
      SELECT
        index_class.relname AS name,
        pg_get_indexdef(indexes.indexrelid) AS definition,
        pg_get_expr(indexes.indpred, indexes.indrelid) AS predicate
      FROM pg_index AS indexes
      JOIN pg_class AS index_class ON index_class.oid = indexes.indexrelid
      WHERE index_class.relname IN (
        'reservations_product_status_idx',
        'reservations_expiry_idx'
      )
      ORDER BY index_class.relname
    `);

    expect(indexes.rows).toHaveLength(2);
    expect(indexes.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        definition: expect.stringContaining('(product_id, status, expires_at)'),
        name: 'reservations_expiry_idx',
        predicate: expect.stringContaining("'ACTIVE'"),
      }),
      expect.objectContaining({
        definition: expect.stringContaining('(product_id, status)'),
        name: 'reservations_product_status_idx',
        predicate: null,
      }),
    ]));
  });
});
