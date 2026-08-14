# AGENTS.md

## Purpose

This file defines engineering rules for AI coding agents and human contributors working on this TypeScript / Node.js / React codebase.

The goal is not to maximize abstraction. The goal is to produce software that is correct, testable, easy to change, and understandable by the next engineer.

When these guidelines conflict with an explicit product specification, acceptance criterion, API contract, database invariant, or repository-level convention, follow the more specific project requirement and update this document if the convention has changed intentionally.

---

## 1. Core Engineering Priorities

Use this priority order when making implementation decisions:

1. **Correctness and business invariants**
2. **Tests that prove observable behavior**
3. **Simple and explicit design**
4. **Maintainability and readability**
5. **Performance based on evidence**
6. **Abstraction only when it removes real duplication or isolates real variation**

Do not trade correctness for cleverness.

Do not introduce a pattern merely because a pattern exists for the problem category.

Prefer the smallest design that satisfies the current specification while leaving clear extension points at genuine architectural boundaries.

---

# 2. SOLID Principles in TypeScript

SOLID applies to modules, functions, services, interfaces, classes, and architectural boundaries—not only class inheritance.

## 2.1 Single Responsibility Principle — SRP

> Keep together code that changes for the same reason; separate code that changes for different reasons.

### Required

- Keep HTTP concerns, business rules, persistence, and presentation concerns separate.
- Route handlers/controllers should translate transport input/output and delegate business work.
- Domain/application services should contain business behavior, not HTTP or SQL formatting logic.
- Repository implementations should handle persistence details, not business workflows.
- React components should primarily describe UI and interactions; move reusable non-visual behavior into hooks or domain/application modules.
- Split modules when they have multiple independent reasons to change.

### Avoid

```ts
class ReservationManager {
  validateRequest() {}
  calculateInventory() {}
  executeSql() {}
  sendHttpResponse() {}
  formatReactViewModel() {}
}
```

Prefer separate responsibilities with explicit boundaries.

---

## 2.2 Open/Closed Principle — OCP

Design stable business behavior so that known variation can be extended without repeatedly editing unrelated stable code.

### Required

- Introduce an interface, strategy, adapter, or discriminated union when there are **multiple real implementations or states**.
- Prefer composition over large conditional trees when behavior genuinely varies by policy or implementation.
- Keep domain rules independent from database drivers, web frameworks, and UI libraries.

### Do not over-apply

Do not create an interface for every function or class “just in case.”

This is usually unnecessary:

```ts
interface IReservationIdFormatter {
  format(id: string): string;
}

class ReservationIdFormatter implements IReservationIdFormatter {
  format(id: string): string {
    return id;
  }
}
```

If there is no meaningful variation, use a function.

---

## 2.3 Liskov Substitution Principle — LSP

Implementations of the same abstraction must preserve the same behavioral contract.

### Required

For every implementation of an interface:

- Respect the same input assumptions.
- Preserve documented return semantics.
- Preserve business invariants.
- Do not silently weaken validation.
- Do not introduce surprising side effects.
- Use compatible error semantics.

Example:

```ts
interface InventoryRepository {
  findByProductId(productId: string): Promise<Inventory | null>;
}
```

A PostgreSQL implementation and an in-memory test implementation must agree on what “not found” means. One must not return `null` while another throws for the same contract unless the interface explicitly says so.

---

## 2.4 Interface Segregation Principle — ISP

Prefer small interfaces based on what a consumer actually needs.

### Prefer

```ts
interface ReservationReader {
  findById(id: string): Promise<Reservation | null>;
}

interface ReservationWriter {
  save(reservation: Reservation): Promise<void>;
}
```

over a broad catch-all interface containing unrelated operations.

### Rules

- Define interfaces close to the consuming boundary when practical.
- Avoid “god repositories” and “god services.”
- Do not force a consumer to depend on methods it never uses.
- Prefer capability-focused names such as `ReservationReader`, `Clock`, or `InventoryLocker`.

