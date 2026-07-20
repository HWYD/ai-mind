# Feature Specification: Monorepo Boundary and CI Validation Governance

**Feature Branch**: `[049-monorepo-boundary-ci]`  
**Version**: `v0.4.9`  
**Created**: 2026-07-18  
**Status**: Ready for CI verification  
**Input**: User description: "将 Monorepo 边界治理与分层测试、CI 加速作为两个重点优化方向，形成具有高面试价值的正式需求。"

## Clarifications

### Session 2026-07-18

- Q: v0.4.9 是否应在受保护的定时 CI 中运行外部服务验证？ → A: 否；仅保留手动触发的外部服务验证。
- Q: 跨 workspace 直接实现访问是否也约束测试代码？ → A: 是；生产代码和测试代码都不得绕过公开依赖边界。
- Q: workspace 身份应采用何种命名策略？ → A: 根治理单元、应用与共享包均采用唯一的 `@ai-mind/*` 命名空间。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Prevent Invalid Workspace Dependencies (Priority: P1)

维护者新增或调整 workspace 时，希望在进入构建、测试或合并前就得到明确反馈，避免应用互相依赖、共享包反向依赖应用、循环依赖、未声明依赖和身份重复逐步演变成仓库耦合。

**Why this priority**: 依赖边界是 Monorepo 的先决条件；没有可靠边界时，后续并行、缓存和按影响范围执行都不可信。

**Independent Test**: 在隔离的 workspace fixture 中分别构造允许和禁止的依赖关系，验证允许关系可继续执行，禁止关系会在标准验证入口前失败并说明违反的单位与规则。

**Acceptance Scenarios**:

1. **Given** 维护者新增一个应用或共享包，**When** 其声明符合已定义的依赖方向且具有唯一身份，**Then** 标准仓库验证通过，现有诊断入口仍可定位到该 workspace。
2. **Given** 一个应用直接依赖另一个应用、共享包依赖应用、或形成循环，**When** 维护者执行安装或仓库验证，**Then** 操作在后续构建和测试前失败，并说明违反的依赖边。
3. **Given** 生产代码或测试代码通过未声明依赖或跨目录直接访问另一 workspace 的实现，**When** 执行边界验证，**Then** 系统拒绝该访问并提示应使用的公开依赖边界。

---

### User Story 2 - Receive Fast, Trustworthy PR Feedback (Priority: P1)

维护者提交常规变更时，希望先获得不依赖外部状态的快速反馈；需要数据库或真实外部服务的验证仍然被保留，但不会伪装成可复用的确定性结果。

**Why this priority**: 反馈速度影响日常交付，但错误复用外部状态结果会降低 CI 的可信度；两者必须通过不同验证通道同时满足。

**Independent Test**: 为同一组现有测试分别运行稳定验证、状态集成验证和外部服务验证，确认每个测试只属于一个通道，并验证每个通道的触发条件与失败信息。

**Acceptance Scenarios**:

1. **Given** 一个变更只涉及不依赖外部状态的代码，**When** 维护者提交 pull request，**Then** 静态检查和稳定测试在任何数据库初始化之前完成并返回可定位结果。
2. **Given** 一个测试需要数据库或其他可变状态，**When** 运行标准验证，**Then** 必要的状态初始化在该测试通道开始前显式完成，且该测试结果不会被当作可复用结果恢复。
3. **Given** 一个验证需要真实云服务、模型或第三方服务，**When** 维护者执行普通本地命令或 pull request 验证，**Then** 该验证不会自动执行；仅在显式手动验证中执行，且其失败原因与普通测试失败可区分。

---

### User Story 3 - Preserve One Understandable Validation Contract (Priority: P2)

新加入项目的维护者希望从仓库根目录理解“什么会被默认验证、什么必须显式验证、为什么某些步骤不能复用”，而不必依赖个人经验记忆命令顺序。

**Why this priority**: 可解释的工程规则既降低维护成本，也是本项目 Monorepo 设计可被面试清晰讲述的基础。

