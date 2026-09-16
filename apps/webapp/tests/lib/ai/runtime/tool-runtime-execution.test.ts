import type { ToolCall } from '@langchain/core/messages'
import { tool, type ToolRuntime } from '@langchain/core/tools'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { RetryPermitPool } from '@/lib/ai/runtime/general-react-agent/retry-permit-pool'
import {
    executeToolCall,
    normalizeToolExecutionError,
    resolveToolAttemptTimeoutMs,
    resolveToolRetryDelayMs,
} from '@/lib/ai/runtime/tool-runtime'
import type { ChatExecutionContext } from '@/lib/ai/runtime/types'
import type { ChatToolDefinition } from '@/lib/ai/tools'
import { WebProviderError } from '@/lib/ai/tools/web/tavily-web-provider'

const echoToolSchema = z.object({
    input: z.string(),
})

const resourceToolSchema = z.object({
    uri: z.string(),
})

function createToolCall(name: string, args: Record<string, unknown>): ToolCall {
    return {
        args,
        id: `tool-call:${name}`,
        name,
        type: 'tool_call',
    }
}

function createEchoToolDefinition(): ChatToolDefinition<z.infer<typeof echoToolSchema>> {
    return {
        executionPolicy: {
            kind: 'standard-tool',
            profile: 'local-deterministic',
            retrySafe: false,
        },
        formatInput: args => `input=${args.input}`,
        formatOutput: result => JSON.stringify(result),
        name: 'echo_internal',
        runtimeScopes: ['skill-binding', 'delivery-chain-manager'],
        schema: echoToolSchema,
        source: 'internal',
        tool: tool(async ({ input }) => ({ echoed: input }), {
            description: 'Echo a short string.',
            name: 'echo_internal',
            schema: echoToolSchema,
        }),
    }
}

function createResourceToolDefinition(): ChatToolDefinition<z.infer<typeof resourceToolSchema>> {
    return {
        executionPolicy: {
            kind: 'standard-tool',
            profile: 'local-deterministic',
            retrySafe: false,
        },
        formatOutput: result => JSON.stringify(result),
        getResourceDisplayConfig: args => ({
            resourceName: 'Internal Resource',
            uri: args.uri,
        }),
        getResourceResult: (args, result) => ({
            contentPreview: JSON.stringify(result),
            isTruncated: false,
            previewChars: 120,
            resourceName: 'Internal Resource',
            uri: args.uri,
        }),
        name: 'internal_resource',
        outputPartType: 'resource',
        runtimeScopes: ['skill-binding', 'delivery-chain-manager'],
        schema: resourceToolSchema,
        source: 'internal',
        tool: tool(async ({ uri }) => ({ uri, value: 'resource payload' }), {
            description: 'Return a structured resource payload.',
            name: 'internal_resource',
            schema: resourceToolSchema,
        }),
    }
}

