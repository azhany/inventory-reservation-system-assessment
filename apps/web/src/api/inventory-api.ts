import { z } from 'zod';

const inventorySchema = z.object({
  availableStock: z.number().int().nonnegative(),
  productId: z.string().uuid(),
  reservedStock: z.number().int().nonnegative(),
  soldStock: z.number().int().nonnegative(),
  totalStock: z.number().int().nonnegative(),
});

const reservationSchema = z.object({
  cancelledAt: z.string().nullable().optional(),
  confirmedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  id: z.string().uuid(),
  productId: z.string().uuid(),
  status: z.enum(['ACTIVE', 'CONFIRMED', 'CANCELLED', 'EXPIRED']),
  userId: z.string().uuid(),
});

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type Inventory = Readonly<z.infer<typeof inventorySchema>>;
export type Reservation = Readonly<z.infer<typeof reservationSchema>>;

export type ReserveInput = Readonly<{
  productId: string;
  userId: string;
}>;

export type InventoryApi = Readonly<{
  cancelReservation: (reservationId: string) => Promise<Reservation>;
  confirmReservation: (reservationId: string) => Promise<Reservation>;
  getInventory: (productId: string) => Promise<Inventory>;
  getReservation: (reservationId: string) => Promise<Reservation>;
  reserve: (input: ReserveInput) => Promise<Reservation>;
}>;

export class ApiRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
  }
}

async function parseResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const body: unknown = await response.json();

  if (!response.ok) {
    const parsedError = errorSchema.safeParse(body);

    if (parsedError.success) {
      throw new ApiRequestError(
        parsedError.data.code,
        parsedError.data.message,
      );
    }

    throw new ApiRequestError(
      'UNEXPECTED_RESPONSE',
      'The server returned an unexpected response.',
    );
  }

  const parsedBody = schema.safeParse(body);

  if (!parsedBody.success) {
    throw new ApiRequestError(
      'UNEXPECTED_RESPONSE',
      'The server returned an unexpected response.',
    );
  }

  return parsedBody.data;
}

export function createInventoryApi(
  fetchImplementation: typeof fetch = fetch,
): InventoryApi {
  const get = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
    const response = await fetchImplementation(path);
    return parseResponse(response, schema);
  };

  const post = async <T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> => {
    const init: RequestInit = {
      method: 'POST',
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
          }),
    };
    const response = await fetchImplementation(path, init);
    return parseResponse(response, schema);
  };

  return {
    cancelReservation: (reservationId) =>
      post(
        `/api/v1/reservations/${reservationId}/cancel`,
        reservationSchema,
      ),
    confirmReservation: (reservationId) =>
      post(
        `/api/v1/reservations/${reservationId}/confirm`,
        reservationSchema,
      ),
    getInventory: (productId) =>
      get(`/api/v1/products/${productId}/inventory`, inventorySchema),
    getReservation: (reservationId) =>
      get(`/api/v1/reservations/${reservationId}`, reservationSchema),
    reserve: ({ productId, userId }) =>
      post(
        `/api/v1/products/${productId}/reservations`,
        reservationSchema,
        { userId },
      ),
  };
}

export const inventoryApi = createInventoryApi();
