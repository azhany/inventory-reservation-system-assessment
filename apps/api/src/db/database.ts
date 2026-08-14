import { Pool } from 'pg';

export function createDatabasePool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

export async function checkDatabase(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
