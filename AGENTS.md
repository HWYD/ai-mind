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
2. 当前代码、测试与运行脚本
3. `.specify/memory/constitution.md`
4. 当前 feature / version 对应的 `specs/`
5. `docs/adr/` 与 `docs/architecture/`
6. `README.md`、`docs/versions/`、`docs/releases/`、`docs/tasklists/`
7. `private-folder/` 仅在用户明确要求、或需要回看草稿 / 历史过程 / 个人内部材料时读取

说明：

- `specs/` 是 Level C / Level D 变更的正式 AI coding 工作区，承接 spec / plan / tasks / acceptance / decisions；版本工作区目录优先采用 `v0.4.10-feature-slug` 这类真实 semver 前缀命名，挂靠规格可用 `v0.4.10-1-followup-topic`，规则见 `docs/architecture/spec-directory-naming.md`。
- `docs/adr/` 和 `docs/architecture/` 是长期架构约束区，不只是展示文档。
- `docs/versions/`、`docs/releases/`、`docs/tasklists/` 是公开展示区，不是默认开发任务源。
- `private-folder/` 是草稿、历史、个人内部材料和博客 / 面试素材区，不是默认开发事实源。
- 如果本地维护 `project-agent-config.yaml`，其中的 `current_version` 表示最近收口版本，不等于当前一定正在开发的版本。
- tasklist 的 `[x]` 是开发记录，不单独构成完成证据；仍要看 spec、实现、测试和实际 diff。

## 开始大改前先读什么

如果任务涉及版本规划、架构调整、运行时改动或能力扩展，先读：

- `.specify/memory/constitution.md`
- 当前版本或能力对应的 `specs/`
- `README.md`
- 如果是架构决策或跨边界改动，读 `docs/adr/` 和 `docs/architecture/ai-coding-workflow.md`
- 如果用户明确要求回看草稿、历史过程、博客素材或个人内部材料，再读 `private-folder/`

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
- `specs/`：正式 AI coding 规格工作区，保存复杂版本的 spec / plan / tasks / acceptance / decisions。
- `.specify/`：Spec Kit 风格项目治理记忆，当前保存 constitution。
- `docs/adr/` 与 `docs/architecture/`：长期架构决策和当前架构事实。
- `docs/versions/`、`docs/releases/`、`docs/tasklists/`：公开展示文档。
- `private-folder/`：草稿、历史、个人内部材料、博客素材和面试素材；默认不作为正式开发事实源。
- `private-folder/study/`：面试材料与答题卡约束。
- `docs/`：公开文档同步与公开化清理。

专项长文规则统一放在 `.agents/rules/`，由各层 `AGENTS.md` 引用。

## 版本工作与文档资产

版本级任务按下面流程推进：

1. 阅读 constitution 和对应版本 `specs/`，确认目标、非目标、当前 task 与验收边界。
2. 对 Level C / Level D 变更，默认使用 official Spec Kit full skills 或人工等价流程；Codex skills 可用 `$speckit-*`，支持 slash command 的 agent 可用 `/speckit.*`，如果本地没有对应 tooling，则做人工等价 specify / clarify / plan / checklist / tasks / analyze / converge，并在 PR 或交付说明中记录。
3. 只实现当前 Step 所需的最小改动，并验证普通问答、状态洁净及相关旧链路不退化。
4. 改动影响版本定位、能力边界、协议、数据库、GraphState、API 或对外理解时，同步 specs、ADR、architecture docs 和公开 docs。
5. 版本功能和规格资产收口后，检查根 `README.md` 是否仍与真实实现一致。
6. 正式版本收口时同步 package version；如果本地维护 `project-agent-config.yaml`，同时同步其中的 `current_version`。

说明：

