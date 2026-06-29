# Contract 035：Demo Resource Boundary

状态：规划中
版本：v0.3.5
日期：2026-06-29

## Demo Resource URI Contract

### Accepted scheme

```text
@demo://
```

### Accepted paths

```text
@demo://version-plans/*.md
@demo://scenarios/*/requirement.md
@demo://scenarios/*/context.md
@demo://scenarios/*/plan.sample.md
@demo://scenarios/*/tasks.sample.md
@demo://scenarios/*/review.expected.md
@demo://rubrics/*.md
@demo://governance/*.md
```

### Forbidden schemes

```text
@docs://
docs://
@specs://
file://
@artifact://
project://
```

`project://latest-context` may remain a separate non-Agent capability if existing runtime still needs it, but it is not a public Agent demo file resource.

## Resolver Behavior

### Input

```ts
{
    uri: string
}
```

### Success output

```ts
{
  content: string
  contentPreview: string
  mimeType?: string
  previewChars: number
  resourceName: string
  serverId: "demo-resource-server"
  sizeBytes: number
  status: "completed"
  truncated: boolean
  uri: string
}
```

### Failure behavior

Resolver failures must fail closed and return a user-facing safe message through existing stream error handling.

Failure messages must not include:

- resolved absolute filesystem path
- project root path
- raw Node error object
- sensitive env values
- source file content

## Catalog Contract

The `@` picker catalog must expose only demo version plan resources.

Expected item shape:

```ts
{
  description: string
  fileName: string
  group: "demo-version"
  label: string
  source: "local"
  uri: "@demo://version-plans/<file>.md"
  version?: string
}
```

The picker must not include:

- `docs://README.md`
- `docs://architecture/*.md`
- `docs://versions/*.md`
- `project://latest-context`
- future version files

The visible source badge should read `Demo` or `示例`, but the submitted composer reference may keep the existing non-remote `source: "local"` value to avoid changing frontend reducer or payload contracts.

## Tasklist Invocation Contract

Ready invocation requires:

```text
composer.command.name === "tasklist"
AND at least one reference matches @demo://version-plans/[^/\\]+.md
```

Missing or invalid invocation:

- returns `missing-version-plan`
- emits boundary text telling the user to select a demo version plan from `@` picker
- does not fallback to ordinary chat-generated tasklist

## Compatibility Contract

The following public contracts must remain unchanged:

- HITL decision schemas.
- `agent-interrupt` stream chunk shape.
- `agent-resume` stream chunk shape.
- artifact chunk shape.
- frontend reducer state shape.
- AgentRun / AgentInterrupt schema.
- PostgresSaver schema.

`versionPlanUri` remains the metadata field name; only its URI value changes to `@demo://version-plans/*.md`.
