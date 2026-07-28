# Governance Requirements Quality Checklist: v0.4.9

**Purpose**: 审阅 v0.4.9 的 Monorepo 边界治理与分层验证需求是否完整、无歧义、可度量且可追溯；不用于验证实现。
**Created**: 2026-07-18
**Feature**: [Monorepo Boundary and CI Validation Governance](../spec.md)
**Audience/Timing**: PR 审阅者；进入任务拆解与实现前
**Depth**: Standard

## Requirement Completeness

- [x] CHK001 - 是否为根治理单元、所有应用和共享包分别定义了唯一 `@ai-mind/*` 身份、私有性与例外条件？[Completeness, Spec §FR-049-001]
- [x] CHK002 - 是否完整列举了允许的依赖方向及每种禁止方向，而不仅列出当前已知的 package-to-app 情况？[Completeness, Spec §FR-049-002]
- [x] CHK003 - 是否明确了“本地 provider 缺失、依赖未声明、身份不一致”三种失败分别属于哪一类边界违规？[Completeness, Spec §FR-049-003]
- [x] CHK004 - 是否定义了未被 workspace 模式纳管的目录、重复身份、循环和未匹配筛选条件的需求处理方式？[Completeness, Spec §FR-049-004, Edge Cases]
- [x] CHK005 - 是否为生产代码与测试代码分别定义了绕过公开依赖边界的禁止范围？[Completeness, Spec §FR-049-005]
- [x] CHK006 - 是否完整定义了稳定、状态集成、外部服务三类测试的归类规则、排他性和默认触发条件？[Completeness, Spec §FR-049-007, §FR-049-010]
- [x] CHK007 - 是否说明了标准根目录入口、单通道入口、单 workspace 诊断入口各自覆盖的范围与关系？[Completeness, Spec §FR-049-006, §FR-049-011]

## Requirement Clarity

- [x] CHK008 - “公开依赖边界”是否明确到可区分 package 根入口、已导出子路径与内部实现路径？[Clarity, Spec §FR-049-005]
- [x] CHK009 - “未声明依赖”是否明确涵盖 manifest 未声明、非本地解析和跨目录直接访问这几种不同情形？[Clarity, Spec §FR-049-003, §FR-049-005]
- [x] CHK010 - “每个测试只属于一个验证通道”是否定义了命名、配置或其他可判定的归属依据，以及发生歧义时的处理规则？[Clarity, Spec §FR-049-007, SC-049-002]
- [x] CHK011 - “可复用结果”是否明确指明哪些通道可以使用缓存、哪些通道不得恢复缓存，以及受哪些输入影响？[Clarity, Spec §FR-049-008, Edge Cases]
- [x] CHK012 - “状态性初始化执行次数为 0”是否明确初始化范围包含服务启动、迁移和 runtime checkpoint setup，并说明适用的失败阶段？[Clarity, Spec §FR-049-009, SC-049-003]
- [x] CHK013 - “显式手动入口”是否明确需要何种人为 opt-in、外部验证未运行的结果语义，以及它与普通测试失败的区别？[Clarity, Spec §FR-049-010, Edge Cases]
- [x] CHK014 - “可定位的失败信息”是否定义必须呈现的 workspace、验证通道、失败步骤和违规原因字段？[Clarity, Spec §FR-049-004, SC-049-005]

## Consistency and Scope Boundaries

