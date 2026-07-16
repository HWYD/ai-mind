# Checklist: Conversation Deletion Requirements Quality

**Purpose**: Validate that the single-conversation deletion requirements are complete, clear, consistent, and measurable.
**Created**: 2026-07-15
**Scope**: Desktop/mobile action menu, destructive confirmation, server Registry + ThreadState deletion, and local cleanup.

## Requirement Completeness

- [x] CHK001 Are the deletion ownership rules explicitly defined for the current browser session? [Completeness, Spec FR-047-017E]
- [x] CHK002 Are both server-side deletion targets—Registry entry and corresponding ThreadState/checkpoint—named explicitly? [Completeness, Spec FR-047-017E]
- [x] CHK003 Are successful local cleanup targets—index metadata and UI snapshot—specified independently from server deletion? [Completeness, Spec FR-047-017F]
- [x] CHK004 Are current, non-current, and last-conversation outcomes all specified? [Coverage, Spec FR-047-017G]

## Requirement Clarity

- [x] CHK005 Is the confirmation copy required to identify the conversation being deleted? [Clarity, Spec FR-047-017D]
- [x] CHK006 Is the menu scope unambiguous that Delete is the only available operation? [Clarity, Spec FR-047-017B]
- [x] CHK007 Is server success defined as completion of both Registry and ThreadState deletion rather than only one storage write? [Clarity, Spec FR-047-017E]

## Requirement Consistency

- [x] CHK008 Do local-first rendering and server-authoritative deletion agree that local cleanup waits for a valid server success response? [Consistency, Spec FR-047-017F/FR-047-017H]
- [x] CHK009 Do desktop hover/focus requirements and mobile always-accessible requirements avoid relying on the same interaction affordance? [Consistency, Spec FR-047-017B]

## Acceptance Criteria Quality

- [x] CHK010 Can successful deletion be objectively evidenced by absence of the ID from Registry, absence of ThreadState, and absence of local data? [Measurability, Spec SC-047-012]
- [x] CHK011 Can failure behavior be objectively distinguished from success by preserved local row/snapshot and a recoverable error? [Measurability, Spec FR-047-017H]

## Scenario and Edge Case Coverage

- [x] CHK012 Are confirmation cancel, dialog dismiss, invalid request, unknown conversation, and server failure intentionally covered? [Exception Flow, Spec FR-047-017D/FR-047-017E/FR-047-017H]
- [x] CHK013 Are keyboard focus, touch access, disabled/loading state, and dialog accessibility requirements defined for all action controls? [Accessibility, Spec FR-047-017B/FR-047-017I]
- [x] CHK014 Is the lack of a cross-store transaction documented together with the client-visible failure policy? [Dependency, Assumption, Spec FR-047-017H]
