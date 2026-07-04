# Contract: Final Turn Memory Runtime

**Feature**: [../spec.md](../spec.md)
**Date**: 2026-07-03

## Purpose

Define the runtime contract for appending completed user-visible final turns into chat memory without persisting execution state.

## Eligible Final Turn Sources

- ordinary chat final answer
- tool-assisted final answer
- authoritative tool final text answer
- reader / utility final text answer
- docs summary final text answer
- MCP/resource-assisted final text answer
- Tasklist Agent completed/final/controlled blocked final answer text summary
- Delivery Chain completed/blocked final report text
- future controlled Agent final text, if it follows this contract

## Ineligible Outputs

- empty assistant text
- cancelled request
- incomplete streaming answer
- transient placeholder
- Tasklist paused/interrupted HITL turn
- failed or exception report
- raw tool call, args, result, or ToolMessage
- raw MCP envelope or resource content
- prompt raw content
- Tasklist GraphState
- HITL checkpoint or interrupt payload
- AgentRun / AgentInterrupt database row
- Delivery RuntimeArtifact
- workflow progress
- subagent raw invocation/result
- raw prompt, provider response, stack, API key, cookie value, provider config

## Append-Time Candidate

```ts
type FinalTurnCandidate = {
    source: 'chat' | 'tool' | 'mcp-resource' | 'tasklist-agent' | 'delivery-chain' | 'agent'
    userText: string
    assistantText: string
    userMessageId?: string
    assistantMessageId?: string
    completionStatus: 'blocked' | 'cancelled' | 'completed' | 'failed' | 'final' | 'interrupted' | 'paused'
}
```

Rules:

- Candidate shape is internal only and must not be persisted as-is.
- `source` and ids may be used for guardrails, logs and duplicate checks only.
- Only `completed`, `final` and controlled `blocked` candidates may be saved.
- `assistantText` must already be final user-visible text, not a raw runtime object.
- Tasklist candidates must use final answer text summary only.
- Delivery candidates must use final report text only.

## Persisted Messages

```ts
type ChatThreadMessage = {
    id: string
    role: 'assistant' | 'user'
    text: string
    createdAt: string
}
```

Rules:

- No persisted source metadata in v0.4.3.
- No persisted turn id or display kind in v0.4.3.
- No tool/resource/agent/workflow/artifact parts.

## Duplicate Prevention

Before append:

1. Read current ThreadState.
2. If candidate user/assistant ids match an existing stored message pair, skip append.
3. Otherwise, if an existing adjacent user/assistant pair has identical trimmed `userText` and `assistantText`, skip append.
4. Otherwise, append the new user/assistant pair.

## Long Final Text Bounding

- Ordinary tool/MCP final answers may use existing text limits and compaction behavior.
- Tasklist final memory uses final answer text summary only; tasklist artifact markdown is never persisted.
- Delivery final report text must be deterministically truncated before persistence when it exceeds 8000 characters.
- Truncation must preserve the beginning of the visible final report and append a safe truncation notice.
- Bounding must not create `execution_summary`, `agent_run_summary`, `tool_observation_summary`, or `contextEntries`.

## Write Timing

```text
runtime final answer completed
  -> build candidate from safe text
  -> reject ineligible status / empty output
  -> bound long structured final text
  -> read ThreadState
  -> skip duplicate or append pair
  -> compact if threshold exceeded
  -> finish response without exposing memory internals
```

## Context Eligibility

- Final-turn write eligibility is separate from ordinary chat context eligibility.
- Structured runtimes may append final text after completion.
- Structured runtimes must not automatically use chat ThreadState as model-visible context unless a later spec explicitly allows it.

## Non-Regression Requirements

- Existing ordinary chat memory context assembly remains server-authoritative.
- Tasklist resume continues to use `tasklist-agent:${conversationId}:${runId}` semantics.
- Delivery Chain remains run-local and does not gain checkpoint/resume behavior.
- ToolRuntimeScope suppression for Delivery manager subagent tools remains intact.
- Stream protocol and frontend reducer public shape remain unchanged.
