# AGENTS

## 项目定位

`AI Mind` 是一个按版本持续演进的 AI Native 工程项目。

它不是一次性做完的产品，而是一套逐步生长的 Runtime Skeleton。

建议始终按这条主线理解项目演进：

1. 本地聊天闭环
2. 结构化流式协议
3. Tool Calling
4. Multi-Tool Runtime
5. Skill Runtime
6. MCP 能力接入
7. Agent Runtime
8. 持久化与数据层
9. 更完整的生产化能力

## 事实来源优先级

涉及版本实现、架构边界或阶段验收时，按下面顺序判断事实：

1. 用户明确指定的版本、Step、文件或验收要求
2. 对应版本的 `private-folder/tasklists/`
3. 对应版本的 `private-folder/plans/`
4. 当前代码、测试与运行脚本
5. `private-folder/runtime/`、`private-folder/releases/`、`private-folder/architecture/`
6. `README.md` 与 `docs/`

说明：

- `docs/` 是公开展示文档，不是默认开发事实源。
- `private-folder/plans/archive/` 默认视为历史材料，除非任务明确要求回看演进过程。
- `project-agent-config.yaml` 的 `current_version` 表示最近收口版本，不等于当前一定正在开发的版本。
- tasklist 的 `[x]` 是开发记录，不单独构成完成证据；仍要看实现、测试和实际 diff。

## 开始大改前先读什么

如果任务涉及版本规划、架构调整、运行时改动或能力扩展，先读：

- `README.md`
- 对应版本的 `private-folder/plans/` 和 `private-folder/tasklists/`
- 如果改动涉及运行时，读 `private-folder/runtime/`
- 如果是已完成版本的延续工作，读 `private-folder/releases/`
- 如果是跨版本长期结构问题，读 `private-folder/architecture/`

原则：

- 先对齐本版目标和非目标，再改代码。
- 不要跳过方案背景直接动主运行时。

## 全局分层与边界

新增能力时，优先判断它属于 Tool、Skill、MCP、Agent 还是数据层。

核心约束：

- Tool 不要偷偷长成 Skill。
- Skill 不要偷偷长成 Agent。
- MCP 不要直接污染主 Runtime。
- 数据层不要直接写进聊天主链核心逻辑。

详细分层说明见 `.agents/rules/architecture/layering.md`。

## 目录分流

根规则只负责全局约束和任务分流。进入下面目录时，继续遵循该目录下的 `AGENTS.md`：

- `apps/webapp/`：前端、API route、Provider Runtime、模型选择、流式展示。
- `packages/stream-core/`：流式协议、错误码、构建与兼容性。
- `private-folder/`：plan、tasklist、runtime note、release note、版本资产收口。
- `private-folder/study/`：面试材料与答题卡约束。
- `docs/`：公开文档同步与公开化清理。

专项长文规则统一放在 `.agents/rules/`，由各层 `AGENTS.md` 引用。

## 版本工作与文档资产

版本级任务按下面流程推进：

1. 阅读对应版本的 plan 和 tasklist，确认目标、非目标、当前 Step 与验收边界。
2. 只实现当前 Step 所需的最小改动，并验证普通问答、状态洁净及相关旧链路不退化。
3. 改动影响版本定位、能力边界或对外理解时，同步对应版本资产。
4. 版本功能和内部资产收口后，检查根 `README.md` 是否仍与真实实现一致。
5. 正式版本收口时同步 package version 与 `project-agent-config.yaml` 的 `current_version`。

不要把历史 fixture、mock 数据或旧版本文档中的版本号批量改成当前版本。详细规则见 `private-folder/AGENTS.md` 和 `.agents/rules/version/artifacts.md`。

## 代码修改

- 优先遵循现有项目的结构、命名和风格，不随意引入新模式。
- 优先选择可读性好的实现，而不是炫技式写法。
- 优先保证主流程可读，不因“方便测试”或“未来可能复用”提前拆出 helper / mapper / util。
- 一两行、只调用一次的取值、改名或对象映射优先就近内联。
- 提取函数应至少满足一项：存在真实复用、承载明确业务规则或复杂分支、隔离副作用，或位于 API DTO / 协议等明确模块边界。
- 类型守卫、安全校验、复杂策略和边界适配可保留独立函数；避免无收益的 helper 转发链。
- 同组映射逻辑保持一致，避免一部分内联、一部分抽函数。
- 测试优先覆盖公开入口、核心行为和模块边界，不为测试私有简单逻辑改变生产结构。
- 交付前检查新增的 `toXxx`、`resolveXxx`、`buildXxx` 是否具有业务语义、边界价值、类型收窄或真实复用；否则优先内联。
- 注释默认使用中文，简洁解释决策、边界和原因，不复述代码行为。
- 除非任务需要，不修改无关文件。
- 默认保持向后兼容；如果当前版本 plan 明确允许破坏性变更，以 plan 为准，并同步更新调用方、测试与文档。

## TypeScript 类型组织

- 只在当前文件使用的类型，直接放在当前文件，不提前抽离。
- 属于模块内部实现的类型，放在该模块目录内；同一模块内部优先使用相对路径导入。
- 属于模块对外契约的类型，由产生它的模块所有，并通过公开入口导出。
- 跨模块引用类型时，优先从模块公开入口导入，避免深层依赖内部实现。
- 如果运行时校验 schema 是事实来源，应从 schema 推导类型，避免手写两份重复结构。
- Tool、API、MCP、Agent、Runtime 的输入输出类型，归产生它的模块所有，不反向放到调用方或全局公共目录。
- 除非任务明确要求，不为了整理类型做大规模重组；优先做小范围、局部、可验证的调整。

## Step 交付前自审

版本级 Step 或较大代码改动完成前，至少检查：

- 是否存在无复用价值的一句话函数或过度抽象。
- 对本次新增的 helper / mapper / util，是否真能说清楚业务复杂度、边界收益或测试价值，而不是只为了形式感。
- 是否存在和本 Step 无关的文件修改。
- 是否存在 import 顺序、格式化或 lint 可自动修复问题。
- 是否仍符合本 Step 的最小实现范围，没有提前实现后续 Step。

## 需要避免的反模式

- 还没稳定 Tool / Skill，就急着把一切都做成 Agent。
- 主运行时持续感知每个具体 Tool / Skill / MCP 细节。
- 把数据库接入直接写成聊天主链的一部分。
- 一版里同时推进过多抽象层。
- 版本方案、实现、release、博客互相脱节。
- 版本完成后只留下代码，没有留下解释材料。

## 一句话工作准则

每个版本都要做到：

- 足够小，能讲清楚
- 足够稳，能落下来
- 足够清晰，能继续长