describe('runtime/tool-runtime executeToolCall', () => {
    it('MCP formatter 缺失或抛错时 public transcript 不回退 raw input/output', async () => {
        const writeChunk = vi.fn()
        const rawInput = 'RAW_MCP_INPUT_SENTINEL'
        const rawOutput = 'RAW_MCP_OUTPUT_SENTINEL'
        const definition: ChatToolDefinition<z.infer<typeof echoToolSchema>> = {
            executionPolicy: {
                kind: 'standard-tool',
                profile: 'remote-readonly',
                retrySafe: false,
            },
            formatInput: () => {
                throw new Error('formatter failed')
            },
            formatOutput: () => rawOutput,
            name: 'unsafe-mcp-tool',
            runtimeScopes: ['general-react-agent'],
            schema: echoToolSchema,
            source: 'mcp',
            serverId: 'project-assistant-service',
            tool: tool(async () => ({ raw: rawOutput }), {
                description: 'Remote test tool.',
                name: 'unsafe-mcp-tool',
                schema: echoToolSchema,
            }),
        }

        const result = await executeToolCall(createToolCall(definition.name, { input: rawInput }), {}, writeChunk, {
            runtimeScope: 'general-react-agent',
            toolDefinitionMap: new Map([[definition.name, definition]]),
        })

        expect(result.output).toBe(rawOutput)
        const serializedPublicChunks = JSON.stringify(writeChunk.mock.calls)
        expect(serializedPublicChunks).not.toContain(rawInput)
        expect(serializedPublicChunks).not.toContain(rawOutput)
        expect(writeChunk.mock.calls.map(([chunk]) => chunk)).toEqual([
            expect.objectContaining({ input: '远程工具', type: 'tool-start' }),
            expect.objectContaining({ output: '工具已完成。', type: 'tool-end' }),
        ])
    })

    it('默认作用域仍会写 tool-start / tool-end transcript', async () => {
        const writeChunk = vi.fn()
        const context: ChatExecutionContext = {}
        const toolDefinition = createEchoToolDefinition()

        const result = await executeToolCall(createToolCall(toolDefinition.name, { input: 'hello' }), context, writeChunk, {
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })

        expect(result.success).toBe(true)
        expect(result.rawResult).toEqual({
            echoed: 'hello',
        })
        expect(writeChunk.mock.calls.map(([chunk]) => chunk.type)).toEqual(['tool-start', 'tool-end'])
    })

    it('在首个底层 Tool attempt 前等待 tool-start 的 durable writer', async () => {
        let releaseStart!: () => void
        const startCommitted = new Promise<void>(resolve => {
            releaseStart = resolve
        })
        const invoke = vi.fn(async ({ input }: { input: string }) => ({ echoed: input }))
        const toolDefinition = createEchoToolDefinition()
        toolDefinition.tool = tool(invoke, {
            description: 'Durable lifecycle test tool.',
            name: toolDefinition.name,
            schema: echoToolSchema,
        })
        const writeChunk = vi.fn((chunk: { type?: string }) => (chunk.type === 'tool-start' ? startCommitted : undefined))

        const execution = executeToolCall(createToolCall(toolDefinition.name, { input: 'hello' }), {}, writeChunk, {
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })

        await new Promise(resolve => setTimeout(resolve, 0))
        expect(invoke).not.toHaveBeenCalled()
        releaseStart()

        await expect(execution).resolves.toMatchObject({ success: true })
        expect(writeChunk.mock.calls.map(([chunk]) => chunk.type)).toEqual(['tool-start', 'tool-end'])
    })

    it('delivery-chain-manager scope 会静默 tool transcript，但仍返回执行结果', async () => {
        const writeChunk = vi.fn()
        const context: ChatExecutionContext = {}
        const toolDefinition = createEchoToolDefinition()

        const result = await executeToolCall(createToolCall(toolDefinition.name, { input: 'hello' }), context, writeChunk, {
            runtimeScope: 'delivery-chain-manager',
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })

        expect(result.success).toBe(true)
        expect(result.rawResult).toEqual({
            echoed: 'hello',
        })
        expect(writeChunk).not.toHaveBeenCalled()
    })

    it('delivery-chain-manager scope 也会静默 resource transcript', async () => {
        const writeChunk = vi.fn()
        const context: ChatExecutionContext = {}
        const toolDefinition = createResourceToolDefinition()

        const result = await executeToolCall(createToolCall(toolDefinition.name, { uri: 'demo://resource.md' }), context, writeChunk, {
            runtimeScope: 'delivery-chain-manager',
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })

        expect(result.success).toBe(true)
        expect(result.rawResult).toEqual({
            uri: 'demo://resource.md',
            value: 'resource payload',
        })
        expect(writeChunk).not.toHaveBeenCalled()
    })

    it('有效 attempt timeout 取 Profile、Tool、Action 和 Run 剩余时间中的最小值', () => {
        expect(
            resolveToolAttemptTimeoutMs(
                {
                    attemptTimeoutMs: 4000,
                    kind: 'standard-tool',
                    profile: 'local-deterministic',
                    retrySafe: true,
                },
                {
                    actionDeadlineAtMs: 3200,
                    hardDeadlineAtMs: 9000,
                    nowMs: 1000,
                }
            )
        ).toBe(2200)
        expect(
            resolveToolAttemptTimeoutMs(
                {
                    kind: 'standard-tool',
                    profile: 'remote-readonly',
                    retrySafe: true,
                },
                {
                    actionDeadlineAtMs: 50000,
                    hardDeadlineAtMs: 16000,
                    nowMs: 1000,
                }
            )
        ).toBe(15000)
        expect(
            resolveToolAttemptTimeoutMs(
                {
                    kind: 'agent-tool',
                    profile: 'delegated-agent',
                },
                {
                    actionDeadlineAtMs: 50000,
                    hardDeadlineAtMs: 16000,
                    nowMs: 1000,
                }
            )
        ).toBeNull()
    })

    it('先 normalize 再执行 strict schema，只把校验后的参数交给底层 Tool', async () => {
        const invoke = vi.fn(async ({ input }: { input: string }) => input)
        const strictSchema = z.object({ input: z.string().min(2) }).strict()
        const toolDefinition: ChatToolDefinition<z.infer<typeof strictSchema>> = {
            executionPolicy: {
                kind: 'standard-tool',
                profile: 'local-deterministic',
                retrySafe: false,
            },
            name: 'strict-tool',
            normalizeArgs: args => ({ input: String((args as { input?: unknown }).input).trim() }),
            schema: strictSchema,
            tool: tool(invoke, {
                description: 'Strict test tool.',
                name: 'strict-tool',
                schema: strictSchema,
            }),
        }
        const writeChunk = vi.fn()

        const result = await executeToolCall(createToolCall('strict-tool', { extra: true, input: ' valid ' }), {}, writeChunk, {
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })

        expect(result.success).toBe(true)
        expect(invoke).toHaveBeenCalledWith({ input: 'valid' }, expect.anything())
        expect(writeChunk.mock.calls.map(([chunk]) => chunk.type)).toEqual(['tool-start', 'tool-end'])
    })

    it('scope 拒绝发生在 normalize 与 schema 之前', async () => {
        const normalizeArgs = vi.fn((args: unknown) => args)
        const invoke = vi.fn(async ({ input }: { input: string }) => input)
        const toolDefinition = createEchoToolDefinition()
        toolDefinition.normalizeArgs = normalizeArgs
        toolDefinition.tool = tool(invoke, {
            description: 'Scoped test tool.',
            name: toolDefinition.name,
            schema: echoToolSchema,
        })

        const result = await executeToolCall(createToolCall(toolDefinition.name, { input: 'hello' }), {}, vi.fn(), {
            runtimeScope: 'version-plan-tasklist-agent',
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })

        expect(result.success).toBe(false)
        expect(result.failureCategory).toBe('permission')
        expect(normalizeArgs).not.toHaveBeenCalled()
        expect(invoke).not.toHaveBeenCalled()
    })

    it('向底层 Tool 传播独立派生的 AbortSignal', async () => {
        const parentController = new AbortController()
        let receivedSignal: AbortSignal | undefined
        const signalSchema = z.object({ input: z.string() })
        const toolDefinition: ChatToolDefinition<z.infer<typeof signalSchema>> = {
            executionPolicy: {
                attemptTimeoutMs: 1000,
                kind: 'standard-tool',
                profile: 'local-deterministic',
                retrySafe: false,
            },
            name: 'signal-tool',
            schema: signalSchema,
            tool: tool(
                async ({ input }, runtime: ToolRuntime) => {
                    receivedSignal = runtime.config?.signal ?? runtime.signal
                    return input
                },
                {
                    description: 'Signal test tool.',
                    name: 'signal-tool',
                    schema: signalSchema,
                }
            ),
        }

        const result = await executeToolCall(
            createToolCall('signal-tool', { input: 'hello' }),
            { signal: parentController.signal },
            vi.fn(),
            {
                toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
            }
        )

        expect(result.success).toBe(true)
        expect(receivedSignal).toBeInstanceOf(AbortSignal)
        expect(receivedSignal).not.toBe(parentController.signal)
    })

    it('Tool timeout 后底层迟到结果不会写入 tool-end transcript', async () => {
        let receivedSignal: AbortSignal | undefined
        const delayedSchema = z.object({ input: z.string() })
        const delayedDefinition: ChatToolDefinition<z.infer<typeof delayedSchema>> = {
            executionPolicy: {
                attemptTimeoutMs: 5,
                kind: 'standard-tool',
                profile: 'local-deterministic',
                retrySafe: false,
            },
            name: 'delayed-tool',
            schema: delayedSchema,
            tool: tool(
                async ({ input }, runtime: ToolRuntime) => {
                    receivedSignal = runtime.config?.signal ?? runtime.signal
                    await new Promise(resolve => setTimeout(resolve, 25))
                    return input
                },
                {
                    description: 'Delayed test tool.',
                    name: 'delayed-tool',
                    schema: delayedSchema,
                }
            ),
        }
        const writeChunk = vi.fn()

        const result = await executeToolCall(createToolCall('delayed-tool', { input: 'late' }), {}, writeChunk, {
            toolDefinitionMap: new Map([[delayedDefinition.name, delayedDefinition]]),
        })

        expect(result).toMatchObject({ failureCategory: 'timeout', success: false })
        expect(receivedSignal?.aborted).toBe(true)
        await new Promise(resolve => setTimeout(resolve, 35))
        expect(writeChunk.mock.calls.map(([chunk]) => chunk.type)).not.toContain('tool-end')
    })

    it.each([
        ['5xx', Object.assign(new Error('temporary provider failure'), { status: 503 })],
        ['4xx', Object.assign(new Error('bad gateway request'), { status: 400 })],
        ['Tavily connection typed error', new WebProviderError('TAVILY_CONNECTION_ERROR', 'connection failed', { retryable: true })],
        ['unknown error', new Error('unexpected provider failure')],
    ] as const)('retry-safe 远端 Tool 对 %s 执行失败重试并保持一个逻辑 transcript', async (_label, firstError) => {
        vi.useFakeTimers()
        const retryPermitPool = new RetryPermitPool()
        const invoke = vi.fn<() => Promise<string>>().mockRejectedValueOnce(firstError).mockResolvedValue('recovered')
        const remoteSchema = z.object({ query: z.string() })
        const toolDefinition: ChatToolDefinition<z.infer<typeof remoteSchema>> = {
            executionPolicy: {
                attemptTimeoutMs: 20000,
                kind: 'standard-tool',
                profile: 'remote-readonly',
                retrySafe: true,
            },
            name: 'remote-tool',
            schema: remoteSchema,
            tool: tool(invoke, {
                description: 'Remote test tool.',
                name: 'remote-tool',
                schema: remoteSchema,
            }),
        }
        const writeChunk = vi.fn()

        const resultPromise = executeToolCall(createToolCall('remote-tool', { query: 'hello' }), {}, writeChunk, {
            actionDeadlineAtMs: Date.now() + 60000,
            hardDeadlineAtMs: Date.now() + 70000,
            retryPermitPool,
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })
        await vi.runAllTimersAsync()
        const result = await resultPromise
        vi.useRealTimers()

        expect(result.success).toBe(true)
        expect(result.attemptCount).toBe(2)
        expect(invoke).toHaveBeenCalledTimes(2)
        expect(retryPermitPool.snapshot()).toHaveLength(1)
        expect(writeChunk.mock.calls.map(([chunk]) => chunk.type)).toEqual(['tool-start', 'tool-end'])
    })

    it('retry-safe 远端 Tool 在连续失败后最多执行三次并只产生一个最终错误', async () => {
        vi.useFakeTimers()
        const retryPermitPool = new RetryPermitPool()
        const invoke = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('persistent provider failure'))
        const remoteSchema = z.object({ query: z.string() })
        const toolDefinition: ChatToolDefinition<z.infer<typeof remoteSchema>> = {
            executionPolicy: {
                attemptTimeoutMs: 20000,
                kind: 'standard-tool',
                profile: 'remote-readonly',
                retrySafe: true,
            },
            name: 'remote-persistent-tool',
            schema: remoteSchema,
            tool: tool(invoke, {
                description: 'Remote persistent retry test tool.',
                name: 'remote-persistent-tool',
                schema: remoteSchema,
            }),
        }
        const writeChunk = vi.fn()

        const resultPromise = executeToolCall(createToolCall('remote-persistent-tool', { query: 'hello' }), {}, writeChunk, {
            actionDeadlineAtMs: Date.now() + 60000,
            hardDeadlineAtMs: Date.now() + 70000,
            retryPermitPool,
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })
        await vi.runAllTimersAsync()
        const result = await resultPromise
        vi.useRealTimers()

        expect(result).toMatchObject({ attemptCount: 3, success: false })
        expect(invoke).toHaveBeenCalledTimes(3)
        expect(retryPermitPool.snapshot()).toHaveLength(2)
        expect(writeChunk.mock.calls.map(([chunk]) => chunk.type)).toEqual(['tool-start', 'error'])
    })

    it('规范化 retry 分类并优先采用合法 Retry-After，否则使用有界指数抖动', () => {
        const rateLimit = normalizeToolExecutionError({ retryAfterMs: 3000, status: 429 })
        const invalidRequest = normalizeToolExecutionError({ status: 400 })

        expect(rateLimit).toMatchObject({ category: 'rate-limit', retryable: true, retryAfterMs: 3000 })
        expect(invalidRequest).toMatchObject({ category: 'invalid-request', retryable: false })
        expect(resolveToolRetryDelayMs(rateLimit, 1, 0.75)).toBe(3000)
        expect(resolveToolRetryDelayMs(normalizeToolExecutionError({ status: 503 }), 1, 0.5)).toBe(1500)
        expect(resolveToolRetryDelayMs(normalizeToolExecutionError({ status: 503 }), 2, 0.5)).toBe(3000)
    })

    it('保留 Tavily connection typed error 的 connection 分类', () => {
        expect(
            normalizeToolExecutionError(new WebProviderError('TAVILY_CONNECTION_ERROR', '网页服务连接失败。', { retryable: true }))
        ).toMatchObject({ category: 'connection', retryable: true })
    })
})