---

## 2.5 Dependency Inversion Principle — DIP

High-level business logic must not depend directly on low-level infrastructure details.

### Required

Business/application code may depend on abstractions such as:

```ts
interface Clock {
  now(): Date;
}

interface ReservationRepository {
  save(reservation: Reservation): Promise<void>;
}
```

Infrastructure provides the implementation:

```ts
class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
```

### Dependency injection

Prefer simple constructor or function-parameter injection.

```ts
class ReserveInventory {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly clock: Clock,
  ) {}
}
```

Do not introduce a dependency-injection framework unless the application complexity actually requires one.

---

# 3. Test-Driven Development (TDD)

Use **Red → Green → Refactor** for business behavior and bug fixes.

## 3.1 Required TDD Loop

### RED

Write the smallest test that describes the next observable behavior.

The test must fail for the expected reason before production code is added.

### GREEN

Write the minimum production code necessary to satisfy the test without breaking existing tests.

Do not optimize prematurely during this phase.

### REFACTOR

Improve names, structure, duplication, boundaries, and abstractions while keeping all tests green.

Refactoring is part of the development loop, not a cleanup phase postponed until the end.

---

## 3.2 What to Test

### Domain/unit tests

Test:

- business rules
- state transitions
- validation
- calculations
- boundary conditions
- error cases
- deterministic pure functions

These tests should be fast and isolated from network and database infrastructure.

### Repository/database integration tests

Test behavior that depends on the relational database itself:

- transactions
- constraints
- unique keys
- foreign keys
- locking behavior
- concurrent updates
- rollback behavior

Do not mock the database when the property under test is a database property.

### HTTP/API tests

Test:

- request validation
- status codes
- response contracts
- error mapping
- integration between transport and application layers

Do not duplicate every domain test through the HTTP layer.

### React tests

Test the UI from the user's observable perspective:

- visible content
- form interaction
- buttons and controls
- accessible roles and labels
- loading states
- success states
- validation and error states

Avoid tests coupled to internal component state, private functions, or DOM structure that users do not observe.

---

## 3.3 Test Structure

Prefer **Arrange / Act / Assert** or **Given / When / Then**.

Example:

```ts
it('rejects a reservation when no stock is available', async () => {
  // Arrange
  const inventory = createInventory({ total: 1, reserved: 1 });

  // Act
  const result = reserve(inventory, 1);

  // Assert
  expect(result).toEqual({ ok: false, reason: 'OUT_OF_STOCK' });
});
```

Test names should describe behavior, not implementation.

Prefer:

```text
rejects a reservation when stock is unavailable
```

Avoid:

```text
test reserve method
```

---

## 3.4 Mocking Rules

Mock only boundaries that are expensive, nondeterministic, external, or irrelevant to the behavior under test.

Good mock candidates:

- clocks
- external HTTP services
- message brokers
- email services
- random/UUID providers when determinism matters

Avoid mocking:

- the function/class being tested
- simple value objects
- pure functions
- database behavior in tests that claim to verify transaction or locking correctness

Prefer fakes or small in-memory implementations over deeply configured mocks when they better express the contract.

Reset or restore mocks between tests.

---

## 3.5 Time-Based Behavior

Time must be controllable in tests.

Do not make tests wait for real minutes or seconds to verify expiration.

Prefer an injected `Clock` for domain code and fake timers/system time at framework boundaries.

```ts
interface Clock {
  now(): Date;
}
```

---

## 3.6 Concurrency Tests

Concurrency behavior must be proven using concurrent execution, not inferred from unit tests.

For inventory/reservation behavior:

- run multiple reservation attempts against the same inventory record
- verify the invariant after all requests settle
- verify the number of successes and failures
- verify stock never becomes negative
- use the real relational database for lock/transaction tests

A passing single-threaded test is not evidence that a race condition has been solved.

---

## 3.7 Recommended Test Tooling

Follow the repository's existing test runner first.

