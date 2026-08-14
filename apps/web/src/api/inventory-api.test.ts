import { describe, expect, it, vi } from 'vitest';

import { ApiRequestError, createInventoryApi } from './inventory-api';

const productId = '90ea4659-161c-46ae-9370-4a26db65f21c';
const userId = '4c6210de-507f-44f4-a29e-88275899ab70';

describe('inventory API client', () => {
  it('sends reservation commands using the OpenAPI route and payload', async () => {
    const responseBody = {
      cancelledAt: null,
      confirmedAt: null,
      createdAt: '2026-08-14T04:00:00.000Z',
      expiresAt: '2026-08-14T04:02:00.000Z',
      id: '0c0a8f51-9ee8-4d4c-a950-4f69c0f6d041',
      productId,
      status: 'ACTIVE',
      userId,
    };
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(responseBody), {
          headers: { 'content-type': 'application/json' },
          status: 201,
        }),
      );
    const api = createInventoryApi(fetchImplementation);

    const reservation = await api.reserve({ productId, userId });

    expect(reservation).toEqual(responseBody);
    expect(fetchImplementation).toHaveBeenCalledWith(
      `/api/v1/products/${productId}/reservations`,
      {
        body: JSON.stringify({ userId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
  });

  it('preserves API error codes and safe messages', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'OUT_OF_STOCK',
            message: 'No inventory is currently available for reservation.',
          }),
          { status: 409 },
        ),
      );
    const api = createInventoryApi(fetchImplementation);

    const request = api.reserve({ productId, userId });

    await expect(request).rejects.toEqual(
      new ApiRequestError(
        'OUT_OF_STOCK',
        'No inventory is currently available for reservation.',
      ),
    );
  });

  it('does not expose validation details from an unexpected success response', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ productId }), { status: 200 }),
      );
    const api = createInventoryApi(fetchImplementation);

    const request = api.getInventory(productId);

    await expect(request).rejects.toEqual(
      new ApiRequestError(
        'UNEXPECTED_RESPONSE',
        'The server returned an unexpected response.',
      ),
    );
  });
});
