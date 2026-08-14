import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('returns typed defaults for a valid environment', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://inventory:secret@database:5432/inventory',
    });

    expect(config).toEqual({
      databaseUrl: 'postgresql://inventory:secret@database:5432/inventory',
      host: '0.0.0.0',
      logLevel: 'info',
      nodeEnv: 'development',
      port: 3000,
    });
  });

  it('rejects an environment without a PostgreSQL connection URL', () => {
    expect(() => loadConfig({})).toThrowError('Invalid application configuration');
  });

  it('rejects a connection URL using a non-PostgreSQL protocol', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'https://database.example.com/inventory' }),
    ).toThrowError('Invalid application configuration');
  });
});
