import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Command } from '@langchain/langgraph'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createActionBatchAdmission } from '@/lib/ai/runtime/general-react-agent/action-batch-admission'
import { createGeneralReActRunContext } from '@/lib/ai/runtime/general-react-agent/agent-context'
import { createGeneralReActInitialState } from '@/lib/ai/runtime/general-react-agent/agent-state'
import {
    executeGeneralReActToolCall,
    type GeneralReActToolCommandUpdate,
} from '@/lib/ai/runtime/general-react-agent/middleware/tool-runtime-middleware'
import { RetryPermitPool } from '@/lib/ai/runtime/general-react-agent/retry-permit-pool'
import type { ChatToolDefinition } from '@/lib/ai/tools'

function createState(callId = 'call-1', overrides = {}) {
    return {
        ...createGeneralReActInitialState(Date.now()),
        _actionRoundCount: 1,
        _currentActionBatch: createActionBatchAdmission({
            actionRound: 1,
            batchId: 'batch-1',
            callIds: [callId],
            observationCharsUsed: 0,
            toolCallsUsed: 0,
        }),
        ...overrides,
    }
}

function createContext(
    toolDefinitions: ChatToolDefinition[],
    publishChunk: ReturnType<typeof vi.fn> = vi.fn(async (_chunk: unknown) => undefined)
) {
    return createGeneralReActRunContext({
        clock: { now: () => Date.now() },
        createPhaseModel: vi.fn() as never,
        executionContext: { resolvedModelSelection: {} } as never,
        isTransportClosed: () => false,
        normalizeModelError: vi.fn() as never,
        publishChunk: publishChunk as unknown as (chunk: ChatStreamChunk) => Promise<void>,
        retryPermitPool: new RetryPermitPool(),
        runSignal: new AbortController().signal,
        toolDefinitionMap: new Map(toolDefinitions.map(definition => [definition.name, definition])),
    })
}

function getUpdate(command: Command): GeneralReActToolCommandUpdate {
    return command.update as GeneralReActToolCommandUpdate
}

function getOnlyToolMessage(command: Command): ToolMessage {
    const update = getUpdate(command)
    expect(update.messages).toHaveLength(1)
    expect(ToolMessage.isInstance(update.messages?.[0])).toBe(true)
    return update.messages![0]!
}

