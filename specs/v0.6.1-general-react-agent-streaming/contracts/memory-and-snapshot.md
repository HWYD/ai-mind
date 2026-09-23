# Contract: Final Content, Memory, and Snapshot

## Final answer selector

For a General Agent completed assistant message:

```text
select parts where
  type == agent-text
  phase == final_answer
  status == completed
  trim(text) is not empty

require exactly one
```

零个表示消息不具备 completed Agent final answer；多个表示 contract violation。不得 fallback 到 commentary、pending、ordinary `TextPart` 或 Tool output。最终的 Chat Memory/UserMemory 准入还必须额外检查 AgentRun 的 `finalizationMode=normal`。

非 General Agent 继续使用现有普通 TextPart 规则。

## Consumer matrix

| Consumer                         | final_answer                                                     |           commentary |  pending/interrupted |
| -------------------------------- | ---------------------------------------------------------------- | -------------------: | -------------------: |
| Visible final Markdown           | normal/constrained                                               |                   no | pending staging only |
| Copy/action bar                  | normal/constrained                                               |                   no |                   no |
| Feedback payload                 | normal/constrained                                               |                   no |                   no |
| Follow-up suggestions            | normal/constrained                                               |                   no |                   no |
| Chat Memory                      | normal provenance only                                           |                   no |                   no |
| UserMemory                       | normal provenance only                                           |                   no |                   no |
| Next request assistant history   | normal/constrained；constrained 保留正文限制说明                 |                   no |                   no |
| Browser completed Trace snapshot | normal/constrained；constrained 仅保留 completed public-safe row |     yes, public-safe |                   no |
| Server Agent state/checkpoint    | existing internal messages only                                  | not as public Memory |       no new storage |

## Memory eligibility

除了 existing v0.6.0 provenance policy，v0.6.1 还要求：final Part phase/status valid；Run status completed；no contract violation；finalizationMode=normal；stop reason natural completion。constrained finalizer 与 deterministic fallback 均不可写 Chat Memory/UserMemory；不得以现有单一 `memoryWriteEligible` 开关间接放开。未来若要支持 constrained 写入，必须先设计并验证可持久化的 provenance、压缩保留与 UserMemory 提炼排除策略。

## Snapshot rules

- 只投影 completed message + completed AgentRun（含 `finalizationMode`）+ non-empty completed final_answer。
- completed commentary 可保留 text、id、runId、modelTurnId、phase/status；它已是用户实际看见的 public-safe Trace。constrained Run 仅保留 completed rows，不保留 interrupted text。
- Tool/Resource/Prompt 继续使用现有去 raw input/output/error 的 public projection；source URL/title 继续安全规范化。
- pending/interrupted、cancelled/failed Run、UI open state、raw reasoning、raw Tool detail 不保存。constrained Run 恢复为“处理未完成”，有保留 Trace 时默认收起。
- snapshot schema version/fingerprint 升级；旧 TextPart snapshot 保持旧路径读取，不自动推断 phase。
- IndexedDB 不可用仍降级为 server final conversation；不能阻塞聊天或 Memory。

## Replay and completion

resumable stream replay 可以恢复 live pending/commentary，但只有 terminal invariant 完整且 final selector 成功时，消息 status 才能成为 completed 并进入 stable snapshot。`finish` 到达时仍有 pending、final end 缺失或 final 后有 Tool，必须 fail closed。

## Security

commentary 虽可存本地 snapshot，仍必须来自 public text extractor；不得把 provider reasoning field 改名为 commentary。任何未来工具级 summary 若要持久化，必须先新增 strict public DTO、redaction、size limit、replay 和 migration contract，本版没有该能力。
