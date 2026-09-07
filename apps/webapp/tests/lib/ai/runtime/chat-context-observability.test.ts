import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatContextPreflight } from '@/lib/ai/runtime/chat-context-preflight'
import { type ChatMemoryService, createChatMemoryService } from '@/lib/ai/runtime/chat-memory'

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

function createMemoryService(): Pick<ChatMemoryService, 'compactThreadState' | 'readThreadState'> {
    return {
        compactThreadState: vi.fn().mockResolvedValue(null),
        readThreadState: vi.fn().mockResolvedValue({
            restored: true,
            state: {
                messages: [
                    {
                        createdAt: '2026-09-01T00:00:00.000Z',
                        id: 'u1',
                        role: 'user',
                        text: 'private memory body ' + 'memory '.repeat(2_000),
                    },
                    {
                        createdAt: '2026-09-01T00:00:01.000Z',
                        id: 'a1',
                        role: 'assistant',
                        text: 'private assistant body ' + 'memory '.repeat(2_000),
                    },
                ],
                pinnedDecisions: ['private pinned decision'],
                summary: 'private memory summary',
            },
        }),
    }
}

describe('runtime/chat context observability', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('预检只记录 allowlist 的预算与 fallback 诊断，不记录 raw memory、prompt 或 tool payload', async () => {
        const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const preflight = createChatContextPreflight({
            memoryService: createMemoryService(),
            resolvedModelSelection,
            threadId: 'chat:' + 'a'.repeat(64),
        })
        const toolPayload = 'private tool payload ' + 'tool '.repeat(15_000)

        await preflight.prepare(memoryMessages => [new SystemMessage(toolPayload), new HumanMessage('latest user'), ...memoryMessages])

        const serialized = consoleInfo.mock.calls.filter(call => call[0] === '[chat-context-preflight]').map(call => String(call[1]))

        expect(serialized).not.toHaveLength(0)
        expect(serialized.join('\n')).toContain('"modelId":"ollama/qwen3-8b"')
        expect(serialized.join('\n')).toContain('"hardInputTokens":20480')
        expect(serialized.join('\n')).toContain('"fallback":"ephemeral-fit"')
        expect(serialized.join('\n')).not.toContain('private memory body')
        expect(serialized.join('\n')).not.toContain('private assistant body')
        expect(serialized.join('\n')).not.toContain('private pinned decision')
        expect(serialized.join('\n')).not.toContain('private memory summary')
        expect(serialized.join('\n')).not.toContain('private tool payload')
    })

    it('raw final-turn append 失败只记录 raw-append-failed 枚举，不记录用户或回答文本', async () => {
        const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {})
        const threadId = 'chat:' + 'b'.repeat(64)
        vi.spyOn(service, 'writeThreadState').mockRejectedValueOnce(new Error('checkpoint unavailable'))

        await service.appendCompletedTurn(threadId, {
            assistantText: 'private assistant final answer',
            userText: 'private user question',
        })

        const serialized = consoleInfo.mock.calls
            .filter(call => call[0] === '[chat-memory-service]')
            .map(call => String(call[1]))
            .join('\n')

        expect(serialized).toContain('"event":"raw-append-failed"')
        expect(serialized).not.toContain('private assistant final answer')
        expect(serialized).not.toContain('private user question')
    })
})
