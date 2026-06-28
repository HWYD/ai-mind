# ADR-0004：Database Package Boundary

状态：Accepted
日期：2026-06-27

## 背景

v0.3.0 先在 webapp 内验证 Prisma，然后将 Prisma schema、migrations、generated client 和 database scripts 上移到共享 workspace package。

未来 `project-assistant-service` 可能复用同一个 PostgreSQL 实例和 Prisma client，但不应复用 webapp 专属的 Tasklist Agent business services。

## 决策

`@ai-mind/database` 只管理 Prisma schema、migrations、generated client 和 database scripts。

业务 repository / service 继续由定义业务行为的 app 或 service 拥有。

## 影响

- Webapp 拥有 AgentRunRepository / AgentRunService / session ownership。
- 未来 PAS 可以导入 database package，但必须拥有自己的业务 repository / service。
- database package 变化属于跨边界改动，需要 spec、migration review 和 database validation。
- PostgresSaver 仍不进入 Prisma schema 所有权。

## 备选方案

继续让 Prisma 私有于 webapp。这个方案被放弃，因为未来 service 会需要第二套数据库层。

把 AgentRunService 移进 `@ai-mind/database`。这个方案被放弃，因为它会把 schema/client package 变成业务 runtime package。

## 后续事项

未来新增共享业务实体时，应通过明确 spec 引入；如果是长期结构决策，还应新增 ADR。
