---
name: speckit-analyze
description: Use for AI Mind Level C or Level D changes after spec.md, plan.md, tasks.md, acceptance.md, and decisions.md exist and before implementation starts. Analyzes consistency, missing links, phase ordering, spec drift risk, ADR coverage, and verification readiness. This is a Codex development skill, not an AI Mind product runtime Skill.
---

# Spec Kit Analyze

## Purpose

Analyze whether an AI Mind Level C / Level D spec set is internally consistent and ready for implementation.

Use this skill when the user asks for `$speckit-analyze`, `/speckit.analyze`, Spec Kit analyze, or when a complete spec set needs a final pre-implementation review.

## Required Inputs

- Target spec directory, usually `specs/<version-topic>/`
- `spec.md`
- `plan.md`
- `tasks.md`
- `acceptance.md`
- `decisions.md`

If any required file is missing, report `BLOCKED` and name the missing files.

## Read Order

1. `.specify/memory/constitution.md`
2. Target `spec.md`
3. Target `plan.md`
4. Target `tasks.md`
5. Target `acceptance.md`
6. Target `decisions.md`
7. Relevant ADR and architecture docs

Do not use public docs or `private-folder/` to override the formal spec set.

## Analyze Checks

Check:

- tasks implement only the spec goals
- tasks do not implement non-goals early
- plan architecture matches acceptance criteria
- decisions explain major tradeoffs
- ADR is present for Level D changes
- architecture docs are updated when boundaries change
- verification commands match the blast radius
- fallback and human review steps are explicit
- there is no contradiction between CLI, skills, and manual-equivalent paths

## Output

Return:

- `Analyze Status`: `READY`, `READY_WITH_NOTES`, `NEEDS_CHANGES`, or `BLOCKED`
- `Blocking Issues`
- `Consistency Notes`
- `Spec Drift Risks`
- `Implementation Readiness`
- `Recommended First Task`

Do not implement code. Do not mark a spec ready when required files are missing.