- [x] CHK015 - workspace 身份策略是否与当前四个 workspace、根治理单元以及“不可独立发布”的假设一致，没有遗漏 root 或应用？[Consistency, Spec §FR-049-001, Assumptions]
- [x] CHK016 - 依赖方向、源码导入边界与保留 package-level 诊断能力之间是否无冲突？[Consistency, Spec §FR-049-002, §FR-049-005, §FR-049-006]
- [x] CHK017 - 标准根目录验证包含状态集成测试的要求，是否与“稳定验证先于状态初始化”的顺序要求一致且无隐式外部服务依赖？[Consistency, Spec §FR-049-009, §FR-049-011]
- [x] CHK018 - 外部服务仅手动触发的澄清结论，是否与日常根目录、PR 和定时 CI 的排除要求完全一致？[Consistency, Clarifications, Spec §FR-049-010, Non-goals]
- [x] CHK019 - 缓存治理要求是否与“配置、依赖、输入或环境条件变化时不得复用”的边界条件一致？[Consistency, Spec §FR-049-008, Edge Cases]
- [x] CHK020 - 该版本的工具与 CI 变更范围，是否与不升级包管理器/任务运行器、不启用远程缓存和不改变部署的 Non-goals 一致？[Consistency, Spec §FR-049-013, Non-goals]

## Acceptance Criteria Quality

- [x] CHK021 - SC-049-001 中“四类受控违规”是否覆盖 FR-049-003 至 FR-049-005 的所有必须失败情形，或明确哪些情形由其他标准覆盖？[Measurability, Spec §FR-049-003–005, SC-049-001]
- [x] CHK022 - SC-049-002 的“100% 自动化测试”是否有可审计的测试清单或统计口径，足以判定没有遗漏与重复归类？[Measurability, Spec §FR-049-007, SC-049-002]
- [x] CHK023 - SC-049-003 是否定义可观察证据，以客观证明稳定失败时没有状态服务或初始化被调度？[Measurability, Spec §FR-049-009, SC-049-003]
- [x] CHK024 - SC-049-004 是否清楚区分数据库状态集成所需的本地条件与“外部服务凭据”的禁止依赖？[Clarity, Spec §FR-049-010, SC-049-004]
- [x] CHK025 - SC-049-006 的“仅依据文档完成”是否明确所需文档内容与成功判定，避免依赖口头知识？[Measurability, Spec §FR-049-012, SC-049-006]

## Scenario and Edge-case Coverage

- [x] CHK026 - 是否为新增 workspace 使用当前目录模式之外的情况定义了明确的发现或拒绝策略，而非只描述“不得静默遗漏”？[Coverage, Edge Cases]
- [x] CHK027 - 是否为被禁止的依赖或导入在已有缓存可用时定义了优先失败的治理要求？[Coverage, Edge Cases, Spec §FR-049-004]
- [x] CHK028 - 是否规定了状态集成的数据库连接、迁移或初始化失败后不允许跳过、复用旧结果或继续后续状态验证的需求？[Exception Flow, Edge Cases]
- [x] CHK029 - 是否定义了外部验证缺少凭据、配额耗尽或网络不可用时的“未运行”与“失败”区分规则？[Exception Flow, Edge Cases, Spec §FR-049-010]
- [x] CHK030 - 是否明确了未来 package 发布、远程缓存、affected-only 或定时外部验证的变更必须通过独立规格重新评估？[Scope Boundary, Assumptions, Non-goals]

## Dependencies and Assumptions

- [x] CHK031 - 是否明确 v0.4.8 现有 pnpm/Turbo 基线哪些能力是 v0.4.9 的前提、哪些行为允许被收紧？[Assumption, Spec §Assumptions]
- [x] CHK032 - 是否记录了“所有 workspace 暂不独立发布”的有效范围、失效条件及未来重新定义发布策略的入口？[Assumption, Spec §FR-049-001, Assumptions]
- [x] CHK033 - 是否界定了测试分类依赖的外部条件（数据库、真实云模型、第三方凭据）及其不进入普通 PR 门禁的原因？[Dependency, Spec §FR-049-007, §FR-049-010]

## Notes

- 完成审阅后将 `[ ]` 改为 `[x]`，并在条目后记录发现、补充需求或关联决策。
- 本清单检查需求质量；实现完成后的行为审计应使用对应的 tests、acceptance 和 `speckit-analyze` / `speckit-converge` 流程。
