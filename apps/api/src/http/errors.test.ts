import { describe, expect, it } from 'vitest';

import { ApplicationError, toErrorResponse } from './errors.js';

describe('toErrorResponse', () => {
  it('preserves an application error contract without exposing internal details', () => {
    const error = new ApplicationError({
      code: 'DATABASE_UNAVAILABLE',
      message: 'The database is not ready.',
      statusCode: 503,
    });

    expect(toErrorResponse(error)).toEqual({
      body: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database is not ready.',
      },
      statusCode: 503,
    });
  });

  it('maps unknown errors to a stable internal error response', () => {
    expect(toErrorResponse(new Error('password=do-not-leak'))).toEqual({
      body: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
      statusCode: 500,
    });
  });
});
