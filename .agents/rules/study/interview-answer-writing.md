# AI Mind 面试题整理规则

这份规则用于 `private-folder/study/` 下的面试题、参考答案、复习材料整理。

通用答题结构遵循 Codex Skill：`interview-card`。

## 默认处理范围

- 默认只更新 `study-2026-04-26-ai-mind-interview-answer-key.md`。
- 不默认修改 `study-2026-04-26-ai-mind-interview-question-bank.md`，除非用户明确要求新增题目、调整题目或同步题库结构。
- 如果新增新版本题目，先基于最新 specs、ADR、architecture docs、release、README、docs 和真实代码实现判断；只有用户明确要求回看草稿时才参考 `private-folder/`。

## 答案结构

标题本身就是题目，不重复写 `题目：`。

每道已有答案默认整理为：

```text
一句话结论：
关键词：
项目例子：
常见追问 / 易错点：
参考展开：
```

- `一句话结论`：用于面试开头先稳住方向。
- `关键词`：用于理解记忆和快速召回。
- `项目例子`：必须来自 AI Mind 的真实方案、代码、README、release、docs 或博客材料。
- `常见追问 / 易错点`：用于防止讲偏、夸大或混淆边界。
- `参考展开`：保留原长答案或完整表达，用于 1-2 分钟展开。

## AI Mind 项目口径

- 默认按中大厂真实技术面试口径整理，不写偏门题，不炫技。
- 多用“我 / 我们”的真实项目复盘口吻。
- 面试答案要能体现版本演进、工程取舍、边界控制和后续风险。
- 不夸大未完成能力，例如完整 Agent、workflow、生产级多 server、OAuth、数据库、RAG、完整商业化平台。
- 当前重点关注：Runtime Boundary、Stream Core、Tool / Skill / MCP、Capability Model、Composer V1、Capability-driven Tool Runtime、Remote MCP Tool 标准化。

## 快捷指令约定

- `/面试答题卡`：把已有答案整理成答题卡结构。
- `/面试答案润色`：不改变结构，只优化表达。
- `/面试追问`：强化常见追问和易错点。
- `/面试速记`：提炼一句话结论、关键词和项目例子。
