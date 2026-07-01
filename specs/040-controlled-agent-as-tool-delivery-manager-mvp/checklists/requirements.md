# Requirements Checklist: Controlled Agent-as-tool Delivery Manager MVP

**Purpose**: Validate whether the v0.4.0 requirements are complete, clear, consistent and ready for implementation.
**Created**: 2026-07-01
**Feature**: [Spec 040](../spec.md)

**Note**: This checklist tests the quality of requirements writing, not implementation behavior.

## Requirement Completeness

- [x] CHK001 Are the public surface non-goals fully specified, including no `/plan`, `/task`, `/review`, `@artifact://`, DB, persistence and composer artifact chip? [Completeness, Spec §Non-goals]
- [x] CHK002 Are model tool-calling capability failure requirements explicitly defined? [Completeness, Spec §FR-040-13]
- [x] CHK003 Are all three required subagent tools named and bounded? [Completeness, Spec §FR-040-14..FR-040-24]
- [x] CHK004 Are RuntimeArtifact kinds and persistence exclusions fully specified? [Completeness, Spec §FR-040-35..FR-040-40]
- [x] CHK005 Are Tasklist Agent non-regression requirements explicitly specified? [Completeness, Spec §FR-040-47..FR-040-51]

## Requirement Clarity

- [x] CHK006 Is “Agent-as-tool” distinguished from runner fallback? [Clarity, Spec §Goals, §Non-goals]
- [x] CHK007 Is “ControlledDeliveryManager” defined as controlled runtime rather than free Supervisor? [Clarity, Spec §Summary, §FR-040-07]
- [x] CHK008 Is the strong JSON Schema result requirement unambiguous? [Clarity, Spec §FR-040-52..FR-040-54]
- [x] CHK009 Is fail-closed behavior specified for illegal, out-of-order, repeated, parallel and unregistered tool calls? [Clarity, Spec §US2, §Edge Cases]
- [x] CHK010 Is “no correction loop” explicitly stated for illegal tool calls? [Clarity, Spec §FR-040-34]

## Requirement Consistency

- [x] CHK011 Are tool ids consistent across spec, data model, contracts and tasks? [Consistency, Spec §Key Entities, Data Model, Contracts]
- [x] CHK012 Are RuntimeArtifact boundaries consistent across public surface, stream, UI and persistence requirements? [Consistency, Spec §US3, §RuntimeArtifact]
- [x] CHK013 Are workflow progress requirements consistent with existing v0.3.7 `workflow-progress-*` contract? [Consistency, Spec §US4, Contracts]
- [x] CHK014 Are “no global Agent Catalog” and “reuse existing tool system” reconciled as local delivery-chain registration? [Consistency, Spec §Goals, §FR-040-23..FR-040-24]
- [x] CHK015 Are “not runner fallback” and “fixed policy order” both clearly represented without contradiction? [Consistency, Spec §Tool-calling Policy]

## Acceptance Criteria Quality

- [x] CHK016 Are legal delegation acceptance criteria independently verifiable with a fake tool-call model? [Measurability, Spec §US1, Acceptance]
- [x] CHK017 Are policy failure criteria objectively measurable? [Measurability, Spec §US2, Acceptance]
- [x] CHK018 Are stream safety criteria measurable by inspecting emitted chunks? [Measurability, Spec §US4, Acceptance]
- [x] CHK019 Are Tasklist non-regression criteria tied to concrete routes/contracts? [Measurability, Spec §US5, Acceptance]
- [x] CHK020 Are required tests mapped to concrete existing or proposed test files? [Traceability, Acceptance §Required Tests]

## Scenario Coverage

- [x] CHK021 Are primary scenario-backed `/delivery-chain` inputs covered? [Coverage, Spec §Public Surface]
- [x] CHK022 Are inline requirement inputs covered? [Coverage, Spec §Public Surface]
- [x] CHK023 Are missing input and forbidden resource scenarios covered? [Coverage, Quickstart §Scenario 7]
- [x] CHK024 Are invalid model capability scenarios covered? [Coverage, Quickstart §Scenario 2]
- [x] CHK025 Are invalid JSON result scenarios covered? [Coverage, Quickstart §Scenario 4]

## Edge Case Coverage

- [x] CHK026 Are plan-before-task and tasks-before-review boundaries specified? [Edge Case, Spec §FR-040-30..FR-040-32]
- [x] CHK027 Are failed result artifact rules specified? [Edge Case, Spec §FR-040-53]
- [x] CHK028 Is review blocked behavior specified separately from failed? [Edge Case, Spec §US3, Acceptance]
- [x] CHK029 Are parallel and nested delegation exclusions specified? [Edge Case, Spec §FR-040-28..FR-040-29]
- [x] CHK030 Are sensitive data exposure exclusions listed for result, progress and artifacts? [Security, Spec §FR-040-40, §FR-040-54]

## Dependencies and Assumptions

- [x] CHK031 Is dependency on existing tool registry and Zod validation documented? [Dependency, Plan §Technical Context]
- [x] CHK032 Is the reason for using scope-aware transcript suppression in `executeToolCall()` documented? [Dependency, Research §Decision 4]
- [x] CHK033 Is the old DeliveryChainGraph replacement decision documented? [Dependency, Decisions §D040-007]
- [x] CHK034 Is fake model testing documented as the default validation approach? [Assumption, Research §Decision 7]
- [x] CHK035 Is no DB / no PostgresSaver assumption explicitly specified? [Assumption, Spec §Non-goals]

## Ambiguities and Conflicts

- [x] CHK036 Is the potential conflict between “tool” and “not global tool registry” resolved? [Conflict, Spec §FR-040-23..FR-040-24]
- [x] CHK037 Is the potential conflict between Manager autonomy and fixed order resolved? [Conflict, Spec §Tool-calling Policy]
- [x] CHK038 Is the potential conflict between RuntimeArtifact and existing `artifact-*` chunks resolved? [Conflict, Spec §RuntimeArtifact]
- [x] CHK039 Is the potential conflict between delivery-chain task-subagent and Tasklist Agent resolved? [Conflict, Spec §Tasklist Agent Non-regression]
- [x] CHK040 Is the version directory numbering aligned with v0.4.0 as `040-*`? [Traceability, specs/README.md]

## Notes

- 当前 checklist 结论：需求写作层面已具备进入实现前 review 的基础。
- 后续如果实现阶段改变 tool-calling、stream、Tasklist 或 persistence 边界，必须回到本 checklist 重新检查。
