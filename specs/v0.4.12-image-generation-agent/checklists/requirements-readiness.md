# Requirements Readiness Checklist: Image Generation Agent

**Purpose**: 评审 v0.4.12 生图 Agent 的需求、契约和验收口径是否完整、清晰、一致且可客观评估；不用于验证实现代码。
**Created**: 2026-07-28
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [tasks.md](../tasks.md)
**Audience / Timing**: PR reviewer；开始实现前及进入 release closing 前。
**Depth / Focus**: 标准深度；受控 Agent 边界、临时图片安全/所有权、前端状态与可访问性。

## Requirement Completeness

- [x] CHK001 Are the accepted `/image` command forms, description source and whitespace/unicode normalization rules fully specified? [Resolved, Spec §Implementation-Ready Rules; Contract image-agent-stream §Entry Contract]
- [x] CHK002 Are maximum input length, ImageBrief field length and public-summary array-size requirements explicitly defined rather than delegated only to implementation schemas? [Resolved, Spec §Implementation-Ready Rules]
- [x] CHK003 Are the accepted aspect-ratio/default-size choices and the rule for converting a user request into the fixed provider size documented before the external smoke finalizes them? [Resolved, Spec §Implementation-Ready Rules; Tasks §T003]
- [x] CHK004 Are unsupported edit, reference-image, group-image and multi-candidate requests defined with sufficiently distinct user-facing boundary messages? [Resolved, Contract image-agent-stream §Error Codes]
- [x] CHK005 Are requirements defined for a user description that mixes a supported text-to-image request with an unsupported edit request? [Resolved, Spec §Implementation-Ready Rules]
- [x] CHK006 Are the fields permitted in `PublicImageBriefSummary` complete and explicitly separated from all internal Prompt/inspection data? [Resolved, Data Model §Public DTO; Contract image-agent-stream §image-brief]
- [x] CHK007 Are filename format, fallback extension and image alt-text source requirements specified for the temporary result card? [Resolved, Contract temporary-image-content §Success Response and §Browser Contract]

## Bounded Agent Decision Clarity

- [x] CHK008 Is the distinction between a fixable blocking inspection issue, a non-blocking issue and an unrecoverable blocking issue defined with decision criteria rather than examples alone? [Resolved, Spec §Implementation-Ready Rules]
- [x] CHK009 Are the allowed system assumptions and the condition for converting an ambiguity into a pre-generation failure explicitly bounded? [Resolved, Spec §Implementation-Ready Rules]
- [x] CHK010 Is the behavior when `maxPlanningModelCalls = 5` is reached before a final inspection result specified as a safe terminal requirement? [Resolved, Spec §FR-052-011; Plan §Summary]
- [x] CHK011 Are requirements explicit that planning-model structured-output repair, if any, consumes the same five-call budget and cannot create a hidden retry loop? [Resolved, Spec §FR-052-011; Contract image-agent-stream §Planning-output-invalid Order]
- [x] CHK012 Are the immutable raw description, internal ImageBrief and public summary retention requirements mutually consistent across GraphState, database metadata and StreamEvent? [Resolved, Data Model §Model Boundaries]
- [x] CHK013 Is the point at which image generation becomes irrevocable defined relative to cancellation and the `imageGenerationCount` increment? [Resolved, Spec §Implementation-Ready Rules; Data Model §Generation Counters]

## Temporary Result Security and Ownership

- [x] CHK014 Are the required temporary-result retention duration, expiry source and cleanup responsibility specified independently of a provider URL's undocumented lifetime? [Resolved, Spec §FR-052-016; Data Model §Retention and Cleanup]
- [x] CHK015 Is the exact trusted Provider URL host allowlist approval/update process documented after the Agent Plan smoke identifies the host? [Resolved, Contract temporary-image-content §Trusted Host Allowlist Change Control]
- [x] CHK016 Are the maximum upstream byte size, read timeout and accepted image MIME set specified as product/security limits rather than only a target range? [Resolved, Contract temporary-image-content §SSRF and Upstream Fetch Rules]
- [x] CHK017 Are requirements explicit about the user-visible distinction among an expired URL, a missing result, an invalid result and an unauthorised result? [Resolved, Contract temporary-image-content §Authorization and State Checks]
- [x] CHK018 Is it clear whether a completed image card remains readable after the stream retention window but before the provider result expires, or whether that case is intentionally unsupported? [Resolved, Spec §Implementation-Ready Rules]
- [x] CHK019 Are temporary Provider URL, request ID, image dimensions and byte length classification rules documented consistently for logs, database metadata and public DTOs? [Resolved, Data Model §Data Classification]
- [x] CHK020 Are session-ownership requirements defined for all image-related routes, including cancellation, stream replay and temporary content retrieval? [Resolved, Contract image-agent-stream §Route Ownership]

## Frontend Interaction and Accessibility Requirements

