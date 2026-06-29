# Data Model 035：Agent Demo Workspace Resource Boundary

状态：已收口
版本：v0.3.5
日期：2026-06-29

本版本不新增数据库实体，不修改 Prisma schema。

这里的 data model 只描述静态 demo corpus、resource URI 和非持久化 DTO。

## DemoManifest

表示 `examples/agent-demo/demo-manifest.json`。

字段：

- `resourceRoot: "examples/agent-demo"`：demo resource root。
- `publicSchemes: ["@demo://"]`：公开 demo 支持的 scheme。
- `versionPlans: string[]`：manifest 暴露给 picker 和测试的 demo version plan 相对路径。
- `scenarios: Array<{ id: string; entry: string }>`：后续 Delivery Chain demo 的 scenario entry。

验证规则：

- `resourceRoot` 必须等于 `examples/agent-demo`。
- `publicSchemes` 只能包含 `@demo://`。
- `versionPlans` 只能列出 `version-plans/*.md`。
- `versionPlans` 不得列出 v0.3.5、v0.3.6 或 future version。
- 所有 manifest path 必须在 demo root 下存在。

## DemoResourceUri

表示用户或 picker 可引用的 demo resource URI。

格式：

```text
@demo://<relative-path>
```

允许形态：

- `@demo://version-plans/*.md`
- `@demo://scenarios/*/requirement.md`
- `@demo://scenarios/*/context.md`
- `@demo://scenarios/*/plan.sample.md`
- `@demo://scenarios/*/tasks.sample.md`
- `@demo://scenarios/*/review.expected.md`
- `@demo://rubrics/*.md`
- `@demo://governance/*.md`

验证规则：

- 必须以 `@demo://` 开头。
- relative path 非空。
- relative path 不得是绝对路径。
- relative path 不得包含 `..` segment。
- relative path 不得包含反斜杠、NUL、冒号。
- normalize 后不得越过 demo root。
- 对应文件必须是普通文件，不得是目录或 symlink。

## DemoVersionResource

表示 Tasklist Agent public demo 可读取的 version plan 输入。

字段：

- `uri: DemoResourceUri`
- `resourceName: string`
- `content: string`
- `contentPreview: string`
- `sizeBytes: number`
- `truncated: boolean`

验证规则：

- `uri` 必须匹配 `@demo://version-plans/[^/\\]+.md`。
- 文件扩展名必须是 `.md`。
- 单文件大小不得超过 128 KiB。
- 读取结果不得包含真实绝对路径。

## DemoCatalogItem

表示 `@` picker 展示项。

字段：

- `id: string`
- `type: "resource"`
- `label: string`
- `uri: DemoResourceUri`
- `source: "local"`：沿用当前 composer reference 的非远程 source 语义，避免为了展示标签改 DTO。
- `displaySourceLabel: "Demo"`：UI 展示标签，可由 menu 根据 `@demo://` URI 派生，不要求进入提交 payload。
- `description: string`
- `version?: string`

验证规则：

- 只从 `DemoManifest.versionPlans` 或 demo version plan 受控列表生成。
- 不展示 `docs://`、`@docs://`、`project://latest-context` 或真实 docs catalog。
- label 使用文件名或短标题，不包含真实路径。
- 不为了显示 “Demo” 标签修改 frontend reducer 数据结构。

## TasklistAgentVersionPlanReference

表示 Tasklist Agent 从 composer references 中提取的版本方案引用。

字段：

- `id: string`
- `type: "resource"`
- `label: string`
- `uri: "@demo://version-plans/*.md"`
- `source: "local"`，除非当前 composer DTO 已经支持更精确的 demo source。

验证规则：

- command 必须是 `/tasklist`。
- 必须存在 exactly one 可用 demo version reference。
- `@docs://` / `docs://` 不得被接受为 ready invocation。

## State Transitions

本版本不新增 runtime state。

URI 迁移后的 Tasklist Agent 主链路保持：

```text
composer reference
  -> invocation ready
  -> read version plan
  -> plan readiness
  -> planning decision
  -> HITL / draft / validation / final
```

仅 `composer reference.uri` 从旧 `docs://versions/*.md` 迁移为 `@demo://version-plans/*.md`。