describe('general-react-agent tool runtime middleware', () => {
    it('搜索结果投影为严格的 public source DTO，避免超长或非规范来源阻断流持久化', async () => {
        const publishChunk = vi.fn(async (_chunk: unknown) => undefined)
        const schema = z.object({ query: z.string() }).strict()
        const longUrl = `https://example.com/news/${'a'.repeat(180)}#fragment`
        const definition: ChatToolDefinition<{ query: string }> = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            formatOutput: result => JSON.stringify(result),
            name: 'web-search',
            schema,
            tool: tool(
                async () => ({
                    results: [{ snippet: '', title: '  最新消息  ', url: longUrl }],
                }),
                { description: 'search', name: 'web-search', schema }
            ),
            runtimeScopes: ['general-react-agent'],
        }

        await executeGeneralReActToolCall({
            context: createContext([definition], publishChunk),
            state: createState(),
            toolCall: { args: { query: 'AI news' }, id: 'call-1', name: 'web-search', type: 'tool_call' },
        })

        const toolEnd = publishChunk.mock.calls
            .map(([chunk]) => chunk)
            .find((chunk): chunk is { type: 'tool-end'; sources?: Array<{ sourceId: string; title: string; url: string }> } =>
                Boolean(chunk && typeof chunk === 'object' && 'type' in chunk && chunk.type === 'tool-end')
            )

        expect(toolEnd?.sources).toEqual([
            {
                originTool: 'web-search',
                sourceId: expect.stringMatching(/^source-/),
                status: 'discovered',
                title: '最新消息',
                url: 'https://example.com/news/' + 'a'.repeat(180),
            },
        ])
        expect(toolEnd?.sources?.[0]?.sourceId.length).toBeLessThanOrEqual(128)
    })

    it('在底层 Tool 完成前发布 start，且只在完成后发布附来源的 terminal', async () => {
        let resolveTool!: (value: { results: Array<{ title: string; url: string }> }) => void
        const pendingResult = new Promise<{ results: Array<{ title: string; url: string }> }>(resolve => {
            resolveTool = resolve
        })
        const publishChunk = vi.fn(async (_chunk: unknown) => undefined)
        const schema = z.object({ query: z.string() }).strict()
        const definition: ChatToolDefinition<{ query: string }> = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            formatOutput: result => JSON.stringify(result),
            name: 'web-search',
            schema,
            tool: tool(async () => await pendingResult, { description: 'search', name: 'web-search', schema }),
            runtimeScopes: ['general-react-agent'],
        }

        const execution = executeGeneralReActToolCall({
            context: createContext([definition], publishChunk),
            state: createState(),
            toolCall: { args: { query: 'AI news' }, id: 'call-1', name: 'web-search', type: 'tool_call' },
        })

        await Promise.resolve()
        await Promise.resolve()
        expect(publishChunk.mock.calls.map(([chunk]) => (chunk as { type: string }).type)).toEqual(['tool-start'])

        resolveTool({ results: [{ title: 'Latest', url: 'https://example.com/latest' }] })
        await execution

        expect(publishChunk.mock.calls.map(([chunk]) => (chunk as { type: string }).type)).toEqual(['tool-start', 'tool-end'])
        expect(publishChunk.mock.calls[1]?.[0]).toMatchObject({
            sources: [
                {
                    originTool: 'web-search',
                    status: 'discovered',
                    url: 'https://example.com/latest',
                },
            ],
            type: 'tool-end',
        })
    })

    it('按 allowlist→normalize→strict schema→security→fingerprint→authorization→execution 处理成功调用', async () => {
        const order: string[] = []
        const schema = z
            .object({ query: z.string() })
            .strict()
            .superRefine(() => {
                order.push('schema')
            })
        const definition: ChatToolDefinition<{ query: string }> = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            name: 'web-search',
            normalizeArgs: args => {
                order.push('normalize')
                return args
            },
            schema,
            tool: tool(
                async ({ query }) => {
                    order.push('execute')
                    return { query, results: [], truncated: false }
                },
                { description: 'search', name: 'web-search', schema }
            ),
            runtimeScopes: ['general-react-agent'],
        }

        const command = await executeGeneralReActToolCall({
            context: createContext([definition]),
            state: createState(),
            toolCall: { args: { query: 'LangChain' }, id: 'call-1', name: 'web-search', type: 'tool_call' },
        })

        expect(command).toBeInstanceOf(Command)
        expect(order).toEqual(['normalize', 'schema', 'schema', 'execute'])
        const update = getUpdate(command)
        expect(update._callFingerprints).toHaveLength(1)
        expect(update._executedToolCallCount).toBe(1)
        expect(getOnlyToolMessage(command)).toMatchObject({ status: 'success', tool_call_id: 'call-1' })
    })

    it('schema 错误不进入 Secret Guard/fingerprint/provider，也不重试', async () => {
        const invoke = vi.fn()
        const publishChunk = vi.fn(async (_chunk: unknown) => undefined)
        const schema = z.object({ query: z.string().max(5) }).strict()
        const definition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            name: 'web-search',
            schema,
            tool: tool(invoke, { description: 'search', name: 'web-search', schema }),
            runtimeScopes: ['general-react-agent'],
        }

        const command = await executeGeneralReActToolCall({
            context: createContext([definition], publishChunk),
            state: createState(),
            toolCall: {
                args: { query: 'api_key=secret-that-must-not-be-read' },
                id: 'call-1',
                name: 'web-search',
                type: 'tool_call',
            },
        })

        expect(invoke).not.toHaveBeenCalled()
        expect(publishChunk.mock.calls.map(([chunk]) => (chunk as { type: string }).type)).toEqual(['tool-start', 'error'])
        expect(JSON.stringify(publishChunk.mock.calls)).not.toContain('secret-that-must-not-be-read')
        expect(getUpdate(command)._callFingerprints).toBeUndefined()
        expect(getOnlyToolMessage(command).metadata).toMatchObject({ observationStatus: 'validation_error' })
    })

    it('Secret Guard 拒绝生成脱敏失败 Tool transcript，不生成 fingerprint、公开 input 或 provider 调用', async () => {
        const invoke = vi.fn()
        const publishChunk = vi.fn(async (_chunk: unknown) => undefined)
        const schema = z.object({ query: z.string() }).strict()
        const definition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            name: 'web-search',
            schema,
            tool: tool(invoke, { description: 'search', name: 'web-search', schema }),
            runtimeScopes: ['general-react-agent'],
        }

        const command = await executeGeneralReActToolCall({
            context: createContext([definition], publishChunk),
            state: createState(),
            toolCall: { args: { query: 'Authorization: Bearer secret-token' }, id: 'call-1', name: 'web-search', type: 'tool_call' },
        })

        expect(invoke).not.toHaveBeenCalled()
        const publishedChunks = publishChunk.mock.calls.map(([chunk]) => chunk as Record<string, unknown>)
        expect(publishedChunks.map(chunk => chunk.type)).toEqual(['tool-start', 'error'])
        expect(publishedChunks[0]).toMatchObject({
            input: '',
            partId: expect.any(String),
            toolName: 'web-search',
            type: 'tool-start',
        })
        expect(publishedChunks[1]).toMatchObject({
            errorCode: 'TOOL_EXECUTION_FAILED',
            message: '工具请求未执行。',
            partId: publishedChunks[0]?.partId,
            scope: 'tool',
            toolName: 'web-search',
            type: 'error',
        })
        expect(JSON.stringify(publishedChunks)).not.toContain('secret-token')
        expect(getUpdate(command)._callFingerprints).toBeUndefined()
        expect(getOnlyToolMessage(command)).toMatchObject({
            content: '请求包含禁止外发的凭据。',
            metadata: { observationStatus: 'denied' },
            tool_call_id: 'call-1',
        })
    })

    it('拒绝在 web-search 查询中携带签名 URL 的请求，公开为脱敏失败 Tool row，不进入指纹或 provider', async () => {
        const invoke = vi.fn()
        const publishChunk = vi.fn(async (_chunk: unknown) => undefined)
        const schema = z.object({ query: z.string() }).strict()
        const definition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            name: 'web-search',
            schema,
            tool: tool(invoke, { description: 'search', name: 'web-search', schema }),
            runtimeScopes: ['general-react-agent'],
        }

        const command = await executeGeneralReActToolCall({
            context: createContext([definition], publishChunk),
            state: createState(),
            toolCall: {
                args: { query: '查看 https://example.com/file?X-Amz-Signature=secret 内容' },
                id: 'call-1',
                name: 'web-search',
                type: 'tool_call',
            },
        })

        expect(invoke).not.toHaveBeenCalled()
        const publishedChunks = publishChunk.mock.calls.map(([chunk]) => chunk as Record<string, unknown>)
        expect(publishedChunks.map(chunk => chunk.type)).toEqual(['tool-start', 'error'])
        expect(JSON.stringify(publishedChunks)).not.toContain('X-Amz-Signature')
        expect(JSON.stringify(publishedChunks)).not.toContain('example.com/file')
        expect(getUpdate(command)._callFingerprints).toBeUndefined()
        expect(getOnlyToolMessage(command)).toMatchObject({
            content: '请求包含禁止外发的凭据。',
            metadata: { observationStatus: 'denied' },
            tool_call_id: 'call-1',
        })
    })

    it('read-url 在 fingerprint 后执行当前 Run URL authorization，未授权时显示失败 Tool row且不调用 provider', async () => {
        const invoke = vi.fn()
        const publishChunk = vi.fn(async (_chunk: unknown) => undefined)
        const schema = z.object({ url: z.string().url() }).strict()
        const definition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
            name: 'read-url',
            schema,
            tool: tool(invoke, { description: 'read', name: 'read-url', schema }),
            runtimeScopes: ['general-react-agent'],
        }

        const command = await executeGeneralReActToolCall({
            context: createContext([definition], publishChunk),
            state: createState(),
            toolCall: { args: { url: 'https://example.com/docs' }, id: 'call-1', name: 'read-url', type: 'tool_call' },
        })

        expect(invoke).not.toHaveBeenCalled()
        const publishedChunks = publishChunk.mock.calls.map(([chunk]) => chunk as Record<string, unknown>)
        expect(publishedChunks.map(chunk => chunk.type)).toEqual(['tool-start', 'error'])
        expect(publishedChunks[0]).toMatchObject({ input: '', toolName: 'read-url', type: 'tool-start' })
        expect(publishedChunks[1]).toMatchObject({
            message: '工具请求未执行。',
            partId: publishedChunks[0]?.partId,
            scope: 'tool',
            toolName: 'read-url',
            type: 'error',
        })
        expect(JSON.stringify(publishedChunks)).not.toContain('https://example.com/docs')
        expect(getUpdate(command)._callFingerprints).toHaveLength(1)
        expect(getOnlyToolMessage(command).metadata).toMatchObject({ observationStatus: 'denied' })
    })

    it('同 fingerprint 重复调用不执行 Tool，并只返回一个 paired ToolMessage', async () => {
        const invoke = vi.fn()
        const schema = z.object({ value: z.number() }).strict()
        const definition: ChatToolDefinition = {
            executionPolicy: { attemptTimeoutMs: 1000, kind: 'standard-tool', profile: 'local-deterministic', retrySafe: true },
            name: 'calculator',
            schema,
            tool: tool(invoke, { description: 'calculate', name: 'calculator', schema }),
            runtimeScopes: ['general-react-agent'],
        }
        const firstState = createState()
        const firstCommand = await executeGeneralReActToolCall({
            context: createContext([definition]),
            state: firstState,
            toolCall: { args: { value: 1 }, id: 'call-1', name: 'calculator', type: 'tool_call' },
        })
        const fingerprint = getUpdate(firstCommand)._callFingerprints?.[0]

        const duplicatePublishChunk = vi.fn(async (_chunk: unknown) => undefined)
        const duplicate = await executeGeneralReActToolCall({
            context: createContext([definition], duplicatePublishChunk),
            state: createState('call-2', { _callFingerprints: [fingerprint] }),
            toolCall: { args: { value: 1 }, id: 'call-2', name: 'calculator', type: 'tool_call' },
        })

        expect(invoke).toHaveBeenCalledTimes(1)
        expect(duplicatePublishChunk.mock.calls.map(([chunk]) => (chunk as { type: string }).type)).toEqual(['tool-start', 'error'])
        expect(getOnlyToolMessage(duplicate).metadata).toMatchObject({ observationStatus: 'duplicate' })
    })

    it('非 General ReAct scope 的 Tool 请求显示通用失败 row，且不泄露受限工具名或调用 provider', async () => {
        const invoke = vi.fn()
        const publishChunk = vi.fn(async (_chunk: unknown) => undefined)
        const schema = z.object({ value: z.number() }).strict()
        const definition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'local-deterministic', retrySafe: true },
            name: 'restricted-calculator',
            schema,
            tool: tool(invoke, { description: 'calculate', name: 'restricted-calculator', schema }),
            runtimeScopes: ['version-plan-tasklist-agent'],
        }

        const command = await executeGeneralReActToolCall({
            context: createContext([definition], publishChunk),
            state: createState(),
            toolCall: { args: { value: 1 }, id: 'call-1', name: 'restricted-calculator', type: 'tool_call' },
        })

        const publishedChunks = publishChunk.mock.calls.map(([chunk]) => chunk as Record<string, unknown>)
        expect(invoke).not.toHaveBeenCalled()
        expect(publishedChunks.map(chunk => chunk.type)).toEqual(['tool-start', 'error'])
        expect(publishedChunks).toEqual([
            expect.objectContaining({ input: '', title: '工具请求', toolName: 'tool-request', type: 'tool-start' }),
            expect.objectContaining({
                message: '工具请求未执行。',
                scope: 'tool',
                toolName: 'tool-request',
                type: 'error',
            }),
        ])
        expect(JSON.stringify(publishedChunks)).not.toContain('restricted-calculator')
        expect(getOnlyToolMessage(command).metadata).toMatchObject({ observationStatus: 'denied' })
    })

    it('同一四宽 Action batch 的相同 fingerprint 只执行一次，并为其余调用返回 paired duplicate', async () => {
        const invoke = vi.fn(async () => ({ value: 1 }))
        const schema = z.object({ value: z.number() }).strict()
        const definition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'local-deterministic', retrySafe: true },
            name: 'calculator',
            schema,
            tool: tool(invoke, { description: 'calculate', name: 'calculator', schema }),
            runtimeScopes: ['general-react-agent'],
        }
        const callIds = ['call-1', 'call-2', 'call-3', 'call-4']
        const state = {
            ...createGeneralReActInitialState(Date.now()),
            _actionRoundCount: 1,
            _currentActionBatch: createActionBatchAdmission({
                actionRound: 1,
                batchId: 'batch-duplicate-fingerprint',
                callIds,
                observationCharsUsed: 0,
                toolCallsUsed: 0,
            }),
        }
        const context = createContext([definition])
        const executions = callIds.map(callId =>
            executeGeneralReActToolCall({
                context,
                state,
                toolCall: { args: { value: 1 }, id: callId, name: 'calculator', type: 'tool_call' },
            })
        )

        const commands = await Promise.all(executions)
        const messages = commands.map(getOnlyToolMessage)

        expect(invoke).toHaveBeenCalledTimes(1)
        expect(messages.filter(message => message.metadata?.observationStatus === 'success')).toHaveLength(1)
        expect(messages.filter(message => message.metadata?.observationStatus === 'duplicate')).toHaveLength(3)
        expect(messages.map(message => message.tool_call_id)).toEqual(callIds)
    })

    it('未获 admission 的 logical call 返回 budget_blocked 且 provider 调用为零', async () => {
        const invoke = vi.fn()
        const publishChunk = vi.fn(async (_chunk: unknown) => undefined)
        const schema = z.object({ value: z.number() }).strict()
        const definition: ChatToolDefinition = {
            executionPolicy: { kind: 'standard-tool', profile: 'local-deterministic', retrySafe: true },
            name: 'calculator',
            schema,
            tool: tool(invoke, { description: 'calculate', name: 'calculator', schema }),
            runtimeScopes: ['general-react-agent'],
        }
        const state = createGeneralReActInitialState(Date.now())
        state._currentActionBatch = createActionBatchAdmission({
            actionRound: 1,
            batchId: 'batch-1',
            callIds: ['call-1'],
            observationCharsUsed: 0,
            toolCallsUsed: 14,
        })

        const command = await executeGeneralReActToolCall({
            context: createContext([definition], publishChunk),
            state,
            toolCall: { args: { value: 1 }, id: 'call-1', name: 'calculator', type: 'tool_call' },
        })

        expect(invoke).not.toHaveBeenCalled()
        expect(publishChunk.mock.calls.map(([chunk]) => (chunk as { type: string }).type)).toEqual(['tool-start', 'error'])
        expect(getOnlyToolMessage(command).metadata).toMatchObject({ observationStatus: 'budget_blocked' })
    })
})
