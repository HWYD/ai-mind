# Local Persistence Requirements Checklist: AI Mind v0.4.7 Browser-local Chat Session Persistence

**Purpose**: 以 PR/实现前评审视角，检查 v0.4.7 浏览器本地聊天持久化需求是否完整、清晰、一致且可验收
**Created**: 2026-07-14
**Feature**: [spec.md](../spec.md)

**Note**: 本清单是对“需求文本质量”的检查，不用于判断代码是否已经实现。

## Requirement Completeness

- [x] CHK001 是否明确区分了 Local Conversation Snapshot、Local Conversation Index、Server Conversation Registry 和 Server ThreadState 的职责边界？ [Completeness, Spec FR-047-000A–FR-047-000C]
- [x] CHK002 是否同时定义了普通聊天、tool/resource、workflow、Agent trace、artifact 等主要用户可见内容的恢复范围？ [Completeness, Spec FR-047-007, User Story 2]
- [x] CHK003 是否明确覆盖了刷新、浏览器重启、会话切换、新建 draft、删除问答和重新生成等主要生命周期？ [Completeness, Spec User Stories 1–3, FR-047-004, FR-047-006]
- [x] CHK004 是否定义了本地数据存在、缺失、损坏、不可用、被清除和被服务端 prune 时的不同需求结果？ [Completeness, Spec FR-047-011, FR-047-016–FR-047-025]
- [x] CHK005 是否明确说明了本地快照缺失时 bounded server hydration 的降级展示边界，以及不得将其描述为完整历史？ [Completeness, Spec FR-047-015]
- [x] CHK006 是否定义了服务端会话有效但 ThreadState 没有内容、ThreadState 读取失败和 Registry 不可用这几类不同状态？ [Gap, Contract server-chat-boundary.md]

## Authority and Consistency

- [x] CHK007 是否明确规定本地快照是完整 UI 历史的唯一来源，而服务端 hydration 不得覆盖、补写或删除本地完整历史？ [Clarity, Spec FR-047-014–FR-047-015]
- [x] CHK008 是否明确规定继续发送时使用 Server ThreadState，而不是把本地完整 UI 历史升级为模型上下文？ [Consistency, Spec FR-047-018–FR-047-019A]
- [x] CHK009 是否明确规定服务端 Registry 对 conversation identity、ownership、recent retention 和 interactive validation 的权威性？ [Completeness, Spec FR-047-000B, FR-047-003]
- [x] CHK010 同一 message ID 的本地 UI 快照与服务端 ThreadState 不一致时，展示来源、运行时上下文来源和禁止的合并行为是否没有歧义？ [Clarity, Spec Clarifications, Edge Cases]
- [x] CHK011 是否明确区分了“服务端没有 bounded state”和“服务端 ThreadState 不可用”，避免把服务端故障误判为空历史？ [Gap, Plan Design Decision 5, Contract server-chat-boundary.md]
- [x] CHK012 spec、plan、data-model 和 contracts 是否对“本地完整历史”“bounded hydration”“只读缓存”使用一致的术语？ [Consistency, Spec Key Entities, Plan Design Decisions]

## Stable Snapshot Lifecycle

- [x] CHK013 是否明确规定稳定快照的提交条件，以及 streaming、failed、aborted、pending review 和其他半成品状态不得成为可恢复完成态？ [Completeness, Spec FR-047-006A, FR-047-009–FR-047-010]
- [x] CHK014 “任何稳定 UI 状态变化都更新快照”是否具体覆盖新一轮完成、删除问答和重新生成完成，并且没有遗漏其他已定义的消息树变化？ [Clarity, Spec Clarifications, FR-047-006]
- [x] CHK015 删除问答和重新生成时，旧 assistant 回答、被删除 user turn 与新稳定状态之间的保留/移除规则是否明确？ [Completeness, Spec User Story 2 Scenario 4, Edge Cases]
- [x] CHK016 是否明确规定本地写入失败时保留上一份成功稳定快照，并且不影响当前聊天请求？ [Consistency, Spec FR-047-006A, FR-047-020, SC-047-004]
- [x] CHK017 是否定义了稳定消息的最小身份字段、消息顺序、角色范围、时间字段和可恢复 UI parts 范围？ [Data Completeness, Spec FR-047-007–FR-047-008, data-model.md]
- [x] CHK018 对 `thread-memory-status`、`AgentInterrupt`、streaming artifact、failed message 和其他控制态，是否分别说明了保留、过滤或不承诺恢复的规则？ [Clarity, Spec FR-047-010, data-model.md]

