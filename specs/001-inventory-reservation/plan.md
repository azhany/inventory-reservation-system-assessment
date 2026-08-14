# Implementation Plan — Inventory Reservation System

## 1. Architecture

```text
React Demo UI (optional)
        |
        | HTTP / JSON
        v
Node.js + TypeScript API
        |
        | domain services + transactions
        v
PostgreSQL
```

### Proposed stack

**Backend**
- TypeScript
- Node.js
- Fastify
- `pg` for explicit PostgreSQL transactions and row locking
- Zod for request/response validation
- Vitest for tests

**Frontend — optional demo**
- React
- Vite
- TypeScript
- TanStack Query

**Database**
- PostgreSQL
- SQL migrations kept in source control

The source challenge does not mandate these libraries. They are selected to keep the concurrency mechanism explicit and easy to explain during review.

---

## 2. Repository Layout

```text
inventory-reservation/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── app.ts
│   │       ├── server.ts
│   │       ├── config/
│   │       ├── db/
│   │       ├── modules/
│   │       │   ├── inventory/
│   │       │   └── reservation/
│   │       └── workers/
│   └── web/                     # optional
│       └── src/
├── packages/
│   └── contracts/               # shared TS schemas/types
├── migrations/
├── specs/
│   └── 001-inventory-reservation/
├── tests/
│   ├── integration/
│   └── concurrency/
├── package.json
└── README.md
```

---

## 3. Domain Boundaries

### Inventory module
Responsibilities:

- read stock counters,
- calculate available stock,
- lock inventory rows,
- enforce inventory invariants.

### Reservation module
Responsibilities:

- create reservation,
- confirm reservation,
- cancel reservation,
- expire reservation,
- validate lifecycle transitions.

### Expiry worker
Responsibilities:

- periodically find stale `ACTIVE` reservations,
- release their stock safely,
- use the same locking rules as API-driven transitions.

Correctness must not depend solely on the worker; reservation creation performs lazy expiry for the target product.

---

## 4. Transaction Boundary

The domain service owns the transaction. Route handlers must not implement stock math directly.

Recommended service surface:

```ts
interface ReservationService {
  reserve(input: {
    productId: string;
    userId: string;
  }): Promise<Reservation>;

  confirm(reservationId: string): Promise<Reservation>;

  cancel(reservationId: string): Promise<Reservation>;

  get(reservationId: string): Promise<Reservation | null>;
}
```

Inventory mutation should stay behind repository functions that require an active transaction client.

---

## 5. Concurrency Design

### Chosen approach

Use PostgreSQL row-level pessimistic locking:

```sql
SELECT ...
FROM inventories
WHERE product_id = $1
FOR UPDATE;
```

### Isolation level

`READ COMMITTED` is sufficient for this design if every stock mutation for a product acquires the same inventory row lock before reading/modifying the counters.

### Why not only a Node.js mutex?

A Node.js mutex is process-local. It would not protect inventory if the API runs multiple processes or containers. The database is the shared source of truth, so the lock should live there.

### Deadlock prevention

Use one consistent lock order:

1. inventory row,
2. reservation row.

Keep transactions short and avoid network calls while locks are held.

---

## 6. Expiry Strategy

Use both:

1. **Lazy expiry:** before reservation availability is checked, expire stale active reservations for the target product while its inventory row is locked.
2. **Background cleanup:** periodically release stale reservations so inventory/read models remain fresh even without incoming reserve traffic.

For testability, reservation TTL should be configurable while production/default behavior remains two minutes.

---

## 7. API Implementation Order

1. `GET /products/:productId/inventory`
2. `POST /products/:productId/reservations`
3. `GET /reservations/:reservationId`
4. `POST /reservations/:reservationId/confirm`
5. `POST /reservations/:reservationId/cancel`

The concurrency acceptance test should be implemented immediately after the reserve endpoint, before adding optional UI work.

---

## 8. Test Strategy

### Unit tests

- available stock calculation,
- valid lifecycle transitions,
- invalid terminal transitions,
- expiry decision logic.

### Integration tests

Use a real PostgreSQL test database for transaction and locking tests.

Required cases:

- reserve when stock is available,
- reject when unavailable,
- confirm updates counters,
- cancel updates counters,
- expiry releases stock,
- confirmed purchase cannot be reversed.

### Concurrency test

Seed:

```text
stock = 1
```

Execute:

```text
500 parallel reservation requests
```

Assert:

```text
successes = 1
failures  = 499
reserved_stock = 1
sold_stock = 0
available_stock = 0
```

Also assert the database capacity CHECK constraint remains valid.

---

## 9. Optional React Demo

Keep the UI intentionally small:

```text
InventoryPage
├── InventorySummary
├── ReserveForm
└── ReservationPanel
    ├── Countdown
    ├── ConfirmButton
    └── CancelButton
```

The browser is a demonstration surface, not the concurrency authority.

---

## 10. Observability

For a coding challenge, structured logs are enough.

Recommended fields:

- `requestId`
- `productId`
- `reservationId`
- `userId`
- `operation`
- `previousStatus`
- `nextStatus`
- `durationMs`

Do not log inside tight retry loops excessively during the 500-request test.

---

## 11. Definition of Done

The core submission is complete when:

- all acceptance criteria in `spec.md` pass,
- the 500-request concurrency test yields 1 success / 499 failures,
- expired reservations release inventory,
- confirmed purchases are terminal,
- database invariants remain valid,
- the README clearly explains the locking strategy,
- tests can be run with one documented command.

The React demo is bonus scope and should not delay the backend definition of done.
