# Inventory Reservation System — Spec-Driven Development Pack

This pack is a spec-driven development structure using a proposed TypeScript/Node.js/PostgreSQL backend and an optional React demo UI.

The core backend must be containerized from project setup onward. Docker is the supported infrastructure entry point for development, database-backed testing, and production deployment builds.

## Structure

```text
specs/001-inventory-reservation/
├── spec.md           # Product/behavior specification and acceptance criteria
├── plan.md           # Technical architecture and implementation plan
├── data-model.md     # Relational data model and invariants
├── openapi.yaml      # Proposed HTTP API contract
└── tasks.md          # Ordered implementation tasks
```

## Important scope note

The source challenge is backend-focused. React, PostgreSQL, HTTP status semantics, and several implementation details are proposed here to make the requirements executable as a modern spec-driven project. They are not stated by the original challenge unless explicitly marked as source-derived.

Containerization is an explicit repository delivery requirement. It is not presented as a business requirement from the source challenge.

## Phase 0 development environment

Docker Engine with Docker Compose is the supported infrastructure path. Node.js and PostgreSQL do not need to be installed on the host.

Copy the non-secret local defaults, build the images, and start the API and PostgreSQL:

```bash
cp .env.example .env
docker compose up --build --detach
```

Apply migrations as an explicit operation. API replicas do not migrate implicitly during startup:

```bash
docker compose run --rm migrate
```

The development endpoints are:

- API: `http://localhost:3000`
- liveness: `http://localhost:3000/health/live`
- readiness: `http://localhost:3000/health/ready`

Stop the environment with `docker compose down`. Add `--volumes` only when the persistent development database should also be deleted.

## Tests

Run unit, integration, and future concurrency suites in the isolated container environment:

```bash
./scripts/test-containers.sh
```

The script propagates the test container's exit code and removes its disposable PostgreSQL infrastructure. Host-native unit checks remain available as an optional convenience:

```bash
npm install
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run build
```

`npm run test:integration` requires `TEST_DATABASE_URL` or `DATABASE_URL`; without one, database integration tests are reported as skipped.

## Production image

Build the production target:

```bash
docker build --target production --tag inventory-reservation-api:local .
```

The image runs as the non-root `node` user. Inject `DATABASE_URL`, `LOG_LEVEL`, and any platform secrets at runtime. Run migrations once as a release step before starting or updating API replicas:

```bash
docker run --rm \
  --env DATABASE_URL=postgresql://user:password@database:5432/inventory \
  inventory-reservation-api:local \
  node apps/api/dist/db/migrate-cli.js
```

The production command is `node apps/api/dist/server.js`, listens on port `3000` by default, handles `SIGINT`/`SIGTERM`, and exposes a readiness-based container health check.

Validate the production build, explicit migration command, non-root user, startup, and health check against disposable infrastructure with:

```bash
./scripts/validate-production-image.sh
```
