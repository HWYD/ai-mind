import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { convertToOpenAITool } from '@langchain/core/utils/function_calling'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { InputLengthExceededError, type ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatContextPreflight } from '@/lib/ai/runtime/chat-context-preflight'
import { type AiMindThreadState, type ChatMemoryService, createChatMemoryService } from '@/lib/ai/runtime/chat-memory'

const resolvedModelSelection: ResolvedModelSelection = {
    catalogItem: {
        availableIn: ['development', 'production'],
        capabilities: {
            chat: true,
            embedding: false,
            jsonOutput: true,
            streaming: true,
            tasklist: false,
            toolCalling: true,
        },
        contextWindowTokens: 40_000,
        enabled: true,
        family: 'ollama',
        id: 'ollama/qwen3-8b',
        label: 'Qwen3 8B',
        modelKey: 'qwen3:8b',
        provider: 'ollama',
        providerModel: 'qwen3:8b',
    },
    modelId: 'ollama/qwen3-8b',
    provider: 'ollama',
    providerModel: 'qwen3:8b',
    routeType: 'chat',
}

function createState(): AiMindThreadState {
    return {
        messages: [
            { createdAt: '2026-09-01T00:00:00.000Z', id: 'u1', role: 'user', text: 'old user ' + 'memory '.repeat(2_000) },
            {
                createdAt: '2026-09-01T00:00:01.000Z',
                id: 'a1',
                role: 'assistant',
                text: 'old assistant ' + 'memory '.repeat(2_000),
            },
        ],
        pinnedDecisions: ['durable pin'],
        summary: 'durable summary',
    }
}

function createMemoryService(state = createState()): Pick<ChatMemoryService, 'compactThreadState' | 'readThreadState'> {
    return {
        compactThreadState: vi.fn().mockResolvedValue(null),
        readThreadState: vi.fn().mockResolvedValue({ restored: true, state }),
    }
}

function createNearLimitNonMemoryMessages() {
    return [new SystemMessage('dynamic system ' + 'system '.repeat(15_000)), new HumanMessage('latest user question')]
}

function createLargeToolDefinitions() {
    const largeSchema = z.object({
        query: z.string().describe('tool schema detail '.repeat(30_000)),
    })
    const largeTool = tool(async () => 'unused', {
        description: 'large tool definition',
        name: 'large-tool-definition',
        schema: largeSchema,
    })

    return [convertToOpenAITool(largeTool)]
}

