# Scope Boundary Checklist 037

状态: 已检查
版本: v0.3.7

## Allowed

- [x] Add additive workflow progress stream chunks.
- [x] Add workflow progress schema tests.
- [x] Add workflow progress reducer state.
- [x] Add generic Workflow Progress component.
- [x] Bind first consumer to `/delivery-chain`.
- [x] Emit delivery-chain progress around existing graph nodes.
- [x] Keep workflow step details as curated summaries rather than raw event replay.
- [x] Improve Delivery Chain report section presentation with Markdown fallback.
- [x] Preserve v0.3.6 compact resource grouping.

## Forbidden

- [x] Do not add `/plan`.
- [x] Do not add `/task`.
- [x] Do not add `/review`.
- [x] Do not create independent PlanAgent / TaskAgent / ReviewAgent runtimes.
- [x] Do not call Tasklist Agent HITL Graph from Delivery Chain.
- [x] Do not add `@artifact://`.
- [x] Do not add session artifact handoff.
- [x] Do not add artifact persistence.
- [x] Do not add chat persistence.
- [x] Do not add Prisma schema or migration.
- [x] Do not modify PostgresSaver schema.
- [x] Do not connect Delivery Chain to PostgresSaver.
- [x] Do not add checkpoint / interrupt / HITL / resume.
- [x] Do not modify Tasklist Agent Graph topology.
- [x] Do not modify Tasklist Agent HITL decision contract.
- [x] Do not restore `@docs://`.
- [x] Do not read real `docs/`, `specs/`, `apps/`, `packages/`, `private-folder/`.
- [x] Do not add complete observability platform.
- [x] Do not add Agent event store.
- [x] Do not add LangSmith deep trace UI.
- [x] Do not persist workflow progress as DB trace.
- [x] Do not auto-forward ordinary tool/resource/prompt events into workflow progress.
