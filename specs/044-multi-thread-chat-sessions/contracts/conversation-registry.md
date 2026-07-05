# Contract: Conversation Registry

**Feature**: [../spec.md](../spec.md)  
**Date**: 2026-07-04

本文描述 v0.4.4 下 current browser session 的最小 Conversation Registry public contract，包括初始化、draft 入口、选择、排序与裁剪行为。

## GET Conversation Registry

返回 current browser session 的 persisted conversation registry。如果 chat page 初始化时该 session 还没有任何 persisted conversation，系统返回一个空 registry，由前端进入 blank draft state。

### Response

```json
{
    "selectedConversationId": null,
    "limit": 10,
    "conversations": []
}
```

### Rules

- `conversations.length <= 10`
- payload 只返回 persisted conversations，不返回 blank drafts
- items 必须按 `lastActiveAt` 倒序排列
- 当 registry 非空时，必须且只能有一个 selected persisted conversation
- response 不得包含 raw browser session id、raw checkpoint id、raw cookie value、provider config 或 storage internals

## Start New Draft

点击“新聊天”只进入一个 client-local blank draft。它不是 server-side registry mutation，也不会立即创建 persisted conversation。

### Rules

- blank draft 初始标题为 `新会话`
- blank draft 不创建 persisted `conversationId`
- blank draft 不进入 registry / recent list
- 只有首条 user message 被接受后，系统才创建 persisted conversation 并把它加入 registry

## Select Conversation

把 current browser session registry 内的某个已有 persisted conversation 设为 selected。UI 不得在 assistant output streaming 时调用此操作。

### Request

```json
{
    "conversationId": "conv_existing"
}
```

### Response

```json
{
    "selectedConversationId": "conv_existing",
    "limit": 10,
    "conversations": []
}
```

### Rules

- `conversationId` 必须属于 current browser session registry
- 选中某个 conversation 只更新 selected state，不更新其 `lastActiveAt`
- invalid 或已被 prune 的 conversation id 必须安全失败，且不能 hydrate 其他 conversation 的 messages

## Draft Promotion And Title Update

系统在收到 draft 的首条 user message 后，创建 persisted conversation，并通过确定性截断更新 conversation title。

### Rules

- v0.4.4 不做复杂的 LLM title generation
- 在可确定标题前，draft title 保持为 `新会话`
- promotion 完成后，新 persisted conversation 必须进入 registry，并成为 selected conversation
- title truncation 必须在 desktop sidebar 与 mobile drawer 中安全可用

## Error Behavior

- 缺失或无效的 `conversationId`：返回安全的 validation error；如果当前没有 persisted conversation，可安全返回空 registry，由前端进入 blank draft state
- storage unavailable：保持 UI 可用，不暴露 raw storage/checkpoint errors
- registry limit exceeded：裁剪 least recently active persisted entry，不提供 search / pagination / recovery 能力