- Level A 不需要执行 Spec Kit command / skill。
- Level B 仅在 mini spec 存在明显歧义时，选择性做 clarify 或人工澄清。
- Level C / D 需要把 full skills 或人工等价流程作为正式检查，但不要把它们扩展成所有小任务必跑的仪式。
- v0.3.3 起 `.agents/skills/speckit-*` 命名空间保留给 official Spec Kit full skills；AI Mind 项目规则通过 constitution、specs、ADR、architecture docs、template overrides 和 AGENTS 适配，不再用本地 lightweight `speckit-*` shadow official skills。
- `speckit-converge` 进入 Level C / D 收口检查；`speckit-taskstoissues` 暂时是 optional，不进入默认主流程。双轨规则见 `docs/architecture/spec-kit-tooling.md`。

不要把历史 fixture、mock 数据或旧版本文档中的版本号批量改成当前版本。详细规则见 `.agents/rules/version/artifacts.md`。

涉及生产部署、GitHub Actions、TCR、Docker Compose、服务器 env、pgvector、数据库 setup、部署脚本或 secrets sync 时，必须遵循 `.agents/rules/version/deployment.md`，并以 `docs/architecture/production-deployment.md` 作为生产部署事实源。

## Spec Kit 文档语言策略

- `specs/` 可以中文正文为主，但必须保持 official Spec Kit 兼容：英文文件名、英文 section 骨架、英文 skill / command / script 名和英文代码标识符。
- 技术名词、路径、命令、类型名、API 名称和 package 名称保持英文或中英混写；读取中文 specs 时不得忽略 `Non-goals`、安全边界、兼容性边界和 release closing 检查。
- 不直接中文化 official generated / vendored baseline；如需模板策略，优先写入 `.specify/templates/overrides/`。

## shadcn/ui 使用规则

- AI Mind 前端 UI 优先复用项目已有组件和已安装的 shadcn/ui 组件。
- 如果 shadcn/ui 组件用法、API、variants 或安装方式不确定，必须通过 shadcn MCP、shadcn CLI、官方文档或现有代码确认，不要凭记忆实现。
- 不要因为单次 UI 需求引入新的 UI 组件库；除非现有组件和 shadcn/ui 明显无法满足需求，并说明原因。
- 新增 UI 需要适配当前模块和相邻页面的既有视觉风格，不要直接照搬 shadcn/ui 默认 demo 效果。

## 代码修改

- 优先遵循现有项目的结构、命名和风格，不随意引入新模式。
- 优先选择可读性好的实现，而不是炫技式写法。
- 优先保证主流程可读，不因“方便测试”或“未来可能复用”提前拆出 helper / mapper / util。
- 一两行、只调用一次的取值、改名或对象映射优先就近内联。
- 提取函数应至少满足一项：存在真实复用、承载明确业务规则或复杂分支、隔离副作用，或位于 API DTO / 协议等明确模块边界。
- 类型守卫、安全校验、复杂策略和边界适配可保留独立函数；避免无收益的 helper 转发链。
- 同组映射逻辑保持一致，避免一部分内联、一部分抽函数。
- 测试优先覆盖公开入口、核心行为和模块边界，不为测试私有简单逻辑改变生产结构。
- 不得为了测试在生产代码中加入仅测试使用的分支、配置、模式、provider/store kind、deterministic helper、隐藏开关或特殊回退链路。测试替身、fake、mock、fixture adapter 应停留在测试侧或明确的测试装配层。
- 如果某段代码新增抽象、参数或分支的主要价值只是“更容易测”，而不服务真实业务语义、运行时边界或副作用隔离，则不应进入正式实现；优先改测试方式，而不是污染生产代码。
- 交付前检查新增的 `toXxx`、`resolveXxx`、`buildXxx` 是否具有业务语义、边界价值、类型收窄或真实复用；否则优先内联。
- 注释默认使用中文，简洁解释决策、边界和原因，不复述代码行为。
- 除非任务需要，不修改无关文件。
- 默认保持向后兼容；如果当前版本 spec 明确允许破坏性变更，以 spec 为准，并同步更新调用方、测试与文档。

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

<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/v0.4.10-resumable-agent-streams/plan.md

<!-- SPECKIT END -->
