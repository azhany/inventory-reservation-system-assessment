import { z } from 'zod';

import {
  InvalidReservationStateError,
  ReservationExpiredError,
  ReservationNotFoundError,
} from '../modules/reservation/reservation.js';
import {
  InventoryNotFoundError,
  OutOfStockError,
} from '../modules/reservation/reservation-service.js';

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

  if (
    error instanceof Error
    && 'statusCode' in error
    && error.statusCode === 400
  ) {
    return {
      body: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
      },
      statusCode: 400,
    };
  }

  if (error instanceof InventoryNotFoundError) {
    return {
      body: {
        code: 'INVENTORY_NOT_FOUND',
        message: 'Inventory was not found for this product.',
      },
      statusCode: 404,
    };
  }

  if (error instanceof ReservationNotFoundError) {
    return {
      body: {
        code: 'RESERVATION_NOT_FOUND',
        message: 'Reservation was not found.',
      },
      statusCode: 404,
    };
  }

  if (error instanceof OutOfStockError) {
    return {
      body: {
        code: 'OUT_OF_STOCK',
        message: error.message,
      },
      statusCode: 409,
    };
  }

  if (error instanceof ReservationExpiredError) {
    return {
      body: {
        code: 'RESERVATION_EXPIRED',
        message: error.message,
      },
      statusCode: 409,
    };
  }

  if (error instanceof InvalidReservationStateError) {
    return {
      body: {
        code: 'INVALID_RESERVATION_STATE',
        message: 'The reservation cannot transition from its current state.',
      },
      statusCode: 409,
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
