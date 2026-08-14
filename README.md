# Inventory Reservation System

A TypeScript, Fastify, and PostgreSQL service for holding flash-sale inventory without overselling. Each reservation holds one item for two minutes and can become `CONFIRMED`, `CANCELLED`, or `EXPIRED`. A small React client is included as a local demonstration surface; PostgreSQL remains the concurrency authority.

## Architecture

```text
Optional React demo
        |
        | HTTP / JSON
        v
Fastify routes and error mapping
        |
        v
ReservationService (business workflow and transaction intent)
        |
        v
PostgreSQL persistence adapter -----> inventories row lock
        |                                  |
        +----------------------------------+
                           |
                           v
             products / inventories / reservations

Periodic expiry worker ---> ReservationService ---> same lock and transaction path
```

The HTTP layer validates transport input and maps application errors. `ReservationService` owns lifecycle behavior. PostgreSQL adapters own SQL, transaction boundaries, and row locking. The React app calls the published HTTP contract and contains no stock-authority logic.

## Concurrency and row-lock strategy

Every stock-mutating flow coordinates on the product's single `inventories` row:

```sql
SELECT product_id, total_stock, reserved_stock, sold_stock
FROM inventories
WHERE product_id = $1
FOR UPDATE;
```

Reservation creation holds that lock while it expires stale holds, calculates availability, inserts the reservation, updates `reserved_stock`, and commits. Confirmation and cancellation determine the reservation's immutable `product_id`, lock the inventory row first, then lock the reservation row. This consistent lock order reduces deadlock risk. The reservation state and inventory counter changes happen in the same transaction.

A JavaScript mutex alone is insufficient because it only coordinates requests inside one Node.js process. Two workers or containers would own different mutexes and could both observe the last available unit. The PostgreSQL row is shared by every API instance, so its lock serializes the inventory decision at the system of record.

The database also enforces the final capacity invariant:

```text
0 <= sold_stock
0 <= reserved_stock
sold_stock + reserved_stock <= total_stock
available_stock = total_stock - sold_stock - reserved_stock
```

## Reservation expiry

An `ACTIVE` reservation receives `expires_at = created_at + 2 minutes`. Confirm and cancel operations reject a hold once that instant has been reached. Expired inventory is released through both of these paths:

- Lazy expiry runs inside the target inventory lock before every new availability decision. This is the correctness path and works even after downtime or if the worker is delayed.
- The API's background worker scans every 30 seconds and expires stale holds through the same locked transaction path. This keeps read models timely when no new reservation arrives.

The two-minute default is fixed for the running API. Integration tests inject a shorter TTL and a controlled clock; they do not wait for real time.

## Clean-checkout development workflow

Docker Engine with Docker Compose is the supported infrastructure path for the core backend. Node.js and PostgreSQL are not required on the host.

```bash
cp .env.example .env
docker compose up --build --detach --wait
docker compose run --rm migrate
```

The default environment starts only the core API and its persistent development database:

- API: `http://localhost:3000`
- liveness: `http://localhost:3000/health/live`
- readiness: `http://localhost:3000/health/ready`

Migrations are an explicit command so multiple API replicas never race schema changes during startup. To validate this workflow from a clean, disposable environment, run:

```bash
./scripts/validate-development-environment.sh
```

Stop the normal environment with `docker compose down`. Use `docker compose down --volumes` only when the persistent development database should also be removed.

## React demo

The optional demo provides an inventory summary, reservation action, active-hold countdown, confirm/cancel controls, manual status refresh, and terminal-state display. Start it with the API and database through Docker:

```bash
docker compose --profile demo up --build --detach --wait
docker compose run --rm migrate
```

Open `http://localhost:5173`. The demo accepts product and user UUIDs. To create a repeatable one-item development product, run:

```bash
docker compose exec database psql -U inventory -d inventory -c \
  "INSERT INTO products (id, sku, name) VALUES ('90ea4659-161c-46ae-9370-4a26db65f21c', 'DEMO-001', 'Demo item') ON CONFLICT (id) DO NOTHING"

docker compose exec database psql -U inventory -d inventory -c \
  "INSERT INTO inventories (product_id, total_stock) VALUES ('90ea4659-161c-46ae-9370-4a26db65f21c', 1) ON CONFLICT (product_id) DO NOTHING"
```

Then load product `90ea4659-161c-46ae-9370-4a26db65f21c`. The demo is intentionally not bundled into the production API image; the core backend remains independently buildable and deployable. For host-native UI development, use `npm run dev:web`; Vite proxies `/api` to `http://localhost:3000`.

## Tests and local checks

The reproducible test entry point builds a disposable test image, starts an isolated PostgreSQL instance on `tmpfs`, applies migrations, runs every unit/UI/integration/concurrency suite, propagates the test status, and removes the test environment:

```bash
./scripts/test-containers.sh
```

The concurrency suite sends 500 parallel attempts against stock `1` and requires exactly one success and 499 out-of-stock failures. It also verifies the committed counters and capacity constraint.

Host-native commands are available when Node.js 24 and a PostgreSQL test database are already available:

```bash
npm install
npm test                         # API unit tests and React behavior tests
npm run test:unit                # API unit tests only
npm run test:web                 # React and browser API-client tests only
npm run test:integration         # integration and concurrency suites
npm run typecheck
npm run lint
npm run build                    # API and React production bundles
```

Set `TEST_DATABASE_URL` (or `DATABASE_URL`) before `npm run test:integration`. Without it, database-backed suites are reported as skipped. To select one database suite:

```bash
npm run test:integration -- tests/integration
npm run test:integration -- tests/concurrency
```

## Production API image

Build the production target from the same Dockerfile:

```bash
docker build --target production --tag inventory-reservation-api:local .
```

Runtime configuration is injected through the environment:

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection URL |
| `HOST` | no | `0.0.0.0` | Listen address |
| `PORT` | no | `3000` | Listen port and health-check port |
| `LOG_LEVEL` | no | `info` | Fastify/Pino log level |
| `NODE_ENV` | no | `production` in the image | `development`, `test`, or `production` |

Run migrations once as a release step before starting or updating API replicas:

```bash
docker run --rm \
  --env DATABASE_URL=postgresql://user:password@database:5432/inventory \
  inventory-reservation-api:local \
  node apps/api/dist/db/migrate-cli.js
```

Then start the API:

```bash
docker run --rm \
  --name inventory-reservation-api \
  --publish 3000:3000 \
  --env NODE_ENV=production \
  --env DATABASE_URL=postgresql://user:password@database:5432/inventory \
  inventory-reservation-api:local
```

The runtime image contains the compiled API and production dependencies, runs as the non-root `node` user, handles `SIGINT`/`SIGTERM`, and declares a readiness health check against `/health/ready`. Inspect it with:

```bash
docker inspect --format '{{.State.Health.Status}} {{.Config.User}}' inventory-reservation-api
```

The expected result is `healthy node`. The complete disposable production validation—including build, explicit migration, non-root assertion, startup, and readiness—is:

```bash
./scripts/validate-production-image.sh
```

## API surface

All application routes are under `/api/v1`:

| Operation | Method | Path |
|---|---|---|
| Read inventory | `GET` | `/products/{productId}/inventory` |
| Reserve one item | `POST` | `/products/{productId}/reservations` |
| Read reservation | `GET` | `/reservations/{reservationId}` |
| Confirm | `POST` | `/reservations/{reservationId}/confirm` |
| Cancel | `POST` | `/reservations/{reservationId}/cancel` |

See [the OpenAPI contract](specs/001-inventory-reservation/openapi.yaml) and [the product specification](specs/001-inventory-reservation/spec.md) for response schemas and acceptance criteria.