For a new TypeScript + React codebase, **Vitest** is a good unified option because it supports TypeScript/JSX, Node environments, DOM environments, mocking, concurrency, and coverage.

For Node-only modules, the built-in `node:test` runner is also acceptable.

For React behavior tests, use **React Testing Library** principles regardless of the underlying runner.

Do not change test frameworks without a concrete repository-level benefit.

---

# 4. Debugging Guidelines

When fixing a defect, do not immediately rewrite or refactor large portions of the codebase.
Debug systematically and identify the root cause before applying a fix.

## 4.1 Reproduce Before Fixing

- Reproduce the reported problem consistently before modifying production code.
- Prefer creating the smallest possible failing test case.
- When practical, convert the reproduction into an automated regression test.
- Record:
  - expected behavior
  - actual behavior
  - input or state that triggers the issue
  - relevant error messages or stack traces
- Do not claim a bug is fixed unless the original failure can no longer be reproduced.

Preferred workflow:

```text
Reproduce
  ↓
Write failing test
  ↓
Identify root cause
  ↓
Implement minimal fix
  ↓
Verify test passes
  ↓
Run related regression tests
  ↓
Refactor only if necessary
```

---

## 4.2 Isolate the Failure

Use divide-and-conquer debugging when the source of the problem is unclear.

- Narrow the failing execution path systematically.
- Disable, stub, or bypass sections of code when safe to identify the responsible boundary.
- Reduce the search space instead of reading or modifying unrelated files.
- Compare known-working and failing paths.
- Inspect boundaries such as:
  - HTTP request → controller
  - controller → service/use case
  - service/use case → repository
  - repository → database
  - component → hook
  - hook → API client
  - state → rendered UI

For large regression ranges, use binary-search-style debugging where appropriate.
Do not treat divide-and-conquer and binary search as separate mandatory rituals; use the same principle of systematically halving the search space when it is useful.

---

## 4.3 Use Logs Deliberately

Temporary logging may be used to inspect:

- control flow
- function inputs and outputs
- relevant state transitions
- identifiers
- timing
- database transaction boundaries
- concurrency behavior

Rules:

- Prefer structured logging over arbitrary `console.log` statements in application code.
- Do not log passwords, tokens, secrets, personal data, or sensitive payloads.
- Remove temporary debugging logs before completing the task unless they provide legitimate operational value.
- Do not add excessive logging as a substitute for understanding the problem.

---

## 4.4 Use Breakpoints and Runtime Inspection

When static inspection is insufficient:

- use debugger breakpoints
- inspect call stacks
- inspect local variables
- use conditional breakpoints when appropriate
- use watch expressions for state changes
- inspect thrown exceptions at their origin

For Node.js, prefer runtime debugging over adding large amounts of temporary logging when stepping through the execution path is more effective.

---

## 4.5 Trace State Backward From the Symptom

When an invalid state is observed, work backward through the system.

Ask:

1. Where was the invalid state first observable?
2. Which operation produced it?
3. What input or previous state allowed that operation?
4. Which invariant should have prevented it?
5. Where should that invariant be enforced?

Do not merely patch the final symptom if the invalid state originates earlier in the workflow.

---

## 4.6 Explain the Code Before Changing It

Use rubber-duck debugging when the logic is unclear.

Before changing suspicious code, explain:

- what the code is supposed to do
- what each important branch does
- what assumptions it makes
- what state enters the function
- what state should leave the function
- where the actual behavior diverges from the expected behavior

If the behavior cannot be explained clearly, investigate further before modifying it.

---

## 4.7 Debug From Evidence, Not Guesswork

Do not make speculative fixes.

Every proposed fix should be supported by at least one of:

- a reproducible failing test
- stack trace
- debugger observation
- logged state transition
- database state
- network request/response
- documented framework behavior
- deterministic concurrency test

Avoid repeatedly changing code until tests happen to pass.

---

## 4.8 Fix the Root Cause With the Smallest Safe Change

