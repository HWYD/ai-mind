# Checklist 036: Scope Boundary

状态: 已检查
版本: v0.3.6

Use this checklist during implementation and converge.

## Public command boundary

- [x] Only `/delivery-chain` is added as a public command.
- [x] `/plan` is not added.
- [x] `/task` is not added.
- [x] `/review` is not added.
- [x] Ordinary chat input is not auto-routed to Delivery Chain.

## Resource boundary

- [x] Delivery Chain reads only `@demo://`.
- [x] Scenario entry is only `@demo://scenarios/*/requirement.md`.
- [x] `@demo://version-plans/*.md` is rejected for Delivery Chain.
- [x] `@docs://`, `docs://`, `@specs://`, `file://` are rejected.
- [x] Path traversal is rejected.
- [x] Real `docs/`, `specs/`, `apps/`, `packages/`, `private-folder/` are not read.

## Runtime boundary

- [x] TaskStage does not call Tasklist Agent HITL Graph.
- [x] No nested HITL is introduced.
- [x] No new checkpoint / resume semantics are introduced.
- [x] No Agent message bus is introduced.
- [x] No independent PlanAgent / TaskAgent / ReviewAgent is introduced.

## Persistence and protocol boundary

- [x] No `@artifact://` is introduced.
- [x] No artifact persistence is introduced.
- [x] No chat persistence is introduced.
- [x] No Prisma schema change is introduced.
- [x] No PostgresSaver schema change is introduced.
- [x] No stream protocol change is introduced.
- [x] No frontend reducer data structure change is introduced.
