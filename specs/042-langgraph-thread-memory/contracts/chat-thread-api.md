# Contract: Chat Thread Hydration API

**Feature**: [spec.md](../spec.md)
**Date**: 2026-07-02

## Endpoint

```http
GET /api/chat/thread
```

Returns safe hydration data for the current browser chat thread.

## Session Behavior

- Uses the existing browser session cookie mechanism.
- If no session cookie exists, the route creates one and returns an empty hydration result.
- The route never returns the raw session id.

## Success Response

```json
{
    "threadId": "chat:derived-session-hash",
    "messages": [
        {
            "id": "msg-user-1",
            "role": "user",
            "parts": [
                {
                    "type": "text",
                    "text": "上一轮用户输入",
                    "format": "markdown"
                }
            ],
            "createdAt": "2026-07-02T10:00:00.000Z",
            "status": "completed"
        },
        {
            "id": "msg-assistant-1",
            "role": "assistant",
            "parts": [
                {
                    "type": "text",
                    "text": "上一轮助手回答",
                    "format": "markdown"
                }
            ],
            "createdAt": "2026-07-02T10:00:05.000Z",
            "status": "completed"
        }
    ],
    "summaryPreview": "更早对话摘要预览",
    "pinnedDecisions": ["v0.4.2 不保存 Tasklist GraphState 到 chat memory。"],
    "restored": true
}
```

## Empty Response

```json
{
    "threadId": "chat:derived-session-hash",
    "messages": [],
    "pinnedDecisions": [],
    "restored": false
}
```

## Field Rules

- `threadId`
    - Required.
    - Must start with `chat:`.
    - Must not contain raw session id or cookie value.
- `messages`
    - Required array.
    - Contains only frontend-compatible text messages.
    - Must not include tool/resource/agent/workflow/artifact parts.
- `summaryPreview`
    - Optional.
    - Bounded preview only; not raw prompt or raw checkpoint.
- `pinnedDecisions`
    - Required array.
    - Maximum 20 entries.
- `restored`
    - Required boolean.

## Forbidden Response Fields

The response must not include:

- `checkpoint`
- `rawCheckpoint`
- `prompt`
- `rawPrompt`
- `providerResponse`
- `stack`
- `graphState`
- `tasklist`
- `deliveryChain`
- `runtimeArtifact`
- `subagentInvocation`
- `subagentResult`
- `sessionId`
- `cookie`
- `apiKey`
- `providerConfig`

## Failure Behavior

- If checkpoint storage is unavailable, the route should return a safe empty or degraded hydration response when possible.
- User-facing errors must be sanitized.
- Raw database, checkpoint, provider, or stack details must not be returned.
