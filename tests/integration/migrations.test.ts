import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from '../../apps/api/src/db/migrations.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithDatabase = describe.runIf(databaseUrl !== undefined);

describeWithDatabase('runMigrations', () => {
  const migrationName = '000_phase_zero_probe.sql';
  let migrationsDirectory = '';
  let pool: Pool;

  beforeAll(async () => {
    migrationsDirectory = await mkdtemp(join(tmpdir(), 'inventory-migrations-'));
    pool = new Pool({ connectionString: databaseUrl });
  });

  beforeEach(async () => {
    await writeFile(
      join(migrationsDirectory, migrationName),
      'CREATE TABLE phase_zero_migration_probe (id INTEGER PRIMARY KEY);',
      'utf8',
    );
    await pool.query('DROP TABLE IF EXISTS phase_zero_migration_probe');
    const migrationTable = await pool.query<{ relation: string | null }>(
      "SELECT to_regclass('schema_migrations') AS relation",
    );
    if (migrationTable.rows[0]?.relation !== null) {
      await pool.query('DELETE FROM schema_migrations WHERE name = $1', [migrationName]);
    }
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS phase_zero_migration_probe');
    await pool.query('DELETE FROM schema_migrations WHERE name = $1', [migrationName]);
    await pool.end();
    await rm(migrationsDirectory, { force: true, recursive: true });
  });

  it('applies pending SQL files in a transaction and records them once', async () => {
    const firstRun = await runMigrations(pool, migrationsDirectory);
    const secondRun = await runMigrations(pool, migrationsDirectory);
    const probe = await pool.query<{ relation: string | null }>(
      "SELECT to_regclass('phase_zero_migration_probe') AS relation",
    );

    expect(firstRun).toEqual({ applied: [migrationName] });
    expect(secondRun).toEqual({ applied: [] });
    expect(probe.rows[0]?.relation).toBe('phase_zero_migration_probe');
  });

  it('rejects a migration file that changed after it was applied', async () => {
    await runMigrations(pool, migrationsDirectory);
    await writeFile(
      join(migrationsDirectory, migrationName),
      'CREATE TABLE phase_zero_migration_probe (id BIGINT PRIMARY KEY);',
      'utf8',
    );

    await expect(runMigrations(pool, migrationsDirectory)).rejects.toThrowError(
      `Applied migration ${migrationName} has changed.`,
    );
  });
});
