import { z } from 'zod';

export type ErrorBody = Readonly<{
  code: string;
  message: string;
}>;

export type ErrorResponse = Readonly<{
  body: ErrorBody;
  statusCode: number;
}>;

type ApplicationErrorOptions = Readonly<{
  code: string;
  message: string;
  statusCode: number;
}>;

export class ApplicationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(options: ApplicationErrorOptions) {
    super(options.message);
    this.name = 'ApplicationError';
    this.code = options.code;
    this.statusCode = options.statusCode;
  }
}

export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof ApplicationError) {
    return {
      body: { code: error.code, message: error.message },
      statusCode: error.statusCode,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      body: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
      },
      statusCode: 400,
    };
  }

  return {
    body: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    },
    statusCode: 500,
  };
}
