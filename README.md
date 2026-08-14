# Inventory Reservation System

A TypeScript, Fastify, and PostgreSQL service for holding flash-sale inventory without overselling. Each reservation holds one item for two minutes and can become `CONFIRMED`, `CANCELLED`, or `EXPIRED`. A small React client is included as a local demonstration surface; PostgreSQL remains the concurrency authority.

## Submission Notes

### Approach

I approached the challenge as a concurrency and state-consistency problem rather than only a CRUD exercise.

The implementation was developed progressively around the three levels described in the challenge:

1. establish the inventory and reservation domain rules;
2. implement the reservation lifecycle and expiry behavior;
3. make stock mutations safe under concurrent access and verify that behavior against a real relational database.

The central invariant is:

```text
available_stock = total_stock - sold_stock - reserved_stock
```

and the system must always preserve:

```text
reserved_stock + sold_stock <= total_stock
```

I kept business workflow inside `ReservationService`, database-specific concurrency behavior inside the PostgreSQL persistence adapter, HTTP concerns at the transport boundary, and the React application as an optional demonstration client rather than part of the inventory authority.

### Requirements Traceability

| Challenge requirement                      | Implementation                                                |
| ------------------------------------------ | ------------------------------------------------------------- |
| Reserve an available item                  | `ReservationService.reserve()`                                |
| Reject reservation when unavailable        | `OutOfStockError`                                             |
| Two-minute temporary hold                  | Reservation TTL defaults to 2 minutes                         |
| ACTIVE reservation                         | `ACTIVE` state                                                |
| Confirm purchase                           | `ACTIVE → CONFIRMED`, reserved stock moves to sold stock      |
| Cancel reservation                         | `ACTIVE → CANCELLED`, reserved stock is released              |
| Automatically release expired reservations | Lazy expiry plus periodic expiry worker                       |
| Confirmed purchases cannot be reversed     | Terminal-state validation                                     |
| Prevent overselling                        | PostgreSQL row-level locking and database capacity constraint |
| 500 requests against stock 1               | Concurrency test requires exactly 1 success and 499 failures  |

### Design Decisions

#### PostgreSQL as the concurrency authority

I used PostgreSQL row-level pessimistic locking with `SELECT ... FOR UPDATE` around stock-mutating operations.

A process-local JavaScript mutex would protect only a single Node.js process. PostgreSQL provides a shared concurrency boundary if the API runs with multiple workers or application instances.

The inventory row is therefore treated as the serialization point for reservation decisions.

The database also independently enforces the inventory-capacity invariant so correctness does not depend solely on application logic.

#### Consistent lock ordering

Reservation creation locks the inventory row.

Confirmation and cancellation first identify the reservation's immutable product, then lock:

```text
inventory → reservation
```

Using a consistent locking order reduces the risk of deadlocks between concurrent lifecycle operations.

#### Expiry strategy

Expiry uses two complementary mechanisms:

* **Lazy expiry** before a new availability decision, which provides the correctness path even if no worker has run recently.
* **Periodic cleanup**, which keeps stale reservations and read models reasonably current when no reservation traffic occurs.

Both use the same transactional inventory-locking path.

#### Dependency boundaries

Business logic depends on small abstractions such as the reservation persistence contract and an injectable clock rather than directly depending on PostgreSQL or system time.

This keeps domain behavior independently testable while leaving transaction and locking concerns in the infrastructure layer.

I intentionally avoided introducing a dependency-injection framework because constructor dependency injection is sufficient for the size of this application.

### Assumptions

* A reservation represents one unit of a product.
* Reservation ownership is represented by a supplied user UUID; authentication and authorization are outside the challenge scope.
* A confirmed reservation represents a completed purchase and is terminal.
* Cancelled and expired reservations are also terminal.
* The two-minute reservation period begins when the reservation is created.
* Reaching `expires_at` means the reservation is already expired.
* Product and inventory creation are administrative/setup concerns rather than part of the reservation API.
* The React application is a demonstration surface only; the API and database remain authoritative.

#### Level 1 in-memory requirement

The challenge introduces in-memory inventory as part of Level 1.