Once the root cause is identified:

- make the smallest change that restores the violated behavior or invariant
- avoid unrelated refactoring during the bug fix
- do not introduce new abstractions unless the defect reveals a genuine design problem
- preserve existing public contracts unless the specification requires a change

After the fix:

- run the failing test
- run related tests
- run the full test suite when practical
- run linting and type checking
- verify no new warnings or errors were introduced

---

## 4.9 Always Add Regression Coverage

Whenever reasonably possible, a bug fix must include a regression test.

The regression test should:

1. fail before the fix
2. pass after the fix
3. describe the behavior being protected
4. test observable behavior rather than implementation details

A bug without regression coverage is at higher risk of returning.

---

## 4.10 Debugging Concurrency Issues

Concurrency defects require special care.

Do not rely on a single manual request to verify concurrency correctness.

For race conditions:

- reproduce using concurrent or parallel operations
- increase iteration counts when necessary to expose nondeterministic failures
- inspect transaction and lock boundaries
- verify shared mutable state
- verify database constraints and isolation behavior
- test invariants rather than execution order
- use the real relational database when the behavior depends on database locking or transaction semantics

For the inventory reservation system, always preserve:

```text
reserved_stock + sold_stock <= total_stock
```

and:

```text
available_stock =
    total_stock
    - sold_stock
    - reserved_stock
```

A concurrency fix is incomplete if these invariants can still be violated.

Never make a race-condition test pass by serializing the test, adding arbitrary delays, or weakening concurrency.

---

## 4.11 Debugging Priority

Prefer this order:

```text
Reproduction
    ↓
Failing test
    ↓
Error / stack trace inspection
    ↓
Execution-path isolation
    ↓
State inspection
    ↓
Root-cause identification
    ↓
Minimal fix
    ↓
Regression verification
    ↓
Refactoring
```

Do not start with refactoring.

### Debugging Anti-Patterns

Do not:

- randomly modify code hoping the problem disappears
- rewrite a module before identifying the failure
- suppress exceptions without understanding them
- weaken tests to make them pass
- delete failing tests unless the specification changed
- add arbitrary delays to hide race conditions
- serialize a concurrency test merely to make it green
- use `any` to bypass TypeScript errors caused by the defect
- disable lint or type checks as a workaround
- swallow rejected promises
- catch errors without handling or rethrowing them appropriately
- assume a database transaction is safe without checking its boundaries
- fix symptoms while leaving the violated invariant unresolved

---

# 5. Clean, Readable, and Maintainable Code

## 5.1 TypeScript Compiler Discipline

Use strict TypeScript settings.

At minimum:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

Strongly consider these for new codebases:

```json
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

Do not weaken compiler settings simply to make an implementation compile.

---

## 5.2 Type Safety

### Prefer

- explicit domain types
- discriminated unions for finite states
- `unknown` at untrusted boundaries
- type narrowing
- `readonly` where mutation is not intended
- exhaustive `switch` handling for domain state machines

Example:

```ts
type ReservationStatus =
  | 'ACTIVE'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';
```

Or use a discriminated union when each state owns different data:

```ts
type Reservation =
  | { status: 'ACTIVE'; expiresAt: Date }
  | { status: 'CONFIRMED'; confirmedAt: Date }
  | { status: 'CANCELLED'; cancelledAt: Date }
  | { status: 'EXPIRED'; expiredAt: Date };