## Failure and Recovery Coverage

- [x] CHK019 本地索引可用但服务端 Registry 暂不可用时，列表、当前展示、发送、新建和切换的状态是否分别定义？ [Completeness, Spec FR-047-021–FR-047-023]
- [x] CHK020 本地快照可用但 ThreadState 不可用时，只读提示、重试入口和交互禁用条件是否明确？ [Completeness, Spec User Story 4, FR-047-021–FR-047-024]
- [x] CHK021 服务端恢复后，是否明确规定从只读缓存回到可交互状态的条件，以及不得静默切换到其他会话？ [Clarity, Spec FR-047-024]
- [x] CHK022 conversation 被服务端判定为无效、越权或 prune 后，本地列表、快照和 selected state 的清理/回退规则是否一致？ [Consistency, Spec FR-047-016–FR-047-017, Edge Cases]
- [x] CHK023 本地 schema 版本不兼容、单条消息损坏和整个本地存储不可读时，需求是否分别定义了局部跳过与整体降级？ [Completeness, Spec FR-047-011, Edge Cases]
- [x] CHK024 是否明确规定浏览器重启、session cookie 变化、站点数据清理和更换浏览器环境之间的恢复差异？ [Clarity, Spec FR-047-005A, User Story 5]

## Concurrency and Data Isolation

- [x] CHK025 是否明确规定不同 `conversationId` 的快照可以独立更新，且一个会话的写入不得覆盖另一个会话的消息或元数据？ [Gap, Plan Design Decision 4, data-model.md]
- [x] CHK026 是否明确规定同一会话并发写入的版本比较、旧版本处理和不做消息级合并的行为？ [Clarity, Spec FR-047-006B, User Story 5 Scenario 4]
- [x] CHK027 共享的最近会话索引、selected conversation 和 draft 状态在多标签页更新时，是否定义了合并、覆盖或最后写入规则？ [Gap, Plan Design Decision 4]
- [x] CHK028 是否明确声明不承诺跨标签页实时同步，同时避免该限制破坏服务端 conversation isolation？ [Consistency, Spec User Story 5 Scenario 3, Assumptions]

## Non-Functional, Security and Privacy

- [x] CHK029 本地持久化失败不影响聊天主链的要求，是否有可客观判断的边界，而不只是使用“安全降级”“正常工作”等模糊表述？ [Measurability, Spec FR-047-020, SC-047-004]
- [x] CHK030 浏览器本地容量超限时，是否明确“完整消息裁剪”而不是按字符串或任意 UI part 截断，并说明重试失败后的行为？ [Clarity, Spec FR-047-011, Edge Cases]
- [x] CHK031 是否明确限制本地数据不得包含 API key、session cookie、raw checkpoint、GraphState、provider config 和 raw runtime error？ [Completeness, Spec FR-047-012, Contract local-chat-store.md]
- [x] CHK032 本地明文存储、站点数据清理和无账号范围之间的隐私承诺是否一致，且没有暗示账号级安全或云端备份？ [Consistency, Spec FR-047-005, Assumptions]
- [x] CHK033 是否定义了本地恢复、只读缓存提示、错误信息和重试入口所需的可访问性与用户可理解性要求？ [Gap, Spec FR-047-023, User Story 4]
- [x] CHK034 是否对本地恢复与写入的性能目标给出了可验收的用户侧标准，或明确说明为何本版本只要求“不阻塞聊天主链”？ [Gap, Plan Technical Context Performance Goals]

## Acceptance Criteria and Traceability

- [x] CHK035 每个核心功能需求是否都能映射到至少一个 User Story、Acceptance Scenario 或 Success Criteria，而不是只存在于技术方案？ [Traceability, Spec FR-047-001–FR-047-030, SC-047-001–SC-047-008]
- [x] CHK036 Success Criteria 是否同时覆盖恢复成功、富 UI 保留、失败降级、越权阻断、范围约束和不引入服务端完整历史，并避免把实现细节当成产品结果？ [Acceptance Criteria Quality, Spec SC-047-001–SC-047-008]

## Notes

- Focus：浏览器本地持久化的需求完整性、权威边界、失败恢复、并发隔离和验收可测性。
- Audience：实现前 PR/设计评审者。
- Depth：Standard；条目检查“需求是否写清楚”，不判断代码是否已经实现。
- 本清单未覆盖后续实现任务拆分、具体测试用例或浏览器兼容矩阵；这些应在 `/speckit-tasks` 和实现阶段继续细化。
