# Inventory Reservation System — Spec-Driven Development Pack

This pack is a spec-driven development structure using a proposed TypeScript/Node.js/PostgreSQL backend and an optional React demo UI.

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
