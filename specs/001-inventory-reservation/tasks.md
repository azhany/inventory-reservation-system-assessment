# Tasks — Inventory Reservation System

Tasks are ordered to validate the hardest requirement—concurrency—before optional presentation work.

## Phase 0 — Project setup

- [x] **T001** Initialize TypeScript workspace.
- [x] **T002** Create `apps/api` Node.js service.
- [x] **T003** Add PostgreSQL connection and migration runner.
- [x] **T004** Add test environment with isolated PostgreSQL database.
- [x] **T005** Add shared error and validation conventions.
- [x] **T006** Add a multi-stage Dockerfile with development, test, and non-root production targets.
- [x] **T007** Add Docker Compose development orchestration for the API and health-checked PostgreSQL with a persistent development volume.
- [x] **T008** Add a Docker Compose test workflow with disposable, isolated PostgreSQL infrastructure and propagated test exit codes.
- [x] **T009** Add `.dockerignore`, secret-free environment templates, readiness checks, and an explicit containerized migration command.

## Phase 1 — Relational model

- [ ] **T010** Create `products` migration.
- [ ] **T011** Create `inventories` migration with capacity CHECK constraint.
- [ ] **T012** Create `reservations` migration with lifecycle status constraint.
- [ ] **T013** Add indexes for product/status and active expiry lookup.
- [ ] **T014** Add seed helper for a product with configurable stock.

## Phase 2 — Inventory domain

- [ ] **T020** Implement inventory read model.
- [ ] **T021** Implement `availableStock = total - sold - reserved` calculation.
- [ ] **T022** Implement repository method to lock inventory row with `FOR UPDATE`.
- [ ] **T023** Add invariant-focused unit tests.

## Phase 3 — Basic reservation

- [ ] **T030** Implement reserve transaction.
- [ ] **T031** Reject reservation when available stock is zero.
- [ ] **T032** Create `ACTIVE` reservation with two-minute expiry.
- [ ] **T033** Increment reserved counter in the same transaction.
- [ ] **T034** Add basic success/failure integration tests.

## Phase 4 — Concurrency first

- [ ] **T040** Add concurrency test issuing 500 parallel reserve requests against stock = 1.
- [ ] **T041** Assert exactly 1 success and 499 failures.
- [ ] **T042** Assert `reserved_stock = 1`, `sold_stock = 0`, `available_stock = 0`.
- [ ] **T043** Verify no transaction path can bypass the inventory lock.

**Checkpoint:** Do not proceed to optional React work until T040–T043 pass reliably.

## Phase 5 — Reservation lifecycle

- [ ] **T050** Implement reservation lookup.
- [ ] **T051** Implement confirm transaction.
- [ ] **T052** Move one unit from reserved to sold on confirmation.
- [ ] **T053** Implement cancel transaction.
- [ ] **T054** Release reserved stock on cancellation.
- [ ] **T055** Reject transitions from terminal states.
- [ ] **T056** Add lifecycle integration tests.

## Phase 6 — Expiry

- [ ] **T060** Implement stale active reservation detection.
- [ ] **T061** Implement lazy expiry inside the product inventory lock.
- [ ] **T062** Release reserved stock when expiring a reservation.
- [ ] **T063** Add periodic background expiry worker.
- [ ] **T064** Make TTL configurable in tests while defaulting to two minutes.
- [ ] **T065** Add expiry integration tests.

## Phase 7 — HTTP contract

- [ ] **T070** Implement inventory GET endpoint.
- [ ] **T071** Implement reserve POST endpoint.
- [ ] **T072** Implement reservation GET endpoint.
- [ ] **T073** Implement confirm POST endpoint.
- [ ] **T074** Implement cancel POST endpoint.
- [ ] **T075** Validate request/response behavior against `openapi.yaml`.

## Phase 8 — Documentation and reviewability

- [ ] **T080** Document the row-lock strategy in README.
- [ ] **T081** Explain why an in-process mutex alone is insufficient for multiple Node.js instances.
- [ ] **T082** Document the two-minute expiry behavior.
- [ ] **T083** Document how to run unit, integration, and concurrency tests.
- [ ] **T084** Add a short architecture diagram.
- [ ] **T085** Document the clean-checkout Docker workflow for development and isolated testing.
- [ ] **T086** Document how to build, configure, migrate, health-check, and run the production image.

## Phase 9 — Optional React demo

- [ ] **T090** Initialize React + TypeScript app.
- [ ] **T091** Add inventory summary.
- [ ] **T092** Add reserve action.
- [ ] **T093** Add active reservation countdown.
- [ ] **T094** Add confirm/cancel actions.
- [ ] **T095** Display terminal reservation state.

## Final verification

- [ ] **T100** All unit tests pass.
- [ ] **T101** All integration tests pass.
- [ ] **T102** 500-request concurrency acceptance test passes.
- [ ] **T103** Expiry acceptance test passes.
- [ ] **T104** Database invariants remain valid after every suite.
- [ ] **T105** Core backend can be reviewed and run without the React app.
- [ ] **T106** Clean-checkout development startup succeeds through the documented Docker Compose command.
- [ ] **T107** Containerized unit, integration, and concurrency test workflows pass against isolated PostgreSQL infrastructure.
- [ ] **T108** Production image builds without development dependencies, runs as non-root, and passes its health check.
