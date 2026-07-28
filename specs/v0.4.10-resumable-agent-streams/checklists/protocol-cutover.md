# Fixed Envelope Protocol Cutover Checklist

**Purpose**: 检查预发布 raw one-shot 协议收口的需求是否完整、清晰且可验收。
**Created**: 2026-07-27
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [x] CHK001 - 是否明确规定所有成功 initial POST、recovery GET 和 HITL resume 都使用同一种 envelope，而非仅规定某一个入口？ [Completeness, Spec §FR-050-014, FR-050-018]
- [x] CHK002 - 是否明确规定初始请求缺失 `Idempotency-Key` 时的安全失败结果，以及不存在 raw fallback？ [Completeness, Spec §FR-050-017]
- [x] CHK003 - 是否明确保留 duplicate replay descriptor、cursor 与同一 `runId` 的语义，避免将它们误删为 legacy mode？ [Completeness, Plan §Protocol Cutover Addendum]

## Requirement Clarity and Consistency

- [x] CHK004 - 是否将 `Accept` profile 的角色清晰限定为客户端声明，而不是服务端选择 raw/envelope 的开关？ [Clarity, Contract §Fixed protocol]
- [x] CHK005 - 是否明确 `protocolVersion: 1` 不变的理由，并区分“删除替代路径”与“改变 envelope schema”？ [Clarity, Plan §Protocol-version semantics]
- [x] CHK006 - 是否明确旧页面、curl 和内部脚本失效仅发生在预发布完整镜像部署边界，而不是无条件的长期兼容承诺？ [Consistency, Spec §Clarifications, Contract §Initial POST behavior]

## Scenario and Acceptance Coverage

- [x] CHK007 - 是否为普通聊天、Delivery Chain 和 Tasklist HITL continuation 分别定义 fixed-envelope 验收覆盖？ [Coverage, Spec §SC-050-009, Tasks §Phase 12]
- [x] CHK008 - 是否定义 raw line 被 server writer 与 client reader 拒绝的验收边界，同时保持 blank heartbeat 为非业务事件？ [Coverage, Plan §Verification additions, Contract §Fixed protocol]
- [x] CHK009 - 是否要求维护的 smoke client 改为读取 `envelope.payload`，避免发布后仍保留一条未记录的 raw consumer？ [Completeness, Plan §Required implementation changes]