```

### Avoid

- `any` unless interfacing with an unavoidable untyped boundary
- unsafe type assertions used to silence the compiler
- non-null assertions (`!`) without a proven invariant
- broad `Record<string, any>` types

Validate external input at runtime. TypeScript types do not validate HTTP requests, environment variables, or database data at runtime.

---

## 5.3 Naming

Names must communicate domain intent.

Prefer:

```ts
availableStock
reservationExpiresAt
confirmReservation
InventoryRepository
```

Avoid vague names:

```ts
data
obj
handler2
processThing
utils
manager
helper
```

Generic names such as `Manager`, `Helper`, or `Util` require justification because they often hide mixed responsibilities.

---

## 5.4 Functions

A function should have one clear purpose.

Prefer:

- small parameter lists
- explicit inputs and outputs
- early returns for invalid paths
- pure functions for calculations and transformations
- domain-specific names

Avoid boolean-flag APIs that radically alter behavior:

```ts
saveReservation(reservation, true, false, true);
```

Prefer explicit commands/options or separate operations.

---

## 5.5 Modules

- Keep public exports intentional.
- Avoid circular dependencies.
- Keep framework-specific code near framework boundaries.
- Keep domain logic importable without booting the HTTP server or React application.
- Use one module system consistently; do not casually mix ESM and CommonJS.

---

## 5.6 Comments

Comments should explain **why**, constraints, trade-offs, or non-obvious invariants.

Do not narrate obvious code.

Bad:

```ts
// Increment reserved stock
reservedStock += quantity;
```

Useful:

```ts
// Must execute while holding the inventory row lock; otherwise two
// transactions can both observe the same available stock.
reservedStock += quantity;
```

---

## 5.7 Error Handling

Use errors that preserve domain meaning.

Examples:

```ts
class OutOfStockError extends Error {}
class ReservationExpiredError extends Error {}
class ReservationNotFoundError extends Error {}
```

Or return typed result objects when failure is part of normal control flow:

```ts
type ReserveResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; reason: 'OUT_OF_STOCK' | 'INVALID_QUANTITY' };
```

Do not expose raw database errors directly through HTTP responses.

Do not catch an error merely to ignore it.

---

## 5.8 Async Code

- Await promises whose result affects correctness.
- Handle intentionally detached promises explicitly.
- Avoid mixing callbacks and promises in the same abstraction without reason.
- Keep transaction boundaries obvious.
- Never depend on asynchronous timing for correctness when a transaction/constraint should enforce the invariant.

---

# 6. Appropriate Object-Oriented Programming

TypeScript supports classes, interfaces, functions, closures, algebraic-style unions, and composition. Use the construct that makes the behavior easiest to understand.

## 6.1 Use a Class When

A class is appropriate when there is meaningful:

- identity
- encapsulated mutable state
- invariant enforcement
- lifecycle
- dependency injection across multiple operations

Example:

```ts
class ReservationService {
  constructor(
    private readonly inventory: InventoryRepository,
    private readonly reservations: ReservationRepository,
    private readonly clock: Clock,
  ) {}

  async reserve(command: ReserveCommand): Promise<Reservation> {
    // application behavior
  }
}
```

---

## 6.2 Prefer Functions When

Use functions for:

- deterministic calculations
- mapping and formatting
- validation
- transformations
- predicates
- small stateless policies

Example:

```ts
function calculateAvailableStock(
  total: number,
  sold: number,
  reserved: number,
): number {
  return total - sold - reserved;
}
```

Do not create a class only to hold one stateless method.

---

## 6.3 Composition Over Inheritance

Prefer composition and interfaces over deep inheritance hierarchies.

Avoid architecture such as:

```text
BaseService
  -> CrudService
    -> InventoryService
      -> FlashSaleInventoryService
