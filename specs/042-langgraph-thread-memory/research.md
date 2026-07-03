# Research: AI Mind v0.4.2 LangGraph Single Thread Memory Baseline

**Feature**: [spec.md](./spec.md)
**Date**: 2026-07-02

## D042-001: Chat Memory Checkpoint Mode

**Decision**: Add `AI_MIND_CHAT_MEMORY_CHECKPOINT=off|memory|postgres`. Default to `memory` in development and `postgres` in production. Explicit `off` disables chat memory.

**Rationale**: Tasklist Agent already owns `AI_MIND_GRAPH_CHECKPOINT`; reusing it would couple unrelated runtime behavior. Chat memory needs its own rollout and failure controls. Production durable recovery requires PostgreSQL, while development and tests benefit from MemorySaver.

**Alternatives considered**:

- Reuse `AI_MIND_GRAPH_CHECKPOINT`: rejected because it would make Tasklist Agent and ordinary chat memory change together.
- Default all environments to `off`: rejected because it weakens the release target and makes production recovery opt-in.

## D042-002: Independent Checkpoint Schema

**Decision**: Use a separate LangGraph checkpoint schema named `langgraph_chat_memory`.

**Rationale**: Tasklist Agent HITL resume is a high-value existing path using `langgraph_checkpoint`. Keeping chat memory in a separate schema reduces collision and state-shape confusion risk. Both schemas can share the same PostgreSQL instance while staying operationally distinct.

**Alternatives considered**:

- Reuse `langgraph_checkpoint` with thread namespace prefixes: rejected because it places unrelated checkpoint state shapes in the same table space.
- Prisma-managed chat memory tables: rejected because v0.4.2 does not introduce business chat history tables and checkpoint tables must remain outside Prisma migrations.

## D042-003: Chat Thread Identity

**Decision**: Build chat thread ids as `chat:${sessionHash}`, where `sessionHash` is derived from the existing HttpOnly browser session id and a server-side secret. Do not expose raw session id.

**Rationale**: The product currently has one visible chat session per browser session. Binding memory to browser session gives refresh recovery without adding multi-session UI or a business table. A derived id is safe enough to return in hydration DTOs for diagnostics and tests.

**Alternatives considered**:

- Bind to frontend `conversationId`: rejected because current `conversationIdRef` resets on refresh.
- Return raw session id: rejected because the session cookie is HttpOnly and should not be mirrored into client-readable DTOs.

## D042-004: ThreadState Scope

**Decision**: ThreadState stores only text-only recent messages, summary, pinned decisions, and optional compaction metadata. It excludes tool transcripts, MCP transcripts, structured command turns, Tasklist GraphState, HITL checkpoints, Delivery Chain RuntimeArtifact, raw prompts, raw provider responses, and stack traces.

**Rationale**: Current frontend `MindMessage` is a UI view model with many internal/structured parts. Persisting it directly would mix display state, tool/resource transcripts, Agent state, and artifacts into memory. v0.4.2 is a baseline, so text-only state is the safest useful slice.

**Alternatives considered**:

- Persist full `MindMessage[]`: rejected because it would store UI and runtime internals.
- Persist LangChain `BaseMessage[]` directly: rejected for public hydration because it is not the frontend display contract and may contain provider/tool metadata.

## D042-005: Structured Command Turns

**Decision**: v0.4.2 does not write `/tasklist` or `/delivery-chain` turns into chat ThreadState. Ordinary text chat, reader/utility, and docs summary style text-only turns may be written.

**Rationale**: Tasklist Agent and Delivery Chain already have strict runtime boundaries. Excluding their turns avoids accidental summary of GraphState, HITL state, workflow progress, RuntimeArtifact, or subagent internals.

**Alternatives considered**:

- Save final text from structured command turns: rejected for the baseline because it is easy to accidentally retain more than final text.
- Save only direct chat and no skill/summary paths: rejected because it makes memory too weak for current normal text workflows.

## D042-006: Compaction Policy

**Decision**: Keep up to 8 recent text messages before compaction. When the threshold is exceeded after a successful assistant turn, compact older messages into a summary of about 2500 Chinese characters and up to 20 pinned decisions. After successful compaction, keep only half of the recent-message window as retained recent messages. Use model-generated structured output with strict validation of only `summary` and `pinnedDecisions`; failure is no-op.

