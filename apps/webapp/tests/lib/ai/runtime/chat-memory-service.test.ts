import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ContextBudget } from '@/lib/ai/model-provider'
import { createChatMemoryService } from '@/lib/ai/runtime/chat-memory'

const budget: ContextBudget = {
    compactionTriggerTokens: 320,
    effectiveWindowTokens: 1000,
    hardInputTokens: 900,
    maxOutputTokens: 100,
    operationalCapTokens: 1000,
    physicalWindowTokens: 1000,
    postCompactionTargetTokens: 180,
    runtimeReserveTokens: 100,
}

function createOversizedState() {
    return {
        messages: Array.from({ length: 6 }, (_, index) => ({
            createdAt: new Date(index).toISOString(),
            id: `message-${index}`,
            role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
            text: `message ${index} ${'token '.repeat(80)}`,
        })),
        pinnedDecisions: ['oldest durable pin', 'newest durable pin'],
        summary: 'durable summary',
    }
}

describe('runtime/chat-memory service', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('disabled mode read empty and write no-op', async () => {
        const service = createChatMemoryService({ checkpointMode: 'off' }, {})
        const result = await service.readThreadState('chat:' + 'a'.repeat(64))

        await expect(
            service.appendCompletedTurn('chat:' + 'a'.repeat(64), {
                assistantText: 'hello',
                userText: 'hi',
            })
        ).resolves.toBeUndefined()
        expect(result).toEqual({
            restored: false,
            state: {
                messages: [],
                pinnedDecisions: [],
                summary: '',
            },
        })
    })

    it('append completed turn and read same thread', async () => {
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {})
        const threadId = `chat:${'b'.repeat(64)}`

        await service.appendCompletedTurn(threadId, {
            assistantMessageId: 'assistant-1',
            assistantText: 'assistant answer',
            userMessageId: 'user-1',
            userText: 'user input',
        })

        const result = await service.readThreadState(threadId)

        expect(result.restored).toBe(true)
        expect(result.state.messages).toEqual([
            expect.objectContaining({
                id: 'user-1',
                role: 'user',
                text: 'user input',
            }),
            expect.objectContaining({
                id: 'assistant-1',
                role: 'assistant',
                text: 'assistant answer',
            }),
        ])
    })

    it('append ignores incomplete empty text', async () => {
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {})
        const threadId = `chat:${'c'.repeat(64)}`

        await service.appendCompletedTurn(threadId, {
            assistantText: '',
            userText: 'user input',
        })

        expect((await service.readThreadState(threadId)).restored).toBe(false)
    })

    it('duplicate assistant message id skips a second final-turn append', async () => {
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {})
        const threadId = `chat:${'c'.repeat(64)}`

        await service.appendCompletedTurn(threadId, {
            assistantMessageId: 'assistant-duplicate',
            assistantText: 'assistant answer',
            userText: 'user input',
        })
        await service.appendCompletedTurn(threadId, {
            assistantMessageId: 'assistant-duplicate',
            assistantText: 'assistant answer',
            userText: 'user input',
        })

        expect((await service.readThreadState(threadId)).state.messages).toHaveLength(2)
    })

    it('duplicate text-only pair without stable ids skips a second append', async () => {
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {})
        const threadId = `chat:${'c'.repeat(64)}`

        await service.appendCompletedTurn(threadId, {
            assistantText: 'assistant answer',
            userText: 'user input',
        })
        await service.appendCompletedTurn(threadId, {
            assistantText: 'assistant answer',
            userText: 'user input',
        })

        expect((await service.readThreadState(threadId)).state.messages).toHaveLength(2)
    })

    it('append completed turns no longer compacts solely because the old message-count threshold is exceeded', async () => {
        const compactionGenerator = vi.fn()
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {}, { compactionGenerator })
        const threadId = `chat:${'g'.repeat(64)}`

        for (let index = 0; index < 3; index += 1) {
            await service.appendCompletedTurn(threadId, {
                assistantText: `assistant ${index}`,
                userText: `user ${index}`,
            })
        }

        expect((await service.readThreadState(threadId)).state.messages).toHaveLength(6)
        expect(compactionGenerator).not.toHaveBeenCalled()
    })

    it('valid persistent candidate atomically writes a new checkpoint and updates lastCompactedAt once', async () => {
        const compactedPinnedDecision = 'newest generated pin'
        const compactedSummary = 'Earlier summary string'
        const service = createChatMemoryService(
            { checkpointMode: 'memory' },
            {},
            {
                compactionGenerator: async () => ({
                    pinnedDecisions: [compactedPinnedDecision],
                    summary: compactedSummary,
                }),
            }
        )
        const threadId = `chat:${'d'.repeat(64)}`
        await service.writeThreadState(threadId, createOversizedState())
        const writeThreadState = vi.spyOn(service, 'writeThreadState')

        await expect(service.compactThreadState(threadId, budget)).resolves.toEqual(
            expect.objectContaining({
                nextPinnedDecisions: [compactedPinnedDecision],
                state: expect.objectContaining({
                    lastCompactedAt: expect.any(String),
                    pinnedDecisions: [compactedPinnedDecision],
                    summary: compactedSummary,
                }),
            })
        )
        expect(writeThreadState).toHaveBeenCalledTimes(1)
        expect((await service.readThreadState(threadId)).state).toEqual(
            expect.objectContaining({
                lastCompactedAt: expect.any(String),
                pinnedDecisions: [compactedPinnedDecision],
                summary: compactedSummary,
            })
        )
    })

    it('invalid, not-smaller, or over-target candidate never writes the durable checkpoint', async () => {
        const service = createChatMemoryService(
            { checkpointMode: 'memory' },
            {},
            {
                compactionGenerator: async () => ({
                    pinnedDecisions: [],
                    summary: 'token '.repeat(1_000),
                }),
            }
        )
        const threadId = `chat:${'e'.repeat(64)}`
        await service.writeThreadState(threadId, createOversizedState())
        const before = (await service.readThreadState(threadId)).state
        const writeThreadState = vi.spyOn(service, 'writeThreadState')

        await expect(service.compactThreadState(threadId, budget)).resolves.toBeNull()
        expect(writeThreadState).not.toHaveBeenCalled()
        expect((await service.readThreadState(threadId)).state).toEqual(before)
    })

    it('compaction failure preserves the durable checkpoint and independently appends the completed final turn', async () => {
        const service = createChatMemoryService(
            { checkpointMode: 'memory' },
            {},
            {
                compactionGenerator: async () => {
                    throw new Error('generator unavailable')
                },
            }
        )
        const threadId = `chat:${'h'.repeat(64)}`
        await service.writeThreadState(threadId, {
            ...createOversizedState(),
            lastCompactedAt: '2026-09-01T00:00:00.000Z',
        })

        await expect(service.compactThreadState(threadId, budget)).resolves.toBeNull()
        await expect(
            service.appendCompletedTurn(threadId, {
                assistantText: '继续回答 Vue Proxy 的问题。',
                userText: '压缩失败后还能继续问吗？',
            })
        ).resolves.toBeUndefined()

        expect(await service.readThreadState(threadId)).toEqual(
            expect.objectContaining({
                state: expect.objectContaining({
                    lastCompactedAt: '2026-09-01T00:00:00.000Z',
                    pinnedDecisions: ['oldest durable pin', 'newest durable pin'],
                    summary: 'durable summary',
                }),
            })
        )
        expect((await service.readThreadState(threadId)).state.messages.slice(-2).map(message => message.text)).toEqual([
            '压缩失败后还能继续问吗？',
            '继续回答 Vue Proxy 的问题。',
        ])
    })

    it('candidate checkpoint write failure keeps the last durable state, then lets the independent raw final-turn append succeed', async () => {
        const service = createChatMemoryService(
            { checkpointMode: 'memory' },
            {},
            {
                compactionGenerator: async () => ({
                    pinnedDecisions: ['new compacted pin'],
                    summary: 'new compacted summary',
                }),
            }
        )
        const threadId = `chat:${'j'.repeat(64)}`
        await service.writeThreadState(threadId, createOversizedState())
        const writeThreadState = vi.spyOn(service, 'writeThreadState').mockRejectedValueOnce(new Error('checkpoint unavailable'))

        await expect(service.compactThreadState(threadId, budget)).rejects.toThrow('checkpoint unavailable')
        await service.appendCompletedTurn(threadId, {
            assistantText: 'Vue Proxy 仍可正常回答。',
            userText: '压缩保存失败后还能继续问吗？',
        })

        expect(writeThreadState).toHaveBeenCalledTimes(2)
        expect((await service.readThreadState(threadId)).state).toEqual(
            expect.objectContaining({
                pinnedDecisions: ['oldest durable pin', 'newest durable pin'],
                summary: 'durable summary',
            })
        )
        expect((await service.readThreadState(threadId)).state.messages.slice(-2).map(message => message.text)).toEqual([
            '压缩保存失败后还能继续问吗？',
            'Vue Proxy 仍可正常回答。',
        ])
    })

    it('raw final-turn append failure preserves the last durable checkpoint without rejecting the completed answer', async () => {
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {})
        const threadId = `chat:${'i'.repeat(64)}`
        await service.appendCompletedTurn(threadId, {
            assistantText: 'existing answer',
            userText: 'existing question',
        })
        const before = await service.readThreadState(threadId)
        const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        vi.spyOn(service, 'writeThreadState').mockRejectedValueOnce(new Error('checkpoint unavailable'))

        await expect(
            service.appendCompletedTurn(threadId, {
                assistantText: 'answer already streamed',
                userText: 'new question',
            })
        ).resolves.toBeUndefined()

        expect(await service.readThreadState(threadId)).toEqual(before)
        expect(consoleInfo).toHaveBeenCalledWith('[chat-memory-service]', expect.stringContaining('"event":"raw-append-failed"'))
    })
})
