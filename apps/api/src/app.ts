import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { ApplicationError, toErrorResponse } from './http/errors.js';

type AppDependencies = Readonly<{
  checkDatabase: () => Promise<boolean>;
}>;

export function buildApp(
  dependencies: AppDependencies,
  options: FastifyServerOptions = { logger: false },
): FastifyInstance {
  const app = Fastify(options);

  app.setErrorHandler((error, request, reply) => {
    const response = toErrorResponse(error);

    if (response.statusCode >= 500 && !(error instanceof ApplicationError)) {
      request.log.error({ error }, 'Unexpected request error');
    }

    return reply.status(response.statusCode).send(response.body);
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Route not found.',
    }),
  );

  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async () => {
    if (!(await dependencies.checkDatabase())) {
      throw new ApplicationError({
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database is not ready.',
        statusCode: 503,
      });
    }

    return { status: 'ready' };
  });

  return app;
}