**Rationale**: Recent messages preserve local conversational texture, while summary and pinned decisions preserve older context. Keeping only half of the recent-message window after compaction avoids a long conversation re-triggering compaction on every immediately following turn. A no-op failure mode protects the already completed user answer and existing memory.

**Alternatives considered**:

- Rule-only concatenation/truncation fallback: rejected because it weakens compaction quality and creates a second competing memory behavior.
- Larger unbounded summary/pins: rejected because it recreates context growth through another field.
- Compaction before answering: rejected because a failure could block the user-facing turn.

## D042-010: Internal Compaction Model

**Decision**: Use the fixed internal compaction model id `deepseek/deepseek-v4-pro` for v0.4.2. The compaction call is independent from the user's selected chat model id, uses non-streaming invocation, and disables reasoning.

**Rationale**: Compaction is a controlled internal maintenance task, not part of the user-visible model-selection surface. Fixing the model id reduces behavior drift and keeps the rollout narrow. The same provider model name may be served by different providers, so the implementation should bind to the internal model id and let the repo's model catalog resolve the actual provider path.

**Alternatives considered**:

- Reuse the current user-selected chat model: rejected because it makes memory quality and cost vary per request.
- Add a new environment variable for compaction model id in v0.4.2: rejected because it expands rollout surface before the baseline is stable.
- Keep deterministic fallback: rejected because this version explicitly standardizes on model-generated compaction.

## D042-007: Hydration API

**Decision**: Add `GET /api/chat/thread` returning a strict safe ThreadHydrationDTO.

**Rationale**: Hydration is not stream protocol and should not expand `@ai-mind/stream-core`. A dedicated route keeps page initialization separate from chat generation and can create/read the browser session consistently.

**Alternatives considered**:

- `GET /api/chat/hydration`: viable, but less extensible if thread metadata grows.
- Hydrate through the streaming chat route: rejected because it couples page initialization with generation and stream lifecycle.

## D042-008: Write Timing

**Decision**: Write chat memory once after an assistant turn successfully completes. Do not write per streaming chunk and do not save cancelled/incomplete assistant placeholders.

**Rationale**: Streaming chunks are high frequency and can be partial. Persisting only completed turns gives stable recovery and avoids storage churn.

**Alternatives considered**:

- Persist every chunk: rejected due to performance, consistency, and partial-message risks.
- Persist only at request start: rejected because the assistant answer would be missing after refresh.

## D042-009: Deployment Setup

**Decision**: Add chat checkpoint setup while keeping Tasklist checkpoint setup explicit. `db:setup:deploy` should initialize Prisma business tables, Tasklist checkpoint schema, and chat memory checkpoint schema.

**Rationale**: Production default uses PostgresSaver. Deployment setup must prepare the new schema without hiding that it is separate from Tasklist checkpoint state.

**Alternatives considered**:

- Rely on lazy runtime setup: rejected because runtime requests should not create database schema opportunistically.
- Prisma migration: rejected by ADR and constitution boundary.

## D042-011: Server-Authoritative Model Context

**Decision**: For eligible ordinary chat memory paths, the backend treats chat ThreadState as the authoritative source of model-visible conversation history. The frontend request may continue to send historical `messages` for compatibility and UI state, but runtime context assembly uses only the latest eligible frontend user message as the current turn input, plus `summary`, `pinnedDecisions`, and ThreadState recent messages.

**Rationale**: The existing frontend request builder sends a local recent-history window. After v0.4.2 added backend ThreadState recent messages, model input could contain the same history twice and exceed input limits before compaction could run. A server-authoritative context builder matches LangGraph-style thread memory better: recoverable state lives in the backend checkpoint, while the frontend contributes the current user turn.

**Alternatives considered**:

- Keep frontend history as model history and remove ThreadState recent messages from model context: rejected as a transitional approach because it weakens the long-term LangGraph memory architecture and leaves the frontend as the history source of truth.
- Change the frontend immediately to send only the latest message: viable long term, but rejected for this patch because it is unnecessary for backend correctness and would broaden UI/regenerate/delete behavior changes.
- Merge frontend history and backend ThreadState with deduplication: rejected for v0.4.2 because message ids are not guaranteed to align across hydration, local UI turns, and persisted ThreadState, and deduplication would add fragile complexity.
