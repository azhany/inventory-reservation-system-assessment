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

- [x] **T010** Create `products` migration.
- [x] **T011** Create `inventories` migration with capacity CHECK constraint.
- [x] **T012** Create `reservations` migration with lifecycle status constraint.
- [x] **T013** Add indexes for product/status and active expiry lookup.
- [x] **T014** Add seed helper for a product with configurable stock.

## Phase 2 — Inventory domain

- [x] **T020** Implement inventory read model.
- [x] **T021** Implement `availableStock = total - sold - reserved` calculation.
- [x] **T022** Implement repository method to lock inventory row with `FOR UPDATE`.
- [x] **T023** Add invariant-focused unit tests.

## Phase 3 — Basic reservation

- [x] **T030** Implement reserve transaction.
- [x] **T031** Reject reservation when available stock is zero.
- [x] **T032** Create `ACTIVE` reservation with two-minute expiry.
- [x] **T033** Increment reserved counter in the same transaction.
- [x] **T034** Add basic success/failure integration tests.

## Phase 4 — Concurrency first

- [x] **T040** Add concurrency test issuing 500 parallel reserve requests against stock = 1.
- [x] **T041** Assert exactly 1 success and 499 failures.
- [x] **T042** Assert `reserved_stock = 1`, `sold_stock = 0`, `available_stock = 0`.
- [x] **T043** Verify no transaction path can bypass the inventory lock.

**Checkpoint:** Do not proceed to optional React work until T040–T043 pass reliably.

## Phase 5 — Reservation lifecycle

- [x] **T050** Implement reservation lookup.
- [x] **T051** Implement confirm transaction.
- [x] **T052** Move one unit from reserved to sold on confirmation.
- [x] **T053** Implement cancel transaction.
- [x] **T054** Release reserved stock on cancellation.
- [x] **T055** Reject transitions from terminal states.
- [x] **T056** Add lifecycle integration tests.

## Phase 6 — Expiry

- [x] **T060** Implement stale active reservation detection.
- [x] **T061** Implement lazy expiry inside the product inventory lock.
- [x] **T062** Release reserved stock when expiring a reservation.
- [x] **T063** Add periodic background expiry worker.
- [x] **T064** Make TTL configurable in tests while defaulting to two minutes.
- [x] **T065** Add expiry integration tests.

## Phase 7 — HTTP contract

- [x] **T070** Implement inventory GET endpoint.
- [x] **T071** Implement reserve POST endpoint.
- [x] **T072** Implement reservation GET endpoint.
- [x] **T073** Implement confirm POST endpoint.
- [x] **T074** Implement cancel POST endpoint.
- [x] **T075** Validate request/response behavior against `openapi.yaml`.

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
