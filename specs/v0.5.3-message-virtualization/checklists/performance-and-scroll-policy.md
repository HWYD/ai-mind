# Requirements Quality Checklist: Performance and Scroll Policy

**Purpose**: Validate that performance, dynamic-height and scroll-ownership requirements are complete, measurable and reviewable before implementation
**Created**: 2026-08-27
**Feature**: [spec.md](../spec.md)
**Audience**: Author and reviewer
**Depth**: Standard

## Scope and Dependency Boundary

- [x] CHK001 Is the free-versus-commercial dependency boundary explicit and unambiguous? [Plan §Technical Context, Contract §Dependency Contract]
- [x] CHK002 Is the rule that all non-empty lists use one path specified without an unresolved threshold? [Spec FR-531, Decisions D004]
- [x] CHK003 Are pagination, server, protocol, database and persistence exclusions stated? [Spec Non-goals, Decisions D005]
- [x] CHK004 Are ChatGPT/Doubao observations separated from unverifiable implementation claims? [Research §Evidence Boundary]

## Performance Requirements

- [x] CHK005 Is the target dataset size quantified? [Spec SC-531]
- [x] CHK006 Is the mounted-message limit quantified and tied to a real-browser measurement method? [Spec FR-533, Acceptance A533]
- [x] CHK007 Is fast-scroll quality defined for desktop and mobile with a repeat count and observable failures? [Spec SC-532, Quickstart §Browser acceptance]
- [x] CHK008 Is the existing O(n²) message preprocessing identified with a measurable O(n) target? [Spec FR-551, Plan §Message Preparation]
- [x] CHK009 Are render-buffer values treated as acceptance-calibrated starting points rather than unexplained permanent constants? [Decisions D011]

## Dynamic Height Coverage

- [x] CHK010 Are post-render Markdown, code, image, tool/card and disclosure height changes all included? [Spec Edge Cases, Acceptance A536]
- [x] CHK011 Is Composer height change specified separately for a pinned user and a reader above? [Spec US2 scenario 5]
- [x] CHK012 Is the measured-root margin constraint recorded to prevent total-height drift? [Plan §Virtuoso Configuration, Research §Dynamic Height]
- [x] CHK013 Is there a fallback boundary for resource-specific remeasurement without reintroducing a global manual scroll algorithm? [Plan §Dynamic Height Flow]

## Scroll Ownership and Policy

- [x] CHK014 Is there exactly one owner for physical scroll execution? [Spec FR-537, Contract §Scroll Ownership Invariant]
- [x] CHK015 Are forbidden raw metric writes, document fallback, custom tween and competing auto-follow enumerated? [Contract §Scroll Ownership Invariant]
- [x] CHK016 Are follow, user lock, manual restore and next-turn reset independently specified? [Spec FR-539–FR-542]
- [x] CHK017 Are wheel, touch, keyboard and scrollbar-drag intent paths covered? [Spec Edge Cases, Acceptance A539]
- [x] CHK018 Are smooth versus auto behaviors bounded for near, far, history and layout cases? [Spec FR-544, Decisions D012]
- [x] CHK019 Is stream command coalescing retained without making the library a second policy owner? [Plan §Scroll Policy]

## History and State Continuity

- [x] CHK020 Is first reveal gated by current conversation generation, tail range, current tail Item mount, non-scrolling and two stable frames? [Contract §History Entry Contract]
- [x] CHK021 Are A→B, retry, Item unmount and stale bottom/range/height/scrolling observation cases covered? [Spec Edge Cases, Acceptance A544]
- [x] CHK022 Are meaningful disclosure categories distinguished from transient feedback? [Spec FR-547–FR-549]
- [x] CHK023 Is disclosure identity, conversation isolation and pruning defined? [Data Model §DisclosureState]
- [x] CHK024 Is the native find/offscreen accessibility limitation explicitly accepted while visible semantics remain required? [Spec Non-goals, Decisions D013]

## Compatibility and Evidence

- [x] CHK025 Are v0.5.2 full-height viewport, stable gutter, Composer alignment, safe area and pointer behavior protected? [Spec FR-545–FR-546]
- [x] CHK026 Are empty state, message actions, hydration and read-only/error flows included in regression scope? [Spec FR-550, Acceptance A548]
- [x] CHK027 Does the plan separate jsdom contract evidence from real-browser geometry evidence? [Plan §Verification Strategy]
- [x] CHK028 Does acceptance keep all unimplemented claims Pending and require actual command/browser evidence before release closing? [Acceptance]

## Notes

- 2026-08-27：首轮 requirements-quality review 全部通过；未发现需返回 clarify 的范围或行为歧义。
- 实现阶段若调整 library version、scroll threshold、Footer 算法、buffer 或 disclosure 范围，必须同步更新本 checklist 的引用文档后重新检查。