I interpreted this as the initial implementation stage rather than a constraint on the completed Level 3 architecture. The final implementation uses PostgreSQL as the system of record because this preserves concurrency correctness across multiple Node.js processes or application instances while still implementing the same inventory rules introduced at Level 1.

### Trade-offs

#### PostgreSQL locking vs. in-process locking

PostgreSQL introduces infrastructure and transaction overhead compared with an in-memory mutex, but it provides correctness across process and instance boundaries.

For a flash-sale-style scenario, I preferred correctness at the system of record over the simpler process-local implementation.

#### Materialized inventory counters

`reserved_stock` and `sold_stock` are maintained on the inventory row instead of calculating all availability from the reservation table for every request.

This makes the availability decision cheap while introducing the responsibility of updating reservation state and inventory counters atomically.

Database constraints and integration tests protect this relationship.

#### Lazy expiry plus worker

A background worker alone would make correctness dependent on scheduling frequency and worker availability.

Lazy expiry ensures an expired reservation cannot continue blocking stock when another customer attempts to reserve it. The worker is therefore primarily for timely cleanup rather than correctness.

#### Scope

I intentionally did not introduce Redis/distributed locks, queues, Kubernetes, event sourcing, authentication, or a separate inventory service. Those could be useful at larger scale, but they would add complexity without being necessary to demonstrate the challenge's core concurrency requirements.

The React application is similarly kept optional so the backend remains independently runnable and testable.

## AI-Assisted Development

AI tools were used deliberately as part of the engineering workflow.

### Tools

* **ChatGPT** — requirements analysis, specification design, architecture discussion, engineering guidelines, and review.
* **OpenAI Codex** — implementation assistance using the resulting specification and repository engineering guidelines.

### Workflow

I first used ChatGPT to analyze the supplied challenge and convert the requirements into a small Spec-Driven Development structure under:

```text
specs/001-inventory-reservation/
```

This produced explicit artifacts covering:

```text
requirements
→ implementation plan
→ relational data model
→ API contract
→ implementation tasks
```

Before implementation, I also created `AGENTS.md` containing the engineering constraints I wanted the coding agent to follow, including:

* SOLID principles
* Red → Green → Refactor TDD workflow
* clean-code rules
* appropriate OOP usage
* design-pattern restraint
* systematic debugging practices
* real-database concurrency testing

Codex was then used to implement the tasks using the specification as the source of truth and `AGENTS.md` as its engineering guidance.

The implementation was therefore substantially AI-assisted rather than limited to autocomplete.

My role throughout the process was to define and challenge the architecture, decide trade-offs, constrain the implementation, review generated changes, reason about the locking strategy and failure cases, and validate the resulting behavior and tests.

I remain responsible for the final submitted code and its engineering decisions.

### AI-Assisted Areas

AI assistance was used across:

* specification and planning documents
* API and relational-model design
* backend implementation
* test implementation
* React demonstration client
* Docker/development tooling
* documentation and code review

The final solution was reviewed against the original challenge requirements rather than treating AI-generated output as correct by default.

## Time Spent

Active working time was approximately **3–4 hours**.

The elapsed time visible between Git commits is longer because I paused development for approximately three hours to attend Friday prayer. That break was not active implementation time.

The challenge itself estimates approximately 2–3 hours; I chose to spend some additional time on reproducible testing, relational concurrency behavior, documentation, and production-oriented packaging.

## Areas I Would Improve With More Time

For a larger production implementation, I would next consider:

* idempotency keys for reservation/confirmation requests;
* authentication and authorization around reservation ownership;
* explicit load and soak testing beyond the required 500-request scenario;
* metrics around lock wait time, reservation success rate, expiry throughput, and database contention;
* structured tracing across reservation transactions;
* retry policy for carefully selected transient PostgreSQL failures;
* database-level lifecycle consistency constraints where practical;
* pagination/administrative APIs for inventory management;
* CI execution of the full Docker-backed integration and concurrency suite;
* stronger API versioning and compatibility guarantees;
* performance evaluation of the single-inventory-row contention model for extremely hot products.

At significantly higher flash-sale scale, I would also benchmark whether the current row-lock architecture remains appropriate before introducing additional distributed infrastructure.

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