describe('runtime/chat context preflight', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('在完整输入超限而 memory 自身未触发时仍只尝试一次持久化压缩，失败后使用 ephemeral fit 返回 model-ready messages', async () => {
        const memoryService = createMemoryService()
        const preflight = createChatContextPreflight({
            memoryService,
            resolvedModelSelection,
            threadId: 'chat:' + 'a'.repeat(64),
        })

        const nonMemoryMessages = createNearLimitNonMemoryMessages()
        const prepared = await preflight.prepare(memoryMessages => [...nonMemoryMessages, ...memoryMessages])

        expect(memoryService.compactThreadState).toHaveBeenCalledTimes(1)
        expect(prepared.kind).toBe('ephemeral-fit')
        expect(prepared.estimatedTokens).toBeLessThanOrEqual(prepared.budget.hardInputTokens)
        expect(prepared.messages).toContainEqual(expect.objectContaining({ content: 'latest user question' }))
    })

    it('持久化候选成功后重建完整输入，并使用已保存的 candidate 继续本次请求', async () => {
        const state = createState()
        const compactedState: AiMindThreadState = {
            messages: [],
            pinnedDecisions: [],
            summary: 'compacted summary',
            lastCompactedAt: '2026-09-01T00:00:02.000Z',
        }
        const memoryService = createMemoryService(state)
        vi.mocked(memoryService.compactThreadState).mockResolvedValue({
            estimatedTokens: 50,
            nextPinnedDecisions: [],
            originalTokens: 5_000,
            previousPinnedDecisions: state.pinnedDecisions,
            state: compactedState,
            wasCompacted: true,
        })
        const preflight = createChatContextPreflight({
            memoryService,
            resolvedModelSelection,
            threadId: 'chat:' + 'b'.repeat(64),
        })

        const nonMemoryMessages = createNearLimitNonMemoryMessages()
        const prepared = await preflight.prepare(memoryMessages => [...nonMemoryMessages, ...memoryMessages])

        expect(prepared.kind).toBe('persistent-compaction')
        expect(prepared.messages.map(message => String(message.content)).join('\n')).toContain('compacted summary')
        expect(prepared.estimatedTokens).toBeLessThanOrEqual(prepared.budget.hardInputTokens)
    })

    it('完整输入超限时即使 memory 自身尚未跨 trigger，也会 force 一次持久化候选并继续请求', async () => {
        const service = createChatMemoryService(
            { checkpointMode: 'memory' },
            {},
            {
                compactionGenerator: async () => ({
                    pinnedDecisions: [],
                    summary: 'persisted because complete input overflowed',
                }),
            }
        )
        const threadId = 'chat:' + 'f'.repeat(64)
        await service.writeThreadState(threadId, {
            ...createState(),
            messages: [
                { createdAt: '2026-09-01T00:00:00.000Z', id: 'u1', role: 'user', text: 'old user ' + 'memory '.repeat(6_000) },
                {
                    createdAt: '2026-09-01T00:00:01.000Z',
                    id: 'a1',
                    role: 'assistant',
                    text: 'old assistant ' + 'memory '.repeat(6_000),
                },
            ],
        })
        const preflight = createChatContextPreflight({
            memoryService: service,
            resolvedModelSelection,
            threadId,
        })
        const nonMemoryMessages = [new SystemMessage('dynamic system ' + 'system '.repeat(8_000)), new HumanMessage('latest user question')]

        const prepared = await preflight.prepare(memoryMessages => [...nonMemoryMessages, ...memoryMessages])

        expect(prepared.kind).toBe('persistent-compaction')
        expect(prepared.messages.map(message => String(message.content)).join('\n')).toContain(
            'persisted because complete input overflowed'
        )
        expect(prepared.estimatedTokens).toBeLessThanOrEqual(prepared.budget.hardInputTokens)
    })

    it('候选保存抛错时保留原 durable state，并使用 ephemeral fit 继续当前请求', async () => {
        const state = createState()
        const memoryService = createMemoryService(state)
        vi.mocked(memoryService.compactThreadState).mockRejectedValue(new Error('checkpoint unavailable'))
        const preflight = createChatContextPreflight({
            memoryService,
            resolvedModelSelection,
            threadId: 'chat:' + 'e'.repeat(64),
        })

        const nonMemoryMessages = createNearLimitNonMemoryMessages()
        const prepared = await preflight.prepare(memoryMessages => [...nonMemoryMessages, ...memoryMessages])

        expect(prepared.kind).toBe('ephemeral-fit')
        expect(prepared.estimatedTokens).toBeLessThanOrEqual(prepared.budget.hardInputTokens)
        expect(vi.mocked(memoryService.readThreadState).mock.results).toHaveLength(1)
    })

    it('持久化压缩取消时直接中断请求，不降级为 ephemeral fit', async () => {
        const abortController = new AbortController()
        const memoryService = createMemoryService()
        vi.mocked(memoryService.compactThreadState).mockRejectedValue(new DOMException('request cancelled', 'AbortError'))
        const preflight = createChatContextPreflight({
            memoryService,
            resolvedModelSelection,
            signal: abortController.signal,
            threadId: 'chat:' + 'g'.repeat(64),
        })

        await expect(preflight.prepare(memoryMessages => [...createNearLimitNonMemoryMessages(), ...memoryMessages])).rejects.toMatchObject(
            { name: 'AbortError' }
        )
        expect(memoryService.compactThreadState).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Object),
            expect.objectContaining({ signal: abortController.signal })
        )
    })

    it('读取 Chat Memory 时将 run cancellation signal 传到持久化边界', async () => {
        const abortController = new AbortController()
        const memoryService = createMemoryService({
            messages: [],
            pinnedDecisions: [],
            summary: '',
        })
        const preflight = createChatContextPreflight({
            memoryService,
            resolvedModelSelection,
            signal: abortController.signal,
            threadId: 'chat:' + 'r'.repeat(64),
        })

        await preflight.prepare(memoryMessages => [new HumanMessage('latest user question'), ...memoryMessages])

        expect(memoryService.readThreadState).toHaveBeenCalledWith('chat:' + 'r'.repeat(64), {
            signal: abortController.signal,
        })
    })

    it('system、tool 等 non-memory 动态输入自身超限时不触发压缩，而是抛出已有输入过长错误', async () => {
        const memoryService = createMemoryService()
        const preflight = createChatContextPreflight({
            memoryService,
            resolvedModelSelection,
            threadId: 'chat:' + 'c'.repeat(64),
        })

        const nonMemoryMessages = [new SystemMessage('tool payload ' + 'tool '.repeat(30_000))]
        await expect(preflight.prepare(memoryMessages => [...nonMemoryMessages, ...memoryMessages])).rejects.toBeInstanceOf(
            InputLengthExceededError
        )
        expect(memoryService.compactThreadState).not.toHaveBeenCalled()
    })

    it('把 bindTools 实际发送的 tool definition 计入 non-memory 预算', async () => {
        const memoryService = createMemoryService()
        const preflight = createChatContextPreflight({
            memoryService,
            resolvedModelSelection,
            threadId: 'chat:' + 't'.repeat(64),
        })
        await expect(
            preflight.prepare(memoryMessages => [new HumanMessage('latest user question'), ...memoryMessages], createLargeToolDefinitions())
        ).rejects.toBeInstanceOf(InputLengthExceededError)
        expect(memoryService.compactThreadState).not.toHaveBeenCalled()
    })

    it('同一请求的后续动态调用不重复尝试持久化压缩', async () => {
        const memoryService = createMemoryService()
        const preflight = createChatContextPreflight({
            memoryService,
            resolvedModelSelection,
            threadId: 'chat:' + 'd'.repeat(64),
        })

        const nonMemoryMessages = createNearLimitNonMemoryMessages()
        await preflight.prepare(memoryMessages => [...nonMemoryMessages, ...memoryMessages])
        await preflight.prepare(memoryMessages => [...nonMemoryMessages, ...memoryMessages])

        expect(memoryService.compactThreadState).toHaveBeenCalledTimes(1)
    })
})
