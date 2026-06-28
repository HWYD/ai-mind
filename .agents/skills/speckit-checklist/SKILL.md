---
name: speckit-checklist
description: Use for AI Mind Level C or Level D changes after spec.md and acceptance.md drafts exist and before tasks.md is finalized. Builds a focused quality checklist for completeness, testability, non-goal protection, compatibility, security, and human review. This is a Codex development skill, not an AI Mind product runtime Skill.
---

# Spec Kit Checklist

## Purpose

Build a focused quality checklist for an AI Mind Level C / Level D spec.

Use this skill when the user asks for `$speckit-checklist`, `/speckit.checklist`, Spec Kit checklist, or when a complex spec needs quality review before task breakdown.

## Required Inputs

- Target spec directory, usually `specs/<version-topic>/`
- `spec.md`
- `acceptance.md`
- `plan.md` if available

If acceptance criteria are missing, state that checklist quality is incomplete.

## Read Order

1. `.specify/memory/constitution.md`
2. Target `spec.md`
3. Target `acceptance.md`
4. Target `plan.md` if available
5. Relevant ADR and architecture docs

Do not use `private-folder/` as the default source.

## Checklist Areas

Check:

- Goals are specific and bounded
- Non-goals are explicit and preserved
- User-visible behavior is testable
- System behavior is testable
- API / stream / DB / GraphState / deployment impact is stated
- Public DTO and sensitive data boundaries are stated
- Backward compatibility is addressed
- Required targeted tests are named
- Human review points are clear
- Fallback behavior is clear when tooling or environment is unavailable

## Output

Return:

- `Checklist Status`: `PASS`, `PASS_WITH_NOTES`, or `NEEDS_CHANGES`
- `Required Fixes`
- `Recommended Improvements`
- `Acceptance Gaps`
- `Verification Gaps`

Do not implement code. Do not create broad generic checklists unrelated to the current spec.
