import { describe, expect, it } from 'vitest'

import {
    assertNoForbiddenHydrationFields,
    buildThreadHydrationDTO,
    createEmptyThreadState,
    threadHydrationDtoSchema,
} from '@/lib/ai/runtime/chat-memory'

describe('runtime/chat-memory hydration DTO', () => {
    it('只构造 safe allowlist DTO', () => {
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

    it('strict schema 拒绝 unknown raw runtime fields', () => {
        expect(() =>
            threadHydrationDtoSchema.parse({
                threadId: `chat:${'a'.repeat(64)}`,
                messages: [],
                pinnedDecisions: [],
                restored: false,
                graphState: {},
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

    it('forbidden field scanner 能拒绝嵌套 raw runtime 字段', () => {
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

    it('forbidden field scanner 不误伤普通文本值', () => {
        expect(() =>
            assertNoForbiddenHydrationFields({
                messages: [
                    {
                        parts: [
                            {
                                text: '用户提到了 "tasklist" 和 runtimeArtifact 这些普通文本。',
                                type: 'text',
                            },
                        ],
                    },
                ],
            })
        ).not.toThrow()
    })
})
