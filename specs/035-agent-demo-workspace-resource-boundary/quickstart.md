# Quickstart 035：Agent Demo Workspace Resource Boundary

状态：已收口
版本：v0.3.5
日期：2026-06-29

本文件描述实现完成后的最小验证路径。当前版本仍停在实施前。

## Prerequisites

- 本地依赖已安装。
- webapp 测试环境可运行。
- 可选：本地启动 webapp 做浏览器 smoke。

## Scenario 1：demo resolver happy path

输入：

```text
@demo://version-plans/v034-langsmith-observability.md
```

预期：

- resolver 返回 markdown content。
- `uri` 保持 `@demo://version-plans/v034-langsmith-observability.md`。
- 不暴露真实绝对路径。

建议测试：

```powershell
pnpm --dir apps/webapp test tests/lib/ai/runtime/demo-resource-resolver.test.ts
```

## Scenario 2：forbidden schemes fail closed

输入：

```text
@docs://versions/v0.3.4-tasklist-agent-langsmith-observability.md
docs://versions/v0.3.4-tasklist-agent-langsmith-observability.md
file:///tmp/secret.md
@specs://035-agent-demo-workspace-resource-boundary/spec.md
```

预期：

- 全部被拒绝。
- 错误提示指向 `@demo://` 和 `@` picker。
- 不 fallback 到真实 docs。

## Scenario 3：path traversal fail closed

输入：

```text
@demo://version-plans/../governance/engineering-rules.md
@demo://../../apps/webapp/package.json
@demo://version-plans\..\README.md
```

预期：

- 全部被拒绝。
- 不读取 demo root 外文件。

## Scenario 4：Tasklist Agent entry

输入：

```text
/tasklist + @demo://version-plans/v034-langsmith-observability.md
```

预期：

- request 被识别为 tasklist route。
- invocation resolver 返回 ready。
- Tasklist Agent 读取 demo version plan。
- `versionPlanUri` 为 `@demo://version-plans/v034-langsmith-observability.md`。

建议测试：

```powershell
pnpm --dir apps/webapp test tests/lib/ai/model-provider/resolve-route-type.test.ts
pnpm --dir apps/webapp test tests/lib/ai/runtime/chat-orchestrator.test.ts
```

## Scenario 5：old docs entry rejected

输入：

```text
/tasklist + @docs://versions/v0.3.4-tasklist-agent-langsmith-observability.md
```

预期：

- 不进入 Tasklist Agent ready path。
- 返回明确提示：public demo Agent resource 已收口到 `@demo://`。

## Scenario 6：picker and quick access

操作：

- 打开空状态快速访问。
- 选择 Tasklist Agent demo。
- 打开 `@` picker。

预期：

- 快速访问填入 `/tasklist + @demo://version-plans/v034-langsmith-observability.md`。
- `@` picker 只展示 demo 版本方案输入文件。
- 标签显示 “Demo” 或 “示例”。
- 不展示真实 docs。

## Scenario 7：mobile polish

视口：

```text
375 x 812
```

预期：

- textarea 初始高度一行。
- 多行输入自动增高。
- 模型选择器不挤压发送按钮。
- slash/resource popup 标题不超过 14px。
- item padding 比桌面更紧凑。

桌面回归：

```text
1440 x 900
```

预期：

- composer、模型选择器、popup 密度保持现有桌面体验。

## Minimum Command Set

实施完成后的最小命令建议：

```powershell
pnpm --dir apps/webapp test tests/lib/ai/model-provider/resolve-route-type.test.ts
pnpm --dir apps/webapp test tests/lib/ai/runtime/chat-orchestrator.test.ts
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
git diff --check
```

若新增专用 resolver / picker / UI tests，应把对应文件加入 targeted test 命令。