**Independent Test**: 按仓库文档从干净工作区执行标准验证和各通道诊断命令，确认每个命令的覆盖范围、前置条件和失败归属与文档一致。

**Acceptance Scenarios**:

1. **Given** 维护者需要运行完整的日常验证，**When** 使用根目录标准入口，**Then** 稳定测试与状态集成测试均被覆盖，外部服务验证不被隐式触发。
2. **Given** 维护者需要诊断单一 workspace 或单一验证通道，**When** 使用文档化的诊断入口，**Then** 输出包含 workspace、验证通道和失败步骤。

### Edge Cases

- 新增 workspace 目录不属于当前默认目录模式时，边界验证不得静默遗漏它；必须明确发现或拒绝未纳入治理的 workspace。
- 依赖目标不存在、身份重复、筛选条件未匹配或检测到循环时，验证不得以成功状态结束。
- 数据库初始化失败、迁移失败或连接不可用时，状态集成通道必须停止，不能以旧结果或跳过结果冒充成功。
- 外部服务测试因凭据、配额或网络不可用而无法运行时，结果必须标记为外部验证未运行或失败，不能影响稳定测试的真实性。
- 任何缓存恢复前，配置、依赖、输入文件或影响结果的环境条件变化都不得复用旧结果。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-049-001**: 系统 MUST 为每个 workspace 提供唯一、无歧义的 `@ai-mind/*` 身份；根治理单元命名为 `@ai-mind/workspace`，应用与不可独立发布的共享包 MUST 明确禁止意外发布。
- **FR-049-002**: 系统 MUST 定义并执行 workspace 依赖方向：应用可依赖共享包，共享包可依赖共享包；应用不得依赖应用，共享包不得依赖应用。
- **FR-049-003**: 系统 MUST 要求所有内部依赖显式解析到本地 workspace，并在本地 provider 缺失、依赖未声明或身份不一致时失败。
- **FR-049-004**: 系统 MUST 在标准安装、构建和测试之前检测循环依赖和未纳入治理的 workspace，且给出可定位的失败信息；根目录 `build` 与各个日常 `test` 入口 MUST 在任何 Turbo cache 恢复前执行 workspace boundary 校验。任何使用 pnpm workspace filter 的命令若未匹配 workspace，也 MUST 以非零状态失败并说明筛选条件。
- **FR-049-005**: 系统 MUST 阻止生产代码和测试代码通过跨 workspace 的直接实现访问绕过公开依赖边界。
- **FR-049-006**: 系统 MUST 保留现有 package-level 诊断能力，使维护者能够按 workspace 定位边界、构建、类型检查和测试问题。
- **FR-049-007**: 系统 MUST 将现有自动化测试划分为稳定测试、状态集成测试和外部服务测试三类；每个测试只属于一个验证通道。
- **FR-049-008**: 系统 MUST 仅允许稳定测试产生可复用结果；状态集成测试和外部服务测试不得从可复用结果恢复。
- **FR-049-009**: 系统 MUST 在 pull request 验证中先完成静态检查和稳定测试，再初始化数据库或其他状态性前置条件并执行状态集成测试。
- **FR-049-010**: 系统 MUST 将真实云服务、模型和第三方服务验证保留为显式手动入口，不得由日常根目录验证、pull request 验证或定时持续验证隐式触发；普通入口中的外部验证状态为“未运行”，手动入口缺少 opt-in 或凭据、配额或网络不可用时必须以“外部验证配置失败”或“外部验证失败”区别于稳定/集成测试失败。
- **FR-049-011**: 系统 MUST 提供一个标准根目录验证入口，覆盖日常稳定与状态集成验证；同时提供每个验证通道和 workspace 的诊断入口。
- **FR-049-012**: 系统 MUST 在文档中说明 package graph、允许与禁止的依赖方向、三类验证通道、默认触发条件、缓存边界和故障定位方式。
- **FR-049-013**: 系统 MUST 保持现有聊天、Tool、Skill、MCP、Agent、数据库业务数据、流式协议、公开 API 与生产部署行为不变。

