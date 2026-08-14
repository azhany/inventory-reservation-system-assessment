import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('health endpoints', () => {
  it('reports liveness without requiring the database', async () => {
    const app = buildApp({ checkDatabase: async () => false });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('reports readiness when PostgreSQL is reachable', async () => {
    const app = buildApp({ checkDatabase: async () => true });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
  });

  it('returns the shared error contract while PostgreSQL is unavailable', async () => {
    const app = buildApp({ checkDatabase: async () => false });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: 'DATABASE_UNAVAILABLE',
      message: 'The database is not ready.',
    });
  });
});

describe('unknown routes', () => {
  it('uses the shared not-found response contract', async () => {
    const app = buildApp({ checkDatabase: async () => true });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Route not found.',
    });
  });
});
