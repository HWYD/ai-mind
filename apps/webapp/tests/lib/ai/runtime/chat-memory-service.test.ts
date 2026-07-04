import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT,
    CHAT_MEMORY_RECENT_TURN_LIMIT,
    createChatMemoryService,
} from '@/lib/ai/runtime/chat-memory'

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

    it('exceeds threshold, compacts thread state, and keeps recent messages bounded', async () => {
        const compactedPinnedDecision = 'Decision: keep text-only memory.'
        const compactedSummary = 'Earlier summary string'
        const onStatus = vi.fn()
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

        for (let index = 0; index < CHAT_MEMORY_RECENT_TURN_LIMIT + 1; index += 1) {
            await service.appendCompletedTurn(
                threadId,
                {
                    assistantMessageId: `assistant-${index}`,
                    assistantText: `assistant ${index}`,
                    userMessageId: `user-${index}`,
                    userText: index === 0 ? compactedPinnedDecision : `user ${index}`,
                },
                {
                    onStatus,
                }
            )
        }

        const result = await service.readThreadState(threadId)

        expect(result.state.messages).toHaveLength(CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT)
        expect(result.state.summary).toContain(compactedSummary)
        expect(result.state.pinnedDecisions).toContain(compactedPinnedDecision)
        expect(onStatus).toHaveBeenNthCalledWith(1, {
            status: 'started',
            message: '自动压缩上下文中',
        })
        expect(onStatus).toHaveBeenNthCalledWith(2, {
            status: 'succeeded',
            message: '上下文已自动压缩',
            pinnedDecisionCount: 1,
            summaryLength: compactedSummary.length,
        })
    })

    it('compaction failure keeps the previous thread state intact', async () => {
        const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const onStatus = vi.fn()
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {}, { compactionGenerator: async () => ({ invalid: true }) })
        const threadId = `chat:${'e'.repeat(64)}`

        for (let index = 0; index < CHAT_MEMORY_RECENT_TURN_LIMIT; index += 1) {
            await service.appendCompletedTurn(threadId, {
                assistantText: `assistant ${index}`,
                userText: `user ${index}`,
            })
        }

        const before = await service.readThreadState(threadId)

        await service.appendCompletedTurn(
            threadId,
            {
                assistantText: 'new assistant',
                userText: 'new user',
            },
            {
                onStatus,
            }
        )

        expect(await service.readThreadState(threadId)).toEqual(before)
        expect(consoleInfoSpy).toHaveBeenCalledWith('[chat-memory-service]', expect.stringContaining('"event":"compaction-write-skipped"'))
        expect(onStatus).toHaveBeenNthCalledWith(1, {
            status: 'started',
            message: '自动压缩上下文中',
        })
        expect(onStatus).toHaveBeenNthCalledWith(2, {
            status: 'failed',
            message: '上下文自动压缩失败',
        })
    })

    it('compaction write error emits failed status before rethrowing', async () => {
        const compactedSummary = 'Earlier summary string'
        const onStatus = vi.fn()
        const service = createChatMemoryService(
            { checkpointMode: 'memory' },
            {},
            {
                compactionGenerator: async () => ({
                    pinnedDecisions: [],
                    summary: compactedSummary,
                }),
            }
        )
        const threadId = `chat:${'f'.repeat(64)}`

        for (let index = 0; index < CHAT_MEMORY_RECENT_TURN_LIMIT; index += 1) {
            await service.appendCompletedTurn(threadId, {
                assistantText: `assistant ${index}`,
                userText: `user ${index}`,
            })
        }

        vi.spyOn(service, 'writeThreadState').mockRejectedValueOnce(new Error('checkpoint unavailable'))

        await expect(
            service.appendCompletedTurn(
                threadId,
                {
                    assistantText: 'new assistant',
                    userText: 'new user',
                },
                {
                    onStatus,
                }
            )
        ).rejects.toThrow('checkpoint unavailable')

        expect(onStatus).toHaveBeenNthCalledWith(1, {
            status: 'started',
            message: '自动压缩上下文中',
        })
        expect(onStatus).toHaveBeenNthCalledWith(2, {
            status: 'failed',
            message: '上下文自动压缩失败',
        })
    })
})
