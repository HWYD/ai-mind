# Contract: Chat Thread Hydration Compatibility

**Feature**: [../spec.md](../spec.md)
**Date**: 2026-07-03

## Endpoint

```http
GET /api/chat/thread
```

Returns safe hydration data for the current browser chat thread.

## Compatibility Decision

v0.4.3 does not change the hydration response shape from v0.4.2.

## Success Response Shape

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
                    "text": "用户问题",
                    "format": "markdown"
                }
            ],
            "createdAt": "2026-07-03T10:00:00.000Z",
            "status": "completed"
        },
        {
            "id": "msg-assistant-1",
            "role": "assistant",
            "parts": [
                {
                    "type": "text",
                    "text": "最终用户可见回答",
                    "format": "markdown"
                }
            ],
            "createdAt": "2026-07-03T10:00:05.000Z",
            "status": "completed"
        }
    ],
    "summaryPreview": "更早对话摘要预览",
    "pinnedDecisions": [],
    "restored": true
}
```

## Field Rules

- `messages` contains only ordinary user/assistant text messages.
- Tool, resource, prompt, workflow, agent-step, agent-interrupt and artifact parts must not be returned.
- Source metadata, turn id and display kind must not be returned in v0.4.3.
- Tasklist final turns hydrate as ordinary text messages containing final answer text summary only.
- Delivery final turns hydrate as ordinary text messages containing deterministic truncated final report text only, capped at 8000 characters.

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
- `workflowProgress`
- `subagentInvocation`
- `subagentResult`
- `toolCall`
- `toolArgs`
- `toolResult`
- `toolMessage`
- `mcpEnvelope`
- `resourceContent`
- `sessionId`
- `cookie`
- `apiKey`
- `providerConfig`
- `source`
- `turnId`
- `displayKind`

## Frontend Contract

- Existing hydration consumer may continue filtering restored messages to completed user/assistant text-only messages.
- Existing reducer public shape does not change.
- UI source badges, collapsed execution summaries and memory inspector are out of scope.

## Failure Behavior

- If checkpoint storage is unavailable, return safe empty/degraded hydration when possible.
- User-facing errors must remain sanitized.
- No raw database, checkpoint, provider, runtime, GraphState or RuntimeArtifact details may be returned.
