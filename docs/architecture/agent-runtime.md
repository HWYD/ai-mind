# 受控 Agent Runtime

## Summary

AI Mind 的 Agent Runtime 以“受控单 Agent”为起点。

当前 Agent 不是通用智能体，也不是让模型自由规划再执行的开放式 Agent。它是 Runtime 中一条明确触发、明确约束、明确停止的执行路径。

`v0.1.0` 的第一个 Agent 是 `Version Plan to Tasklist Agent`，用于把用户显式引用的版本方案转换成 tasklist 草稿。

## Agent 的边界

当前 Agent 必须满足明确入口：

```text
/tasklist + @docs://versions/*.md
```

这意味着：

- 用户必须显式选择任务意图。
- 用户必须显式引用版本方案。
- Agent 不自动扫描 `docs/versions/`。
- Agent 不自动发现最新版本方案。
- Agent 不读取历史 tasklist。
- Agent 不写入 docs 文件。

## Runtime-controlled Path

Agent 的主路径由 Runtime 固定：

```text
read_resource
  -> plan_extract
  -> draft_tasklist v1
  -> validate_tasklist_structure
  -> optional revise_tasklist v2
  -> validate_tasklist_structure
  -> final_answer
```

模型只在受控生成节点产出草稿或修正文稿。

Runtime 负责：

- 判断是否进入 Agent。
- 校验资源边界。
- 控制状态转移。
- 限制最大步数和最大修正次数。
- 执行结构质量门。
- 输出最终回答。

## Agent State

`AgentState` 只保存本轮执行状态。

当前保存的信息包括：

- 显式引用的 version plan。
- `planExtract`。
- `tasklistDraft v1`。
- `tasklistDraft v2`。
- 结构校验结果。
- 自动修正次数。

当前不做：

- 持久化 AgentState。
- Agent Trace 数据库。
- 跨轮记忆。
- 自动写文件。

## Tool Boundary

Agent 可以使用 Tool，但 Tool 暴露范围必须受控。

`validate_tasklist_structure` 虽然注册在 Tool Registry 中，但它默认不进入普通 Skill 的模型可见工具集合。

当前只在 Tasklist Agent scope 中允许调用。

这样可以避免“注册了一个工具，就在所有聊天场景里暴露给模型”的问题。

## Resource Boundary

当前 Agent 只把用户显式引用的 `docs://versions/*.md` 作为必读事实来源。

可选上下文读取也受限制，不等同于开放文件访问。

本地 docs resource 仍然遵守 `docs://...` 边界，MCP 或 Agent 都不能绕过这一层去读取任意源码或配置文件。

## Agent Trace

Agent 执行过程通过流式 step 事件展示：

- `agent-step-start`
- `agent-step-end`

前端通过 `AgentTracePanel` 聚合展示同一次 Agent run 的多个 step。

它的目标不是完整调试台，而是让用户和开发者知道：

- Agent 做到了哪一步。
- 哪一步读了资源。
- 哪一步调用了工具。
- 是否发生了修正。
- 最终是否输出结果。

## Design Principle

AI Mind 的 Agent 演进遵循一个原则：

> 先让 Agent 在一个明确场景里可触发、可约束、可观察、可停止，再逐步讨论更开放的规划和执行能力。

因此，当前 Agent Runtime 更强调工程边界，而不是一开始追求通用自动化。