```

Prefer small collaborators with explicit contracts.

Inheritance is acceptable when there is a genuine substitutable “is-a” relationship and inherited behavior makes the contract clearer rather than more fragile.

---

## 6.4 Encapsulation

- Keep invariants close to the behavior that changes them.
- Use `private` / `protected` intentionally.
- Prefer `readonly` dependencies.
- Do not expose mutable internal collections directly.
- Do not use getters/setters merely to make procedural data look object-oriented.

---

## 6.5 React Is Not a Class-First Layer

Use function components and Hooks for React code unless the existing codebase has a specific reason to use class components.

Do not force backend OOP patterns into React components.

A React component should remain a declarative UI function, with reusable behavior extracted into custom Hooks or non-React modules.

---

# 7. Meaningful Design Patterns

Patterns are tools, not goals.

Before introducing a pattern, answer:

1. What concrete problem does this solve?
2. What variation or boundary does it isolate?
3. Is the resulting code simpler to understand and test?
4. Could a function or small interface solve the same problem more clearly?

If those questions do not have strong answers, do not add the pattern.

---

## 7.1 Repository Pattern

Use when application/domain code must be independent of persistence technology.

```ts
interface ReservationRepository {
  findById(id: string): Promise<Reservation | null>;
  save(reservation: Reservation): Promise<void>;
}
```

Database-specific SQL/ORM details belong in the infrastructure implementation.

Do not create repositories that are thin one-to-one wrappers around every ORM method without creating a meaningful boundary.

---

## 7.2 Application Service / Use Case

Use a use-case/service object or function to orchestrate a business operation spanning multiple collaborators.

Examples:

- `ReserveInventory`
- `ConfirmReservation`
- `CancelReservation`
- `ExpireReservations`

The use case owns workflow and transaction intent; HTTP handlers do not.

---

## 7.3 Strategy Pattern

Use when the system has multiple interchangeable policies with the same contract.

Examples:

- reservation eligibility policy
- pricing policy
- retry policy

Do not create a strategy abstraction before a second meaningful strategy exists unless the specification explicitly identifies the variation point.

---

## 7.4 State Machine / Discriminated Union

Use for finite domain lifecycles such as reservation status.

Make valid transitions explicit.

Example:

```text
ACTIVE -> CONFIRMED
ACTIVE -> CANCELLED
ACTIVE -> EXPIRED
```

Invalid transitions should fail explicitly and be covered by tests.

Prefer discriminated unions when they make impossible states unrepresentable.

---

## 7.5 Adapter Pattern

Use adapters at boundaries where external APIs/libraries should not leak into business logic.

Examples:

- database client adapter
- payment provider adapter
- email provider adapter
- clock/UUID provider

Application code should not require knowledge of vendor-specific response structures when an adapter can provide a stable contract.

---

## 7.6 Factory Pattern

Use a factory when construction itself has meaningful rules or multiple dependencies.

Do not use a factory for trivial object literals.

---

## 7.7 Dependency Injection

Use constructor or parameter injection as the default pattern for replacing external dependencies in tests and keeping high-level modules independent.

Prefer explicit dependencies:

```ts
new ReservationService(repository, clock)
```

over hidden global/service-locator access.

---

## 7.8 React Custom Hook

Use a custom Hook when React-specific stateful behavior is reused or when extracting it makes a component express intent more clearly.

```ts
function useReservation(id: string) {
  // React-specific orchestration
}
```

A custom Hook is not required merely because a component contains a few lines of logic.

---

## 7.9 Reducer + Context

Use `useReducer` when state transitions become complex enough that scattered `setState` calls obscure the state machine.

Use Context when state must be available deeply in the component tree and prop passing becomes a real problem.

Do not use Context as a default replacement for ordinary props.

---

## 7.10 Patterns to Treat With Caution

Do not introduce these without strong justification:

- global mutable Singleton
- Service Locator
- deep inheritance trees
- generic `BaseRepository<T>` abstractions that hide domain semantics
- event bus for simple synchronous workflows
- CQRS for ordinary CRUD/use-case separation
- event sourcing without an explicit audit/history requirement
- factories/builders for trivial object creation
- speculative plugin architectures

---

# 8. React-Specific Engineering Rules

## 8.1 Components and Hooks Must Be Pure

During render:

- do not mutate props
- do not mutate state
- do not mutate module/global values
- do not perform external side effects
- do not rely on render order

Given the same props, state, and context, rendering should produce the same result.

---

## 8.2 State Design

- Store the minimal source of truth.
- Avoid redundant or duplicated state.
- Derive values during render when they can be calculated from existing state/props.
- Lift shared state to the closest common owner.
- Normalize state when duplication creates synchronization bugs.

Bad:

```ts
const [items, setItems] = useState<Item[]>([]);
const [itemCount, setItemCount] = useState(0);
```

when `itemCount` is always `items.length`.

---

## 8.3 Effects

Treat `useEffect` as synchronization with an external system, not as a default mechanism for deriving state.

Use effects for things such as:

- network/subscription synchronization
- browser APIs
- non-React widgets
- timers that truly synchronize with an external timeline

Do not use an Effect when the value can be calculated during render or handled directly by an event handler.

---

## 8.4 Hooks

- Call Hooks only at the top level of React function components or custom Hooks.
- Do not call Hooks conditionally.
- Name custom Hooks with the `use` prefix.
- Extract a custom Hook when it provides a meaningful reusable behavior or abstraction.

---

## 8.5 React Testing

Prefer queries resembling user interaction:

1. role
2. accessible name / label
3. visible text where appropriate
4. semantic queries
5. `data-testid` only when a better user-facing selector is unavailable

Do not assert implementation details such as internal hook state.

---

# 9. Node.js Backend Rules

## 9.1 Layer Boundaries

Prefer this dependency direction:

```text
HTTP / Framework
      ↓
