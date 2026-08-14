import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from '../../apps/api/src/db/migrations.js';
import {
  findInventoryByProductId,
  lockInventoryByProductId,
} from '../../apps/api/src/modules/inventory/inventory-repository.js';
import { seedProduct } from '../support/seed-product.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithDatabase = describe.runIf(databaseUrl !== undefined);
const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

describeWithDatabase('inventory repository', () => {
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

  it('reads persisted counters and derives available stock', async () => {
    const product = await seedProduct(pool, { totalStock: 10 });
    await pool.query(`
      UPDATE inventories
      SET reserved_stock = 2, sold_stock = 3
      WHERE product_id = $1
    `, [product.id]);

    const inventory = await findInventoryByProductId(pool, product.id);

    expect(inventory).toEqual({
      availableStock: 5,
      productId: product.id,
      reservedStock: 2,
      soldStock: 3,
      totalStock: 10,
    });
  });

  it('returns null when the product inventory does not exist', async () => {
    const inventory = await findInventoryByProductId(pool, randomUUID());

    expect(inventory).toBeNull();
  });

  it('holds a row lock until the inventory transaction completes', async () => {
    const product = await seedProduct(pool, { totalStock: 2 });
    const lockHolder = await pool.connect();
    const contender = await pool.connect();
    let contenderTransactionOpen = false;
    let lockHolderTransactionOpen = false;

    try {
      await lockHolder.query('BEGIN');
      lockHolderTransactionOpen = true;
      const lockedInventory = await lockInventoryByProductId(
        lockHolder,
        product.id,
      );

      expect(lockedInventory).toEqual({
        availableStock: 2,
        productId: product.id,
        reservedStock: 0,
        soldStock: 0,
        totalStock: 2,
      });

      await contender.query('BEGIN');
      contenderTransactionOpen = true;
      await contender.query("SET LOCAL lock_timeout = '250ms'");
      await expect(contender.query(`
        UPDATE inventories
        SET reserved_stock = reserved_stock + 1
        WHERE product_id = $1
      `, [product.id])).rejects.toMatchObject({ code: '55P03' });
      await contender.query('ROLLBACK');
      contenderTransactionOpen = false;

      await lockHolder.query('COMMIT');
      lockHolderTransactionOpen = false;
      await contender.query(`
        UPDATE inventories
        SET reserved_stock = reserved_stock + 1
        WHERE product_id = $1
      `, [product.id]);

      const updatedInventory = await findInventoryByProductId(pool, product.id);
      expect(updatedInventory?.reservedStock).toBe(1);
    } finally {
      const rollbacks: Promise<unknown>[] = [];
      if (lockHolderTransactionOpen) {
        rollbacks.push(lockHolder.query('ROLLBACK'));
      }
      if (contenderTransactionOpen) {
        rollbacks.push(contender.query('ROLLBACK'));
      }
      await Promise.allSettled(rollbacks);
      lockHolder.release();
      contender.release();
    }
  });
});
