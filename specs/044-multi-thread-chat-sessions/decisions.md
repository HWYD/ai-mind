# Decisions 044: Minimal Multi-thread Chat Sessions

**Status**: Accepted / implemented  
**Version**: v0.4.4  
**Date**: 2026-07-05

## D044-001: Conversation Registry belongs to the current browser session

**Decision**

- v0.4.4 introduces a minimal Conversation Registry scoped to the current browser session.
- The registry is not a global conversation table and not account-level history.
- The registry retains at most 10 recent conversations.

## D044-002: Use conversation-scoped chat memory thread identity

**Decision**

- Each conversation maps to its own isolated chat-memory thread.
- v0.4.4 does not migrate or reuse legacy `chat:${sessionHash}` as conversation identity.
- Public `conversationId` remains opaque and does not expose raw session or checkpoint identity.

## D044-003: ThreadState remains text-only

**Decision**

- `ThreadState` continues to store only text-only `messages`, `summary`, `pinnedDecisions`, and `lastCompactedAt`.
- `ChatThreadMessage` does not gain persisted `conversationId`, source badge, agent badge, or runtime metadata.

## D044-004: Recent ordering and pruning follow last active time

**Decision**

- Recent conversations are sorted by `lastActiveAt` descending.
- Legacy `hasMessages=false` registry entries are normalized out instead of counting toward the persisted recent limit.
- User send and completed assistant final-turn write update `lastActiveAt`.
- Active selection updates only `selectedConversationId`; it does not reorder the recent list by itself.
- The registry contains only persisted conversations; when it exceeds 10 entries, pruning removes the least recently active persisted conversation entry.

## D044-005: Server-validated selected conversation is authoritative

**Decision**

- Hydration, model-visible context, and completed-turn append use the server-validated selected persisted conversation.
- Client-side persistence is only a restore hint for persisted conversations; blank draft may exist as a client-local sentinel only.
- Missing or invalid `conversationId` never silently falls back to a different active conversation or legacy thread.

## D044-006: Streaming guard stays outside stream protocol

**Decision**

- New chat and conversation switch controls are disabled while assistant output is streaming or a pending review is active.
- Active request ownership is bound to the conversation captured when the request starts.
- v0.4.4 does not change `@ai-mind/stream-core` chunk union.

## D044-007: Minimal sidebar and mobile selector only

**Decision**

- Desktop gets a minimal collapsible conversation sidebar.
- Mobile gets a compact top trigger plus drawer-style selector.
- v0.4.4 excludes search, pagination, rename/delete/archive/share, folders/tags, and other full-history controls.

## D044-013: New chat uses pure draft state until the first user message

**Decision**

- Clicking `新聊天` enters a blank draft state and does not immediately create a persisted conversation.
- Blank draft does not enter the server-side Conversation Registry, does not consume recent-list capacity, and does not require empty-conversation pruning.
- The first accepted user message from draft creates the persisted conversation, binds stream ownership to it, and then allows title derivation and final-turn persistence to proceed on that new conversation.

## D044-008: Tasklist and Delivery semantics remain separate

**Decision**

- Tasklist checkpoint/resume keeps Tasklist-owned GraphState and thread identity.
- Delivery remains run-local.
- Only completed user-visible final text appends to selected conversation memory.

## D044-009: No business ChatSession or ChatMessage table

**Decision**

- v0.4.4 does not add Prisma-managed ChatSession or ChatMessage business-history tables.
- Registry and ThreadState remain in the chat-memory runtime / checkpoint boundary.

## D044-010: Conversation UI inherits the existing InstantMind baseline

**Decision**

- Conversation sidebar / mobile selector first reuse local `apps/webapp/components/ui/` primitives and current `radix-vega` baseline.
- Missing primitives are added locally inside the webapp baseline; v0.4.4 does not fetch UI components from MCP or a remote registry.
- Visual direction stays on the current `instant-mind` chat shell and `apps/webapp/app/globals.css` theme tokens rather than the landing page.

## D044-011: Hydration is conversation-change driven, not status-change driven

**Decision**

- Same-conversation `ready -> submitted -> streaming -> ready` transitions must not re-hydrate and wipe local in-memory messages.
- Re-hydration happens for first load and real conversation switches; if a conversation switch is attempted while busy, hydration is deferred until the hook is ready again.
- Real conversation switches also clear the previous `thread-memory-status` hint so compaction state does not bleed into another conversation UI.

**Rationale**

- This prevents aborted or just-finished streams from losing already-rendered assistant content.
- It keeps hydration aligned with conversation ownership rather than transient stream status.

## D044-012: Release evidence must emphasize isolation and non-regression

**Decision**

- Release evidence must prove registry limit behavior, create/switch correctness, per-conversation hydration/context/write isolation, streaming guard, forbidden-field safety, and v0.4.2/v0.4.3 non-regression.

**Implementation evidence**

- Focused v0.4.4 suite passed: `129 passed` tests
- Webapp full suite passed: `596 passed | 20 skipped`
- Stream-core suite passed: `22 passed`
- `pnpm typecheck`, `pnpm lint:webapp`, and `git diff --check` passed

## D044-014: Converge in-scope conversation UI to local shadcn primitives

**Decision**

- Within v0.4.4 scope, eligible conversation UI surfaces should be converged to local `apps/webapp/components/ui/` `shadcn/ui` primitives wherever an equivalent exists, instead of keeping bespoke presentation-only shells.
- `shadcn` MCP may be used for planning, registry review, example lookup, and add-command generation, but delivered code must still be vendored locally inside the webapp baseline and must not depend on runtime MCP or remote registry fetching.
- Primitive-level convergence is preferred over block-level import. Official `sidebar-*` / `drawer-*` examples may inform structure, but v0.4.4 should not import unrelated navigation chrome, account menus, projects, or other scope-expanding app-shell content.
- Current priority candidates are local `sidebar`, `scroll-area`, `skeleton`, and `alert`; the mobile recent-conversation selector keeps left-side `sheet` semantics unless a replacement preserves the same interaction model and version scope.

**Rationale**

- This aligns the feature more strictly with the project's stated `shadcn/ui` baseline without re-skinning the page away from the existing `instant-mind` shell.
- It reduces one-off UI markup in the conversation surface while preserving v0.4.4's minimal product boundary.