### Key Entities _(include if feature involves data)_

- **Workspace Unit**: 仓库中具有唯一身份、明确职责和允许依赖方向的应用或共享包。
- **Dependency Boundary**: 两个 Workspace Unit 之间允许或禁止的依赖与实现访问关系。
- **Validation Lane**: 按确定性和外部状态需求划分的稳定测试、状态集成测试或外部服务测试。
- **Canonical Validation Entry**: 面向日常开发和持续验证的根目录入口，明确包含哪些验证通道及其顺序。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-049-001**: 100% 已发现的 workspace 具有唯一身份并通过依赖方向校验；四类受控违规（应用依赖应用、共享包依赖应用、循环、未声明/缺失内部依赖）均在后续构建前被拒绝。
- **SC-049-002**: 100% 现有自动化测试被归入且仅归入一个验证通道；稳定测试、状态集成测试和外部服务测试均可独立执行并输出所属通道，且仓库可输出按 workspace、文件和通道划分的完整分类记录。
- **SC-049-003**: 每次 pull request 的静态检查或稳定测试失败时，状态性初始化执行次数为 0；验收证据必须显示 `stateful-integration` 因 `needs: stable-validation` 被跳过，且未产生 PostgreSQL service、migration 或 checkpoint setup 日志。
- **SC-049-004**: 日常根目录验证在不配置外部服务凭据时可完成稳定与状态集成验证；外部服务验证仅在维护者显式手动触发时运行。
- **SC-049-005**: 任一失败结果可在一次运行输出中定位到 workspace、验证通道和失败步骤，且现有 package-level 诊断入口保持可用。
- **SC-049-006**: 完成后，维护者可仅依据仓库文档完成一次边界违规诊断、一次稳定测试运行和一次状态集成测试运行，无需额外口头命令顺序说明。

## Assumptions

- `v0.4.9` 承接 `v0.4.8` 已完成的 pnpm / task graph 基线，聚焦把既有治理规则收口为更完整的边界与验证治理，而不是重复实现基础安装和任务编排能力。
- 根治理单元、Webapp、Project Assistant Service 和现有共享包均可迁移为唯一的 `@ai-mind/*` workspace 身份；该命名是内部工程标识，不改变产品展示名称。
- 本特性继续服务当前单产品、四个 workspace 的仓库形态，同时为后续 workspace 扩展提供规则，而不是提前按大型组织规模拆包。
- 所有应用和共享包当前都不需要独立对外发布；若未来出现真实发布需求，将通过独立规格重新定义版本与发布策略。
- 现有数据库相关测试可被识别为状态集成测试；需要真实云服务、模型或第三方凭据的测试可被识别为外部服务测试。
- 日常验证继续以可复现的本地依赖状态为基础；外部系统可用性不作为普通 pull request 的合并前置条件。
- 外部服务验证在 v0.4.9 中不进入定时 CI，以避免凭据、费用、配额与网络波动成为日常工程验证的隐式依赖。
- 本特性先建立可信的边界与测试分类。跨机器共享缓存、按影响范围缩减验证、发布自动化、Docker 产物优化、包管理器大版本迁移和任务运行器大版本迁移均留待后续独立评估。

## Non-goals

- 不新增或拆分业务 Runtime package，不引入通用 UI、types、utils 或 config 包。
- 不迁移到其他 Monorepo 工具，不因本特性强制升级任务运行器或包管理器大版本。
- 不启用跨机器共享缓存、affected-only pull request 验证、独立包发布、Changesets、镜像瘦身或部署策略改造。
- 不引入定时外部服务验证；若后续需要，必须单独明确凭据管理、预算、失败告警与结果处置策略。
- 不修改数据库 schema、公开 API、stream protocol、Agent 权限、Tool/Skill/MCP 能力边界或用户可见产品功能。
