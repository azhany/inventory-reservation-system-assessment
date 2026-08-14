import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Pool, type PoolClient } from 'pg';

const migrationLockId = 1_654_921_337;

type Migration = Readonly<{
  checksum: string;
  name: string;
  sql: string;
}>;

export type MigrationResult = Readonly<{
  applied: readonly string[];
}>;

async function discoverMigrations(directory: string): Promise<readonly Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(directory, name), 'utf8');
      return {
        checksum: createHash('sha256').update(sql).digest('hex'),
        name,
        sql,
      };
    }),
  );
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applyMigration(client: PoolClient, migration: Migration): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(migration.sql);
    await client.query(
      'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
      [migration.name, migration.checksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Migration ${migration.name} failed and its transaction could not be rolled back.`,
      );
    }

    throw error;
  }
}

export async function runMigrations(
  pool: Pool,
  migrationsDirectory: string,
): Promise<MigrationResult> {
  const migrations = await discoverMigrations(migrationsDirectory);
  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await ensureMigrationTable(client);
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);

    const existing = await client.query<{ checksum: string; name: string }>(
      'SELECT name, checksum FROM schema_migrations',
    );
    const checksumsByName = new Map(
      existing.rows.map((migration) => [migration.name, migration.checksum]),
    );

    for (const migration of migrations) {
      const existingChecksum = checksumsByName.get(migration.name);

      if (existingChecksum === migration.checksum) {
        continue;
      }

      if (existingChecksum !== undefined) {
        throw new Error(`Applied migration ${migration.name} has changed.`);
      }

      await applyMigration(client, migration);
      applied.push(migration.name);
    }

    return { applied };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]);
    } finally {
      client.release();
    }
  }
}
