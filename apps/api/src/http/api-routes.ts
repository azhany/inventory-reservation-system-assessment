import { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import { type InventoryReadModel } from '../modules/inventory/inventory.js';
import {
  type Reservation,
  ReservationNotFoundError,
} from '../modules/reservation/reservation.js';
import {
  InventoryNotFoundError,
  type ReserveInventoryInput,
} from '../modules/reservation/reservation-service.js';

const productParamsSchema = z.object({
  productId: z.string().uuid(),
});
const reservationParamsSchema = z.object({
  reservationId: z.string().uuid(),
});
const reserveBodySchema = z.object({
  userId: z.string().uuid(),
});

export type ApiRouteDependencies = Readonly<{
  findInventoryByProductId: (
    productId: string,
  ) => Promise<InventoryReadModel | null>;
  reservations: Readonly<{
    cancel: (reservationId: string) => Promise<Reservation>;
    confirm: (reservationId: string) => Promise<Reservation>;
    get: (reservationId: string) => Promise<Reservation | null>;
    reserve: (input: ReserveInventoryInput) => Promise<Reservation>;
  }>;
}>;

export function registerApiRoutes(
  app: FastifyInstance,
  dependencies: ApiRouteDependencies,
): void {
  app.get('/api/v1/products/:productId/inventory', async (request) => {
    const { productId } = productParamsSchema.parse(request.params);
    const inventory = await dependencies.findInventoryByProductId(productId);

    if (inventory === null) {
      throw new InventoryNotFoundError(productId);
    }

    return inventory;
  });

  app.post('/api/v1/products/:productId/reservations', async (request, reply) => {
    const { productId } = productParamsSchema.parse(request.params);
    const { userId } = reserveBodySchema.parse(request.body);
    const reservation = await dependencies.reservations.reserve({
      productId,
      userId,
    });

    return reply.status(201).send(reservation);
  });

  app.get('/api/v1/reservations/:reservationId', async (request) => {
    const { reservationId } = reservationParamsSchema.parse(request.params);
    const reservation = await dependencies.reservations.get(reservationId);

    if (reservation === null) {
      throw new ReservationNotFoundError(reservationId);
    }

    return reservation;
  });

  app.post('/api/v1/reservations/:reservationId/confirm', async (request) => {
    const { reservationId } = reservationParamsSchema.parse(request.params);
    return dependencies.reservations.confirm(reservationId);
  });

  app.post('/api/v1/reservations/:reservationId/cancel', async (request) => {
    const { reservationId } = reservationParamsSchema.parse(request.params);
    return dependencies.reservations.cancel(reservationId);
  });
}
