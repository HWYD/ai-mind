# Resource Boundary Requirements Checklist

**Purpose**: Unit-test the v0.3.5 requirements writing before implementation
**Created**: 2026-06-29
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [x] CHK001 Are allowed `@demo://` resource path families explicitly documented? [Completeness, Spec §Functional Requirements]
- [x] CHK002 Are forbidden schemes and real repository directories explicitly documented? [Completeness, Spec §Non-goals]
- [x] CHK003 Are demo version plans specified as a closed slim corpus rather than an open historical archive? [Completeness, Spec §Demo Workspace]
- [x] CHK004 Are future and in-progress versions explicitly excluded from demo `version-plans/`? [Completeness, Spec §FR-035-03]
- [x] CHK005 Are optional context resources addressed so real docs do not remain reachable through planning decisions? [Coverage, Spec §FR-035-14]

## Requirement Clarity

- [x] CHK006 Is the `@demo://` scheme mapping clear enough to distinguish URI path from filesystem path? [Clarity, Spec §FR-035-05]
- [x] CHK007 Is path normalization and root boundary checking specified with objective conditions? [Clarity, Spec §FR-035-06]
- [x] CHK008 Is the old `@docs://` behavior specified as fail-closed rather than compatibility fallback? [Clarity, Spec §FR-035-07]
- [x] CHK009 Is `versionPlanUri` field retention clearly separated from URI value migration? [Clarity, Spec §FR-035-12]

## Requirement Consistency

- [x] CHK010 Do spec, acceptance, decisions, and plan consistently use `v030-hitl-checkpoint-resume.md`? [Consistency]
- [x] CHK011 Do all artifacts consistently avoid putting v0.3.5 and v0.3.6 into demo version plans? [Consistency]
- [x] CHK012 Do runtime non-goals consistently preserve Graph, HITL, stream, reducer, and schema contracts? [Consistency]

## Acceptance Criteria Quality

- [x] CHK013 Are resolver success and failure cases objectively verifiable? [Acceptance Criteria, acceptance.md]
- [x] CHK014 Are Tasklist Agent migration checks independently verifiable from UI polish checks? [Acceptance Criteria, acceptance.md]
- [x] CHK015 Are mobile polish requirements measurable without prescribing a full redesign? [Acceptance Criteria, Spec §US4]

## Edge Case Coverage

- [x] CHK016 Are traversal, absolute path, unknown scheme, extension, size, and catalog failure cases covered? [Coverage, Spec §Edge Cases]
- [x] CHK017 Are manifest inconsistency cases covered by corpus completeness testing? [Coverage, acceptance.md]
- [x] CHK018 Are old docs references covered as rejected input rather than silent downgrade? [Coverage, acceptance.md]

## Non-Functional Requirements

- [x] CHK019 Are security and privacy boundaries defined for resolver errors and public DTOs? [Security, plan.md]
- [x] CHK020 Are performance limits defined through file size and preview/content character limits? [Performance, Spec §FR-035-09]
- [x] CHK021 Are accessibility and layout risks constrained through mobile-only style requirements? [UX, Spec §US4]
