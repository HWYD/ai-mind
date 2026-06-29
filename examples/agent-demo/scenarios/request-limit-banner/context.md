# Context

## Product Context

- 这是 public demo 入口，不需要账户体系
- 目标是及时提醒，而不是阻断输入

## Module Map

- Chat page shell
- Request usage state
- Banner presentation

## Interface Contracts

- 不修改 stream protocol
- 不新增后端写库

## Constraints

- 仅在小屏和桌面共用同一数据源
- 样式改动保持轻量

## Acceptance Criteria

- 接近上限时显示 banner
- 未接近上限时不显示
- 不影响发送按钮行为
