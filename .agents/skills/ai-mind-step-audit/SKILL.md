---
name: ai-mind-step-audit
description: 当 AI Mind 的某个 tasklist step 已经实现完成、需要进入下一 Step 前做阶段性工程审计时使用；如果用户没有指定 Step，默认尝试审计内部 tasklist 中最新已完成的 Step。该 Skill 会对照 private-folder/tasklists 中的 Step 目标和 private-folder/plans 中的版本边界，检查实现质量、范围控制、回归风险、Agent/Resource/Tool/Stream 约束、测试验证是否充分，并输出人工 Review 路线、关键代码链路讲解和是否可以进入下一 Step 的判断。
---

# AI Mind Step Audit Skill

## Skill 目标

使用本 Skill 审计 AI Mind 当前 tasklist step 的实现质量，辅助判断是否可以进入下一 Step。固定覆盖四类职责：

1. Step 实现质量 Review
2. 人工 Review 路线建议
3. 关键代码讲解
4. 是否可以进入下一 Step 的判断

重点判断：

- 是否符合当前 Step 目标
- 是否存在未完成项
- 是否实现了 Step 之外的内容
- 是否违反当前版本 Non-goals
- 是否破坏已有链路
- 是否存在 Agent / Resource / Tool / Stream / UI 风险
- 是否完成必要测试和验证
- 人工应该按什么顺序查看关键代码文件
- 本 Step 的核心实现链路是什么
- 是否可以进入下一 Step

## Skill 不做什么

- 不直接继续实现下一 Step。
- 不自动修改代码，除非用户明确要求。
- 不扩大需求范围。
- 不替代人工最终验收。
- 不扫描无关目录做泛泛分析。
- 不根据猜测补项目背景。
- 不把 Codex Skill 和 AI Mind 产品运行时里的 Skill 混为一谈。
- 不默认以根目录 `docs/` 公开文档作为 Review 事实来源。
- 不逐行讲解所有代码，只讲与当前 Step 强相关的关键实现链路。
- 不把受控 Agent 扩大成通用 Agent，除非当前版本方案明确允许。

## 必需输入

尽量要求调用者或当前 Codex 上下文提供：

- 当前版本号
- 当前 tasklist Step 原文
- 本 Step 的目标和完成标准
- 本轮改动摘要
- 修改文件列表
- 关键 diff 或相关代码
- 已执行命令和结果
- `private-folder/plans/` 当前版本方案中与本 Step 相关的约束
- `private-folder/tasklists/` 当前版本 tasklist 中对应 Step
- 当前版本 Non-goals
- 希望重点 review 的风险点

如果缺少当前 Step 目标，不要泛泛 review；先提示需要补充 Step 上下文。

如果缺少测试结果，Review 中必须标记“验证不足”。

如果无法找到 `private-folder` 中的当前版本 plan / tasklist，必须明确说明“缺少内部开发依据”，不要直接用公开 `docs/` 替代。

## 默认 Step 定位规则

如果用户没有明确指定某个 Step，默认尝试定位“最新已完成 Step”：

1. 优先使用用户明确提供的版本号，在 `private-folder/tasklists/` 中读取匹配当前版本的 tasklist。
2. 如果用户没有提供版本号，可读取 `private-folder/tasklists/` 下非 `archive` 的当前最新版本 tasklist，并在 Audit 中说明这是推断依据。
3. 在目标 tasklist 中选择序号最大的已完成 Step。已完成 Step 以该 Step 范围内 checklist 均为 `[x]`，或该 Step 的“结束后暂停 / review 确认”项已标记 `[x]` 为主要信号。
4. 如果最新已完成 Step 与本轮 diff / 用户描述明显不一致，必须标记“Step 上下文存疑”，不要强行给出 PASS。
5. 如果无法唯一定位当前版本 tasklist 或最新已完成 Step，必须先说明“缺少 Step 上下文”，并要求用户补充版本号或 Step 原文。

这个默认规则只用于 Step Audit 的上下文定位，不代表可以自动推进下一 Step，也不代表可以用公开 `docs/` 替代内部 tasklist。

## 事实源优先级

按以下优先级读取和引用依据：

- P0：用户本次明确提供的当前 Step、改动摘要、diff、测试结果
- P1：`private-folder/tasklists/` 当前版本 tasklist
- P2：`private-folder/plans/` 当前版本方案
- P3：`private-folder/releases/` 当前版本 release note
- P4：`private-folder/runtime/` 当前版本 runtime note
- P5：`private-folder/test/` 当前版本测试用例、smoke case 或验证资料
- P6：`private-folder/architecture/` 与当前 Step 相关的内部架构资料
- P7：`AGENTS.md`、`README.md`、`package.json`、`pnpm-workspace.yaml`、`tsconfig.json`、`eslint.config.js` 等项目基础信息
- P8：根目录 `docs/` 公开文档，仅作为补充理解，不作为默认开发事实源

