# Contract: Chat Thread Hydration And Send

**Feature**: [../spec.md](../spec.md)  
**Date**: 2026-07-04

本文描述 v0.4.4 下 persisted selected conversation 与 blank draft state 的 hydration / send 行为 contract。

## Hydrate Selected Conversation Thread

hydrate 一个经过服务端校验的 selected persisted conversation。

### Request

```json
{
    "conversationId": "conv_opaque_id"
}
```

### Response

```json
{
    "conversationId": "conv_opaque_id",
    "messages": [],
    "pinnedDecisions": [],
    "restored": false
}
```

### Rules

- `conversationId` 是必填项
- 该 conversation 必须属于 current browser session registry
- hydration 只能读取这个 conversation 的 ThreadState
- 缺少 `conversationId` 时，不能静默推断 default 或 active conversation
- blank draft 不执行 persisted hydration；前端直接使用安全 empty local state
- hydration 失败时，不能替换成其他 conversation 的数据
- response 必须继续保持 text-only，并与现有 completed user / assistant message hydration 兼容

### Forbidden Fields

response 中不得出现以下字段或信息：

- raw browser session id
- raw checkpoint
- provider response
- provider config
- GraphState
- RuntimeArtifact
- workflow progress
- raw tool transcript
- API key
- cookie value
- source / turn metadata

## Send Chat Message

向 selected persisted conversation，或从 blank draft promotion path 发送 chat request。

### Request

Persisted conversation request:

```json
{
    "conversationId": "conv_opaque_id",
    "messages": [
        {
            "role": "user",
            "parts": [
                {
                    "type": "text",
                    "text": "用户输入",
                    "format": "markdown"
                }
            ]
        }
    ],
    "options": {
        "modelId": "selected-model"
    }
}
```

Draft promotion request:

```json
{
    "createConversation": true,
    "messages": [
        {
            "role": "user",
            "parts": [
                {
                    "type": "text",
                    "text": "用户输入",
                    "format": "markdown"
                }
            ]
        }
    ],
    "options": {
        "modelId": "selected-model"
    }
}
```

### Rules

- persisted send 必须携带 `conversationId`，且必须属于 current browser session registry
- draft promotion send 必须显式标记 `createConversation: true`，而不是依赖缺失 `conversationId` 的隐式推断
- draft promotion path 在建立 active stream ownership 之前，必须先创建一个新的 persisted conversation
- model-visible history 由 selected persisted conversation ThreadState 加当前 eligible user input 共同组成；draft promotion path 则由 empty short-term memory baseline 加当前 eligible user input 组成
- frontend historical messages 不能变成 cross-conversation model history
- completed assistant final text 只能写入当前请求捕获的 persisted conversation
- 在完成 user-visible final turn 后，registry 的 `lastActiveAt` 必须更新
- 缺失 `conversationId` 且未显式标记 `createConversation: true` 的请求必须安全失败，且不能 fallback 到 legacy `chat:${sessionHash}`

## Streaming Guard

### Rules

- 当 chat stream 处于 `submitted` 或 `streaming` 状态时，new conversation 与 switch conversation controls 必须禁用
- active stream ownership 绑定到请求开始时捕获的 `conversationId`
- v0.4.4 不需要修改 stream-core chunk

## Compatibility Rules

- 保持 v0.4.2 safe hydration 行为不变
- 保持 v0.4.3 final-turn memory write eligibility 行为不变
- Tasklist Agent checkpoint/resume thread identity 继续独立
- Delivery Chain 继续保持 run-local
- `@ai-mind/stream-core` chunk union 不变
- frontend reducer public message shape 不变
