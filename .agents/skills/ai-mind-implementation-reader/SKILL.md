---
name: ai-mind-implementation-reader
description: Read completed AI Mind version implementation code after a version, Step, or feature has been built. Use for AI Mind only to explain the real code reading order, key files and functions, main execution flow, and plain-language implementation summary based on git diff, changed files, actual source, recent commits, and the version spec when version implementation is involved. Does not do code review, refactoring, tests, blogs, interview prep, spec diff analysis, or architecture review.
---

# AI Mind Implementation Reader

## 定位

只服务于 `AI Mind` 项目内部的“版本实施代码阅读”。当用户想在某个版本、Step 或功能实现完成后快速读懂真实代码如何跑起来时，使用本 Skill。

只解决四件事：

1. 给出版本实施修改代码的阅读顺序。
2. 讲解关键文件 / 函数。
3. 梳理主执行流程。
4. 用大白话解释实现。

## 默认不做

默认不要做以下事情：

- 不做 code review。
- 不提重构建议。
- 不修改代码。
- 不写测试。
- 不写博客。
- 不整理面试话术。
- 不做 Spec / Plan / Tasks 差异分析。
- 不做完整架构评审。
- 不扫描整个仓库。
- 不扩大成通用项目 Skill。

如果用户明确要求 code review、博客、面试话术、重构建议或 Spec 差异分析，说明这已经超出本 Skill 默认范围，并按用户的新任务另行处理。

## 信息来源优先级

真实代码是最高优先级。按以下顺序建立事实：

1. `git diff`
2. changed files
3. 实际源码
4. 当前分支最近提交
5. specs、plans、tasks、docs、version notes

Specs、plans、tasks、docs、version notes 只能作为辅助背景，不能替代真实代码。不要脑补不存在的文件、函数、类型、执行流程或架构决策。

如果任务涉及“版本实现”或“某个 Step 实现”，必须定位并阅读 `specs/<version>/spec.md`。先用它确认该版本的目标、非目标、能力边界和关键术语，再回到真实代码梳理实现主线。

如果已经知道当前版本或 Step，优先补读与之对应的 `specs/<version>/tasks.md`；它只用于帮助判断这次实现大致覆盖了哪一段能力，不替代真实代码阅读。

## 默认执行步骤

当用户没有指定版本范围时，先轻量查看本次实现概况：

```bash
git status --short
git diff --stat
git diff --name-only
git log --oneline -n 5
```

根据变更文件判断本次实现涉及哪些模块。不要默认深读所有文件，只挑出能解释主流程的关键文件。

如果用户指定了版本、Step、commit、分支、PR、文件列表或 diff，以用户指定范围为准；仍然优先回到真实代码确认。

如果确认这是一轮版本实现阅读，默认步骤改为：

1. 先定位版本范围。
2. 先读 `specs/<version>/spec.md`。
3. 再看 `git diff`、changed files、最近提交和实际源码。
4. 最后抽出 5 到 8 个关键文件组织阅读顺序。

## 文件选择规则

只选择对理解主流程有价值的关键文件，不要因为某个文件发生变更就机械列入阅读顺序。

优先选择：

1. 用户入口：页面、命令入口、API route。
2. 后端执行路径：runtime、graph、manager、orchestrator、service。
3. 核心契约：types、schema、runtime artifact、stream chunk、state model。
4. Tool / Agent 实现：tool runtime、sub-agent、controlled loop、agent definition。
5. 前端消费：reducer、renderer、panel、status component。
6. 持久化：Prisma schema、database access、checkpointer、memory state。
7. 测试或文档：只有在它们能帮助理解实现时才阅读。

## 阅读顺序规则

阅读顺序从“入口”到“执行”再到“展示”。优先按 AI Mind 常见链路组织：

```text
用户操作 / 页面 / 命令
  -> API route
  -> runtime / graph / manager / orchestrator
  -> tool / agent / service
  -> type / state / protocol
  -> stream / artifact output
  -> frontend reducer / renderer / panel
  -> persistence if involved
```

每个关键文件都要说明：

1. 为什么它排在这个阅读位置。
2. 它在主流程里负责什么。
3. 阅读时重点看什么。

## 阅读方法

先用轻量命令确认变更面，再沿主链路打开少量关键文件。通常控制在 5 到 8 个关键文件以内；如果实现很小，可以更少。

阅读关键文件时，优先找：

- 对外入口函数、route handler、页面事件、命令处理器。
- Runtime 推进状态的函数。
- Tool / Agent / service 被调用的位置。
- 状态、协议、stream chunk 或 artifact 的类型定义。
- 前端如何消费后端输出并展示。
- 持久化如何读写状态；没有涉及持久化就不要展开。

测试文件只在能帮助理解“这条链路期望怎么跑”时阅读；不要把测试覆盖情况扩展成 review。

## 输出要求

始终使用中文输出。表达要具体、实用、直接，不要写泛泛的框架教程。除非理解当前实现必须用到，否则不要展开讲 React、Next.js、LangGraph、Prisma 等通用概念。

每次使用本 Skill 时，按以下格式输出：

```md
# 实现代码阅读指南：<版本或功能名称>

## 1. 建议阅读顺序

| 顺序 | 文件 | 为什么先读它 | 重点看什么 |
| ---- | ---- | ------------ | ---------- |

只列关键文件，不要列所有变更文件。

## 2. 关键文件 / 函数讲解

针对每个关键文件或函数，说明：

- 位置
- 作用
- 它在主流程中的位置
- 重点阅读点
- 大白话解释

## 3. 主执行流程

用清晰的步骤串起来：

用户操作
↓
前端入口
↓
API route
↓
runtime / graph / manager
↓
核心状态 / 协议
↓
stream / artifact
↓
前端展示 / 持久化

## 4. 大白话解释

讲清楚：

- 这个版本把什么能力串起来了
- 请求 / 数据 / 状态是怎么流动的
- 哪些文件是主线
- 哪些文件只是辅助
- 这次实现最核心的代码理解点是什么

## 5. 未确认点

只有在确实无法从仓库确认时才输出这一节。不要猜。
```

## 质量要求

一次好的输出应该让用户能回答：

1. 这次版本应该先读哪些代码？
2. 每个关键文件为什么重要？
3. 核心函数分别做什么？
4. 用户操作之后，代码执行链路怎么走？
5. 用大白话说，这次实现到底是怎么实现的？

## 强约束

- 保持结果聚焦。
- 不要扩展到 review、重构、博客、面试或架构分析。
- 不要输出无价值的完整文件列表。
- 不要脑补代码里没有的实现。
- 不要过度解释无关框架概念。
- 优先用最少的关键文件讲清楚实现主线。
- 如果实现路径不清楚，明确说明哪里不清楚，以及下一步应该检查哪个文件。