- [x] CHK021 Are visual hierarchy, placement and responsive-width requirements defined for ImageBrief, workflow progress and ImageResult cards within an existing assistant message? [Resolved, Spec §Implementation-Ready Rules]
- [x] CHK022 Are accessible names, keyboard behavior and focus order specified for the download action, the stop action and the expired-result recovery path? [Resolved, Spec §FR-052-015/020/028; Plan §Frontend Component Composition]
- [x] CHK023 Are image alternative-text requirements specified so generated images receive meaningful non-sensitive text without exposing the internal Prompt? [Resolved, Spec §FR-052-015; Contract temporary-image-content §Browser Contract]
- [x] CHK024 Are loading, cancelled, expired and provider-failure states defined with consistent wording, severity and retry/re-submit affordances? [Resolved, Contract image-agent-stream §Error Codes; Contract temporary-image-content §Authorization and State Checks]
- [x] CHK025 Is the “临时结果，请及时下载” message defined with a consistent visibility rule across preview-ready, download-ready and expired states? [Resolved, Spec §Implementation-Ready Rules]
- [x] CHK026 Are the conditions for enabling the download button specified when image Blob loading is incomplete, fails or is cancelled? [Resolved, Spec §Implementation-Ready Rules]
- [x] CHK027 Are refresh, tab close and stream replay requirements consistent with the decision not to persist Blob/object URLs in local chat snapshots? [Resolved, Spec §Implementation-Ready Rules; Contract image-agent-stream §Replay Rules]

## Progress, Failure and Concurrency Coverage

- [x] CHK028 Are the public progress stages defined with a complete mapping from Agent terminal paths, including prompt-blocked, provider rejection and cancelled paths? [Resolved, Contract image-agent-stream §Progress Contract]
- [x] CHK029 Is the 1-second cancelled-UI criterion scoped clearly to client acknowledgement versus provider-side cancellation, which is explicitly best-effort? [Resolved, Spec §Implementation-Ready Rules; Contract image-agent-stream §Cancel Order]
- [x] CHK030 Are requirements clear about whether an idempotent replay of the active `/image` request should resume the same visible message or return only transport-level replay information? [Resolved, Data Model §Atomic Create / Replay / Conflict; Contract image-agent-stream §Replay Rules]
- [x] CHK031 Are the conflict-message requirements for a second same-session request clear about whether users can stop the active task from that message or only from the original task? [Resolved, Spec §FR-052-029]
- [x] CHK032 Are content-safety rejection requirements explicitly distinguished from unsupported-capability and prompt-blocked failures in public wording and retry guidance? [Resolved, Contract image-agent-stream §Error Codes]

## Acceptance Criteria and Dependency Quality

- [x] CHK033 Is the 95% within-120-seconds criterion defined with measurement boundaries, including queueing, planning-model calls, provider duration and proxy Blob retrieval? [Resolved, Spec §SC-052-006; Research §Decision 14]
- [x] CHK034 Are all 100% success criteria scoped to deterministic automated tests, controlled fakes or credentialed external smoke runs so their evidence source is unambiguous? [Resolved, Quickstart §Acceptance Evidence Matrix]
- [x] CHK035 Is the fixed Agent Plan endpoint dependency documented with its required account entitlement, API-Key reuse and pre-release smoke gate? [Resolved, Plan §External Contract Gate; Tasks §T003/T055]
- [x] CHK036 Are the requirements explicit that a failure of the external smoke may refine request fields and safety limits but cannot silently substitute a model or endpoint? [Resolved, Plan §External Contract Gate; Tasks §T003]
- [x] CHK037 Are database migration rollback/reconciliation requirements defined for an active image lease left by a deploy interruption or process crash? [Resolved, Quickstart §Migration and Crash Reconciliation; Tasks §T043/T047]
- [x] CHK038 Are the non-goals for cost estimation, multi-provider fallback, HITL, editing and long-term storage consistently excluded across spec, plan, contracts and tasks? [Resolved, reviewed against Spec §Non-goals, Plan §Constraints and Tasks scope]

## Daily Quota and Abuse Guard

- [x] CHK039 Is the Session product quota and IP anti-abuse ceiling separately defined, including defaults and adjustment range? [Resolved, Spec FR-052-032; Plan §4.1]
- [x] CHK040 Are quota counting exclusions (invalid request, idempotent replay, active conflict) and post-acceptance failure consumption explicit? [Resolved, Spec FR-052-033; Data Model §Quota Counting Rules]
- [x] CHK041 Is the natural-day reset and in-memory/multi-instance limitation documented without exposing internal identifiers? [Resolved, Spec FR-052-034; Decisions D-010]

## Notes

- Mark an item `[x]` only after the requirement source is explicit enough for a reviewer to assess without inferring implementation choices.
- Record findings inline with a link to the section requiring clarification or amendment.
- `[Gap]`, `[Ambiguity]`, `[Assumption]` and `[Dependency]` items indicate requirement-quality questions, not implementation defects.