Application / Use Cases
      ↓
Domain
      ↑
Infrastructure implements domain/application ports
```

Framework and database details must not become prerequisites for unit-testing domain behavior.

---

## 9.2 Request Boundaries

At external boundaries:

- validate input at runtime
- convert raw input into typed commands/DTOs
- reject invalid input early
- map domain failures to transport errors explicitly

Do not pass raw request objects deep into domain/application logic.

---

## 9.3 Persistence and Transactions

For relational persistence:

- make transaction boundaries explicit
- keep related reads/writes inside the same transaction where atomicity is required
- prefer database constraints as a final line of defense for invariants the database can enforce
- use locking/atomic database operations for cross-request concurrency correctness

Do not rely on a process-local JavaScript mutex for an invariant that must remain correct across multiple Node.js processes or application instances.

---

# 10. Relational Data Modeling Rules

Even though this document focuses on code quality, relational modeling is part of maintainability.

## Required

- Use primary keys deliberately.
- Use foreign keys for real relationships.
- Use unique constraints for uniqueness invariants.
- Use check constraints for simple database-enforceable invariants.
- Define nullability intentionally.
- Index fields based on actual query and locking patterns.
- Keep migrations deterministic and reviewable.
- Store timestamps consistently.

Do not use application code as the only enforcement mechanism when a relational constraint can safely protect the invariant too.

Avoid denormalization until a measured read/write requirement justifies it.

---

# 11. Code Review Rules for Agents

Before declaring a change complete, verify all of the following.

## Specification

- [ ] The implementation satisfies the relevant acceptance criteria.
- [ ] No business rule was changed silently.
- [ ] New assumptions are documented.

## SOLID / Design

- [ ] Each module has a clear responsibility.
- [ ] High-level business logic is isolated from infrastructure details.
- [ ] Interfaces are small and meaningful.
- [ ] No abstraction was introduced without a concrete purpose.
- [ ] Composition is preferred over unnecessary inheritance.

## TDD / Tests

- [ ] New behavior has tests.
- [ ] Bug fixes include a regression test.
- [ ] Tests verify behavior rather than implementation details.
- [ ] Time-dependent tests do not rely on real waiting.
- [ ] Database concurrency behavior is tested against a real database when relevant.
- [ ] No test was weakened or deleted merely to make the suite pass.

## TypeScript

- [ ] No unjustified `any`.
- [ ] No unjustified type assertion or non-null assertion.
- [ ] Public contracts have understandable types.
- [ ] Finite states are modeled explicitly.
- [ ] Type checking passes.

## React

- [ ] Render logic is pure.
- [ ] Props/state are not mutated.
- [ ] Effects are only used when synchronization is actually required.
- [ ] Reusable stateful UI behavior is extracted only when useful.
- [ ] UI tests use user-observable behavior.

## Maintainability

- [ ] Names express intent.
- [ ] Comments explain why, not obvious mechanics.
- [ ] No dead code remains.
- [ ] No speculative architecture was added.
- [ ] Dependencies were not added without justification.

---

# 12. Definition of Done

A coding task is complete only when applicable checks succeed:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Use the repository's actual scripts if they differ.

The change should also satisfy:

- all acceptance criteria
- regression tests for changed behavior
- integration/concurrency tests where infrastructure semantics matter
- no disabled/focused tests (`.skip`, `.only`) left unintentionally
- no new unexplained `TODO` / `FIXME`
- documentation or API contract updates when behavior changes

Coverage percentage is a signal, not the goal. Prefer meaningful behavioral coverage over tests written only to increase a number.

---

# 13. Instructions for AI Coding Agents

When modifying this repository:

1. Read the relevant specification and existing tests before editing production code.
2. Identify the business invariant and acceptance criterion being changed.
3. For new behavior, write or update a failing test first whenever practical.
4. Make the smallest coherent implementation change.
5. Refactor only while tests remain green.
6. Respect existing architecture unless there is a documented reason to change it.
7. Do not introduce new dependencies when the platform or existing dependencies already solve the problem adequately.
8. Do not replace explicit domain code with generic abstraction merely to reduce line count.
9. Do not silently change database schemas, API contracts, or public types.
10. Do not weaken validation, locking, transactions, or tests to make implementation easier.
11. Prefer deterministic code and deterministic tests.
12. Report important trade-offs, assumptions, and unresolved risks in the final implementation notes.

For large cross-cutting changes, propose the intended boundary/design before rewriting multiple modules.

---

# 14. Reference Sources

These rules are synthesized for this project using primary/official documentation and original engineering-principle sources.

## SOLID / TDD

- Robert C. Martin — **SOLID Relevance**  
  https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html
- Robert C. Martin — **The Cycles of TDD**  
  https://blog.cleancoder.com/uncle-bob/2014/12/17/TheCyclesOfTDD.html

## TypeScript

- TypeScript Handbook — **Classes**  
  https://www.typescriptlang.org/docs/handbook/2/classes.html
- TypeScript Handbook — **Object Types / Interfaces**  
  https://www.typescriptlang.org/docs/handbook/2/objects.html
- TypeScript — **TSConfig Reference**  
  https://www.typescriptlang.org/tsconfig/

## Node.js

- Node.js — **Test Runner**  
  https://nodejs.org/api/test.html
- Node.js — **Modules / Packages**  
  https://nodejs.org/api/packages.html

## React

- React — **Components and Hooks must be pure**  
  https://react.dev/reference/rules/components-and-hooks-must-be-pure
- React — **Choosing the State Structure**  
  https://react.dev/learn/choosing-the-state-structure
- React — **You Might Not Need an Effect**  
  https://react.dev/learn/you-might-not-need-an-effect
- React — **Reusing Logic with Custom Hooks**  
  https://react.dev/learn/reusing-logic-with-custom-hooks
- React — **Scaling Up with Reducer and Context**  
  https://react.dev/learn/scaling-up-with-reducer-and-context
- React — **Rules of Hooks**  
  https://react.dev/reference/rules/rules-of-hooks

## React Testing

- Testing Library — **Guiding Principles**  
  https://testing-library.com/docs/guiding-principles/
- React Testing Library — **Introduction**  
  https://testing-library.com/docs/react-testing-library/intro/

## Optional Unified Test Runner

- Vitest — **Features**  
  https://vitest.dev/guide/features
- Vitest — **Mocking**  
  https://vitest.dev/guide/mocking

---

## Final Principle

**Prefer simple, explicit, tested code over clever, abstract, or pattern-heavy code.**

A design pattern is successful when it makes the business behavior easier to understand, test, and change—not when it makes the code look more “architected.”