如果 P1 / P2 与公开 `docs/` 不一致，以 P1 / P2 为准。

不要泛化扫描 `private-folder/plans/` 或 `private-folder/tasklists/` 来替代用户指定版本；只有在用户已给出版本号、用户未指定 Step 且需要按“最新已完成 Step”默认规则定位、或当前 Step 明确要求时，才读取匹配版本的内部资料。不能定位时先标记依据缺失或请用户补充。

不要默认读取 `private-folder/blogs`、`private-folder/draft`、`private-folder/study`、`private-folder/assets`，除非当前 Step 明确相关。

不要默认读取根目录 `.tmp-*.log`；只有用户明确要求分析运行日志或失败日志时才读取。

不要将 `node_modules`、`.pnpm-store`、`.next`、构建产物、缓存目录作为 Review 事实源。

## 审计流程

1. 确认当前版本号、Step 原文、完成标准和用户关注风险点；如果用户没有指定 Step，先按“默认 Step 定位规则”尝试定位最新已完成 Step。
2. 按事实源优先级读取当前版本内部依据，优先对照 tasklist Step 和 plan Non-goals。
3. 对照本轮改动摘要、修改文件列表和关键 diff，判断实现是否匹配 Step。
4. 沿主入口、Runtime / 状态流转、Tool / Resource / Stream / UI、测试验证的顺序抽取 5 到 8 个关键文件，形成人工 Review 路线。
5. 讲清本 Step 最关键的 3 到 5 个文件 / 模块的实现链路、数据流、边界和风险。
6. 根据测试结果、回归风险和范围边界给出状态：`PASS`、`PASS_WITH_NOTES`、`NEEDS_CHANGES` 或 `BLOCKED`。
7. 必须使用 `references/audit-output-template.md` 的固定模板输出 Audit。

## Audit 维度

### 1. Step 目标匹配度

检查：

- 当前 Step 要求是否完成。
- 是否只完成了一部分。
- 是否遗漏关键接入点、UI 展示、状态处理、类型定义、测试或文档。

### 2. 人工 Review 路线

必须输出人工建议查看的代码文件 / 模块顺序。

要求：

- 按人工理解和验收的合理顺序排列。
- 优先从 Step 目标和主入口开始。
- 再看 Runtime / 状态流转。
- 再看 Tool / Resource / Stream / UI。
- 最后看测试与验证。
- 每个文件都要先用大白话说明“这个文件主要做了什么”，讲清它实现了什么功能、承担了什么事情、在本 Step 里负责哪一段链路。
- 每个文件还要说明为什么值得看、重点确认什么、看到什么信号说明可能有风险。
- “主要做了什么”要通俗易懂，避免只写抽象判断词；优先使用“它负责把 A 变成 B”“它在这里决定能不能继续”“它把后端结果整理成前端能展示的 step”这类表达。
- 格式硬约束：不要把人工 Review 路线写成单行列表。每个文件 / 模块必须展开为 4 个子项：`主要做了什么`、`为什么要看`、`重点确认`、`风险信号`。如果输出中缺少 `主要做了什么`，必须重写“人工 Review 路线”这一节。
- 示例：
    - `主要做了什么：它负责把模型给出的 planning action 解析成 Runtime 能识别的 5 类安全动作，并把非法 JSON / 越界 resourceUri 拦在 schema 层。`
    - `为什么要看：这是 Step 2 的核心安全门，后续状态机只能基于这里通过的 action 继续。`
    - `重点确认：5 类 action、白名单资源、reviewItems 数量和文本长度限制是否都在 schema 中表达。`
    - `风险信号：如果这里允许未知 action 或任意 resourceUri，后续 Agent 就可能绕过本版边界。`
- 最多列出 5 到 8 个关键文件 / 模块，不要铺开所有无关文件。

### 3. 关键代码讲解

必须解释本 Step 的核心实现思路、功能、链路和关键代码作用。

重点讲清：

- 入口 / 触发在哪里。
- 数据如何流转。
- Runtime 如何推进状态。
- Tool / Resource / Prompt / Stream 如何接入。
- 前端如何展示或聚合。
- 错误和边界如何处理。
- 测试如何覆盖关键路径。

要求：

