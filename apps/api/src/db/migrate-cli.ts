import { fileURLToPath } from 'node:url';

import { loadConfig } from '../config/config.js';
import { createDatabasePool } from './database.js';
import { runMigrations } from './migrations.js';

const migrationsDirectory = fileURLToPath(
  new URL('../../../../migrations/', import.meta.url),
);

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createDatabasePool(config.databaseUrl);

  try {
    const result = await runMigrations(pool, migrationsDirectory);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown migration error';
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = 1;
});
