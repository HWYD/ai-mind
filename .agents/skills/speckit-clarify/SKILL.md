---
name: speckit-clarify
description: Use for AI Mind Level C or Level D changes after an initial spec.md exists and before plan.md is finalized. Clarifies goals, user-visible behavior, non-goals, boundaries, acceptance language, and required human decisions by reading constitution, current specs, ADR, and architecture docs. This is a Codex development skill, not an AI Mind product runtime Skill.
---

# Spec Kit Clarify

## Purpose

Clarify an AI Mind Level C / Level D spec before implementation planning.

Use this skill when the user asks for `$speckit-clarify`, `/speckit.clarify`, Spec Kit clarify, or when a complex AI Mind version has a draft `spec.md` but still needs ambiguity review.

## Required Inputs

- Target spec directory, usually `specs/<version-topic>/`
- Draft `spec.md`
- Any explicit user decisions in the current thread

If the target spec is missing, state that clarify is blocked by missing formal spec context.

## Read Order

1. `.specify/memory/constitution.md`
2. Target `spec.md`
3. Target `decisions.md` if it already exists
4. Relevant `docs/adr/`
5. Relevant `docs/architecture/`

Read `private-folder/` only if the user explicitly asks to inspect drafts or historical materials.

## Clarify Questions

Check and answer:

- What is the version goal?
- What user-visible behavior changes?
- What system behavior changes?
- What is explicitly out of scope?
- What data, API, stream, GraphState, DB, deployment, or AI coding boundary may change?
- Which decisions require human approval?
- What must be true before implementation starts?
- Is the change Level C or Level D?

## Output

Return:

- `Clarify Status`: `CLEAR`, `NEEDS_DECISION`, or `BLOCKED`
- `Resolved Assumptions`
- `Open Questions`
- `Non-goals To Preserve`
- `Required Updates Before Plan`

Do not implement code. Do not rewrite unrelated specs.