- 只讲本 Step 最关键的 3 到 5 个文件 / 模块。
- 不逐行解释无关代码。
- 优先解释实现思路、调用链、状态流、边界控制和风险点。
- 帮助开发者快速理解代码并判断实现是否合理。

### 4. 越界与范围控制

检查：

- 是否实现了当前 Step 之外的功能。
- 是否提前做了后续 Step。
- 是否违反当前版本 Non-goals。
- 是否扩大 Agent、Resource、Tool、Runtime 权限边界。

### 5. 旧链路回归风险

必须关注：

- 普通聊天是否受影响。
- `/summary @docs` 是否受影响。
- 普通 Tool Calling 是否受影响。
- Reader Skill / Utility Skill 是否受影响。
- Resource / Prompt / Tool 卡片展示是否受影响。
- `AgentTracePanel` 是否只影响 Agent 模式。

### 6. 代码质量与架构分层

检查：

- 代码是否放在合理层级。
- 前端展示逻辑是否混入 Runtime 规则。
- Runtime 是否绕过 Tool Runtime。
- Client Component 是否误 import server-only 模块。
- Zod schema / TypeScript 类型是否一致。
- `AgentState` 是否仍为本轮内存态。
- Stream chunk schema 是否兼容旧消息类型。
- 命名、类型、错误处理、边界处理是否合理。

### 7. AI / Agent 专项检查

重点检查：

- 是否把模型输出当成可信事实。
- 是否缺少 Runtime 校验。
- 是否让模型自由选择未授权 action。
- 是否让 Agent-only Tool 默认暴露给普通聊天。
- 是否 prompt 约束不足导致生成越界。
- 是否 `AgentTracePanel` 展示过多 prompt / tool output / `AgentState`。
- 是否放松 Resource Boundary。
- 是否引入 `from_goal`、自动扫描 docs、写入 docs 等未授权能力。
- 是否把 v0.1.x 的受控 Agent 误扩展成通用 Agent。

### 8. 测试与验证

检查：

- 是否运行 `pnpm typecheck`。
- 是否运行相关 runner / tool / UI 测试。
- 是否补充 smoke case。
- 是否需要浏览器手动验证。
- 是否明确说明哪些测试未执行。

## 状态定义

- `PASS`：当前 Step 实现完整，风险可接受，可以进入下一 Step。
- `PASS_WITH_NOTES`：可以进入下一 Step，但存在非阻塞注意事项或建议补充验证。
- `NEEDS_CHANGES`：当前 Step 存在必须修复的问题，需要先修改后再进入下一 Step。
- `BLOCKED`：当前实现存在严重问题、缺少关键信息、违反版本边界或无法判断完成情况，不能继续。

## AI Mind 项目专项规则

- 优先对照 `private-folder/tasklists/` 当前版本 tasklist step 和 `private-folder/plans/` 当前版本方案。
- `private-folder/tasklists/` 和 `private-folder/plans/` 是 Step Audit 的主要开发事实源。
- `private-folder/releases/`、`private-folder/runtime/`、`private-folder/test/`、`private-folder/architecture/` 是当前版本的补充开发依据。
- 根目录 `docs/` 如果是对外公开文档，只能作为补充参考，不能替代 `private-folder/tasklists/` 和 `private-folder/plans/`。
- 必须检查是否违反当前版本 Non-goals。
- 必须关注 Agent Runtime、Resource Boundary、Tool Scope、Stream Core、`AgentTracePanel`。
- 不允许把受控 Agent 扩大成通用 Agent，除非 `private-folder/plans/` 当前版本方案明确允许。
- 不允许引入 `from_goal`，除非 `private-folder/plans/` 当前版本方案明确允许。
- 不允许读取或写入非本 Step 授权的产物文件，除非当前版本明确允许。
- 不允许泛化扫描 `private-folder/plans` 或 `private-folder/tasklists` 来替代用户指定版本；只有在用户未指定 Step 且需要定位最新已完成 Step，或当前 tasklist Step 明确要求时，才允许读取匹配 tasklist。
- Agent-only Tool 不应默认暴露给普通 Skill selector。
- 普通聊天、`/summary`、普通 Tool Calling 不能退化。
- 修改后优先要求 `pnpm typecheck`。
- UI 改动需要说明是否需要浏览器 smoke test。

## 输出要求

使用 `references/audit-output-template.md` 作为固定输出模板。不要删减主标题；没有信息也要填“未提供 / 未执行 / 未发现 / 需要补充”，避免含混带过。

结论必须先给状态和一句话结论，再展开依据。状态只能是 `PASS`、`PASS_WITH_NOTES`、`NEEDS_CHANGES`、`BLOCKED` 之一。
