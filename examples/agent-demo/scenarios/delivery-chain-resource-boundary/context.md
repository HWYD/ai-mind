# Context

## Product Context

- 这是公开 demo，不是内部研发工具
- 后续 `/plan`、`/task`、`/review`、`/delivery-chain` 都要复用同一边界

## Module Map

- resource resolver
- picker data source
- command entry

## Interface Contracts

- 不改 Graph topology
- 不改 reducer schema

## Constraints

- 必须 fail closed
- 必须拒绝真实绝对路径和路径逃逸

## Acceptance Criteria

- 只允许 `@demo://`
- 拒绝 `@docs://`、`@file://`、绝对路径、`../`
- picker 不展示真实仓库内容
