<!--
Sync Impact Report
- Version change: v0.3.3 -> v0.4.0
- Modified principles: none
- Added sections: 12. Complex Work Delegation First; 13. Evidence-Based Decision Revalidation;
  Governance
- Removed sections: none
- Templates reviewed: `.specify/templates/{plan,spec,tasks}-template.md` ✅ no update; the
  official baseline remains unchanged and this project rule is applied through the adapter layer.
- Runtime guidance updated: `AGENTS.md` and `docs/architecture/ai-coding-workflow.md` ✅
- Follow-up TODOs: none
-->

# AI Mind Constitution

状态：Active
版本：v0.4.0
最后更新：2026-09-16

这份 Constitution 是 AI Mind 的长期治理基线，适用于版本规划、Codex 执行、代码 review、release 收口和后续 Agent / Runtime 扩展。

## 1. Controlled Agent First

AI Mind 的 Agent 能力必须优先保持受控边界，再讨论更开放的自动化。

- Tasklist Agent 不得自由扫描目录、自由写文件、自由调用工具或绕过既有入口。
- 新 Agent 必须先明确入口、上下文、工具范围、暂停点、恢复策略、失败收口和 Non-goals。
- 模型选择只允许改变模型来源，不允许改变 Agent 权限边界。

## 2. GraphState Is Runtime Source of Truth

Tasklist Agent 的内部运行态由 GraphState 作为事实源。

- 不得重新引入旧 AgentState adapter、双状态模型或隐式全局运行态。
- Graph node 应直接读取 GraphState 分区，并返回明确的 GraphState patch。
- GraphState 不得保存 Prisma client、pg pool、request、AbortSignal、writer、raw Error、raw checkpoint、API Key、session cookie、AgentRun 数据库整行或 AgentInterrupt 数据库整行。

## 3. Review Node Must Be Side-effect Free

LangGraph interrupt review node 必须可重复执行，并且无副作用。

- review node 只允许构建 JSON-serializable payload、调用 `interrupt(payload)`、解析 resume decision、返回受控 GraphState patch。
- review node 不得调用模型、工具、资源、数据库、writer 或文件系统。
- AgentInterrupt 持久化由 runner / coordinator 在观察到 interrupt 后处理，不由 review node 处理。

## 4. Business State and Checkpoint Must Stay Separate

业务 run 状态和 LangGraph checkpoint 状态必须分离。

- AgentRun / AgentInterrupt 属于业务状态，由 Prisma 业务表管理。
- LangGraph checkpoint 属于 runtime resume 状态，由 PostgresSaver 管理。
- Prisma schema 不管理 checkpoint tables。
- AgentRun 不保存 raw checkpoint。
- PostgresSaver 不承担业务 run 查询。
- Graph node 不直接写 AgentRun / AgentInterrupt。

## 5. Stream Compatibility Is a Hard Constraint

`@ai-mind/stream-core` 是共享 stream protocol 基础设施。

- 新增 chunk 必须保持向后兼容，除非版本方案明确允许破坏性协议变更。
- 修改 stream protocol 必须同步 stream-core schema tests、NDJSON writer tests、webapp reducer tests、UI consumption tests 和 contracts/docs。
- 不得为了调试方便把 raw runtime internals 塞进 stream chunk。

## 6. Public DTO Must Be Strict and Safe

API response、stream chunk、interrupt payload 和 debug summary 必须使用严格 public DTO。

不得输出：

- raw GraphState
- raw checkpoint
- raw provider error
- raw Prisma error
- API Key
- session cookie 原值
- provider config
- internal prompt
- sensitive env

所有 public DTO 必须在生产或消费边界经过 strict schema 校验。

## 7. Minimal Abstraction

AI Mind 优先选择可读、局部、可验证的实现，不为了“看起来工程化”提前抽象。

- 不因为代码看起来能抽函数，就新增 helper / mapper / util / service。
- 只有真实复用、明确业务规则、逻辑复杂、需要隔离副作用或具备独立测试价值时，才提取抽象。
- 一两行、只调用一次的映射逻辑通常应就近内联。
- 每个新增 `toXxx`、`resolveXxx`、`buildXxx` 都必须能说明业务语义、边界价值、类型收窄或真实复用价值。
- 不得为了测试在正式实现中加入 test-only runtime branch、测试专用 provider/store mode、deterministic helper、隐藏开关或只服务测试的回退逻辑。测试替身、fake、mock 和 fixture adapter 必须停留在测试侧或明确的测试装配边界。
- 如果某个新增参数、分支、抽象或配置项的主要价值只是“方便测试”，而不服务真实产品语义、运行时边界、类型收窄或副作用隔离，则该实现不应进入生产代码。

## 8. Tests Before Broad Integration

复杂版本必须先稳定契约，再推进大范围集成。

推荐顺序：

1. Contract / schema tests
2. Runtime / graph tests
3. Persistence integration tests
4. Route / stream tests
5. Frontend reducer / UI tests
6. Typecheck / lint / build
7. Smoke verification

低层契约和 runtime 行为稳定前，不要提前接入大范围前端或部署链路。

## 9. Spec Drift Must Be Blocked

修改以下内容时，必须同步更新 spec / plan / tasks / docs / ADR：

- API contract
- stream protocol
- GraphState
- Prisma schema
- AgentRun state transition
- AgentInterrupt payload
- CheckpointerProvider
- deployment script
- env requirement
- user-visible behavior
- version boundary
- security boundary

