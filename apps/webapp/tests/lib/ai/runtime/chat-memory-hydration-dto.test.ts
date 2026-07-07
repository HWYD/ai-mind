import { describe, expect, it } from 'vitest'

import {
    assertNoForbiddenHydrationFields,
    buildThreadHydrationDTO,
    createEmptyThreadState,
    threadHydrationDtoSchema,
} from '@/lib/ai/runtime/chat-memory'

describe('runtime/chat-memory hydration DTO', () => {
    it('builds a safe selected-conversation hydration DTO from the public allowlist', () => {
        expect(
            buildThreadHydrationDTO({
                conversationId: 'conv-1',
                restored: false,
                state: createEmptyThreadState(),
                threadId: `chat-conversation:${'a'.repeat(64)}:${'b'.repeat(64)}`,
            })
        ).toEqual({
            conversationId: 'conv-1',
            threadId: `chat-conversation:${'a'.repeat(64)}:${'b'.repeat(64)}`,
            messages: [],
            pinnedDecisions: [],
            restored: false,
        })
    })

    it('keeps compatibility with threadId-only hydration payloads during the foundational phase', () => {
        expect(
            buildThreadHydrationDTO({
                restored: false,
                state: createEmptyThreadState(),
                threadId: `chat:${'a'.repeat(64)}`,
            })
        ).toEqual({
            threadId: `chat:${'a'.repeat(64)}`,
            messages: [],
            pinnedDecisions: [],
            restored: false,
        })
    })

    it('strict schema rejects unknown raw runtime fields', () => {
        expect(() =>
            threadHydrationDtoSchema.parse({
                conversationId: 'conv-1',
                messages: [],
                pinnedDecisions: [],
                restored: false,
                graphState: {},
            })
        ).toThrow()
    })

    it('strict schema rejects UserMemory fields in hydration payload', () => {
        expect(() =>
            threadHydrationDtoSchema.parse({
                conversationId: 'conv-1',
                messages: [],
                pinnedDecisions: [],
                restored: false,
                userMemory: [],
            })
        ).toThrow()
    })

    it('strict schema rejects registry thread ids in the public hydration payload', () => {
        expect(() =>
            threadHydrationDtoSchema.parse({
                threadId: `chat-registry:${'a'.repeat(64)}`,
                messages: [],
                pinnedDecisions: [],
                restored: false,
            })
        ).toThrow()
    })

    it('forbidden field scanner rejects source metadata and runtime payload fields', () => {
        expect(() =>
            assertNoForbiddenHydrationFields({
                messages: [
                    {
                        displayKind: 'agent-final',
                        source: 'tasklist-agent',
                    },
                ],
                workflowProgress: [],
            })
        ).toThrow()
    })

    it('forbidden field scanner rejects nested raw runtime fields', () => {
        expect(() =>
            assertNoForbiddenHydrationFields({
                messages: [
                    {
                        rawCheckpoint: {},
                    },
                ],
            })
        ).toThrow('rawCheckpoint')
    })

    it('forbidden field scanner does not reject ordinary text values', () => {
        expect(() =>
            assertNoForbiddenHydrationFields({
                messages: [
                    {
                        parts: [
                            {
                                text: '用户只是提到了 tasklist 和 runtimeArtifact 这些普通文本。',
                                type: 'text',
                            },
                        ],
                    },
                ],
            })
        ).not.toThrow()
    })
})