如果实现偏离 spec，要么修实现，要么在同一版本范围内同步修 spec 资产。不要留下两套互相竞争的事实。

## 10. Official Spec Kit Skills Are Tooling Entry, Not Source of Truth

AI Mind 可以使用 official Spec Kit full skills 降低复杂版本开发成本，但 `speckit-*` skills 只是开发工具入口，不是项目事实源。

- `.agents/skills/speckit-*` 命名空间保留给 official Spec Kit full skills。
- official skills 必须保持 generated / vendored baseline，不直接写入 AI Mind 私有规则。
- AI Mind 项目约束应沉淀到 constitution、`specs/`、ADR、architecture docs、template overrides 和 AGENTS，而不是魔改 official skills。
- v0.3.2 的 lightweight pilot `speckit-*` skills 不得长期 shadow official skills；有价值规则迁移后应退出 `speckit-*` 命名空间。
- Level C / D 变更默认使用 official full skills 或人工等价流程；Level A / B 不强制完整 tooling。
- `speckit-converge` 进入 Level C / D 收口检查；`speckit-taskstoissues` 暂时为 optional。
- CLI、skills、slash command 或网络不可用时，必须保留人工等价 clarify / checklist / analyze / converge。

## 11. Spec Kit Language Policy

AI Mind 的 `specs/` 文档可以以中文正文为主，但必须保留 official Spec Kit 的英文骨架和可解析结构。

- 规格文件名保持英文：`spec.md`、`plan.md`、`tasks.md`、`acceptance.md`、`decisions.md`。
- `speckit-*` skill、`$speckit-*`、`/speckit.*`、script 名和 command 名保持英文，不因中文正文改名。
- 核心 section heading 建议保留英文，例如 `Summary`、`Goals`、`Non-goals`、`Functional Requirements`、`Technical Plan`、`Acceptance Criteria`、`Decisions`；正文可以用中文解释。
- `GraphState`、`AgentRun`、`AgentInterrupt`、`PostgresSaver`、`stream-core`、`checkpoint`、`resume`、`interrupt`、`HITL`、`ADR`、`adapter layer`、`converge`、`public DTO`、`schema` 等技术名词保留英文或中英混写。
- 代码标识符必须使用英文；代码注释按现有代码风格处理，不因 specs 中文而强制新增中文注释。
- Codex 读取中文 specs 时，必须保留原文中的英文技术名词、文件路径、命令、类型名、API 名称和 package 名称，并且不得忽略 `Non-goals`、安全边界、兼容性边界和 release closing 检查。
- official generated / vendored baseline 不直接中文化；如确需模板策略，先在 `.specify/templates/overrides/` 说明或新增 override，不直接魔改 core templates。

## 12. Complex Work Delegation First

对于 Level C / D、跨边界改动、存在两个以上可独立验证的工作包，或尚未定位单一根因的问题，进入实施前必须完成可委派性判断。Agent 可用且工作能安全隔离时，优先委派独立调研、诊断、实现或 review。

- 并发修改必须有明确且不重叠的文件或模块归属；强耦合核心由单一 owner 集成，其他 Agent 提供独立证据或 review。
- 每个委派任务必须明确目标、输入、产出、文件归属、验证方式与整合 owner；不得用多个 Agent 在共享核心文件上无序并发写入。
- 因任务强耦合、范围过小或 Agent 不可用而不委派时，必须在当前 task 或交付记录中说明原因。
- 多 Agent 是 AI coding 的实施策略，不等同于新增 AI Mind 产品 Runtime 的多 Agent、子 Agent 或并行执行能力。

目的：在可拆分问题上获得独立视角与更快反馈，同时保持变更归属、集成责任和验证链路清晰。

## 13. Evidence-Based Decision Revalidation

当前代码、测试、spec、plan、decisions、ADR 与 architecture docs 是理解项目现状、既有约束和兼容性的证据，不自动证明其中可变的技术方案仍然最优。

- 当任务要求调研最佳实践或替代方案，或涉及架构、依赖、安全、性能、可靠性等重要技术选择时，必须把现有实现与既有决策作为候选之一，与可行替代方案比较。
- 比较至少覆盖需求匹配、架构边界、安全、兼容性、可运维性、验证成本与迁移风险；保留既有方案也必须写明比较依据。
- 用户明确指定的不可变需求、外部契约、已批准的安全边界与法律合规要求不是可替换候选，只评估其可行性、风险和实现路径。
- 结论必须记录在当前 canonical workspace 的 `research.md`、`decisions.md` 或等价交付记录中；若结论改变既有决策，必须在同一工作区同步更新受影响的规格、任务、ADR、文档与实现，并标记旧决策为 superseded。
- Level A / B 的局部改动不因本原则被强制开展无关调研；仅在存在上述触发条件时执行重评。

目的：把项目历史作为可验证的基线，而不是未经检验的默认答案，防止实现惯性替代工程判断。

## Governance

本 Constitution 是长期工程治理基线；它约束项目规则与质量门，但不替代当前代码、测试和版本资产对现状的事实描述。

- 修订必须记录动机、影响资产、版本和日期；删除或重新定义既有原则使用 MAJOR，新增原则或实质扩展使用 MINOR，澄清或文字修订使用 PATCH。
- Level C / D 的 plan 必须在设计前后执行 Constitution Check；实现与 release closing 必须检查本 Constitution、spec、决策、文档和实际 diff 是否一致。
- 无法使用 CLI、skills 或网络时，仍必须通过人工等价流程完成同等判断，并在交付记录中说明。
