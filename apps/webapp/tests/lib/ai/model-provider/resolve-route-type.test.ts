import { describe, expect, it } from 'vitest'

import { resolveRouteType } from '@/lib/ai/model-provider'
import type { ChatRequest } from '@/lib/ai/types/chat'

function createRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
    return {
        conversationId: 'conversation-1',
        messages: [
            {
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        format: 'markdown',
                        text: '你好',
                    },
                ],
            },
        ],
        ...overrides,
    }
}

describe('resolveRouteType', () => {
    it('普通请求默认解析为 chat', () => {
        expect(resolveRouteType(createRequest())).toBe('chat')
    })

    it('summary 命令仍解析为 chat', () => {
        expect(
            resolveRouteType(
                createRequest({
                    composer: {
                        command: {
                            label: '生成摘要',
                            name: 'summary',
                        },
                        plainText: '@docs',
                    },
                })
            )
        ).toBe('chat')
    })

    it('tasklist + version plan reference 解析为 tasklist', () => {
        expect(
            resolveRouteType(
                createRequest({
                    composer: {
                        command: {
                            label: '生成任务清单',
                            name: 'tasklist',
                        },
                        plainText: '',
                        references: [
                            {
                                id: 'docs://versions/v0.2.0-controlled-agent-graph.md',
                                label: 'v0.2.0-controlled-agent-graph.md',
                                source: 'local',
                                type: 'resource',
                                uri: 'docs://versions/v0.2.0-controlled-agent-graph.md',
                            },
                        ],
                    },
                })
            )
        ).toBe('tasklist')
    })

    it('tasklist 但未引用 version plan 时仍解析为 chat', () => {
        expect(
            resolveRouteType(
                createRequest({
                    composer: {
                        command: {
                            label: '生成任务清单',
                            name: 'tasklist',
                        },
                        plainText: '',
                        references: [
                            {
                                id: 'docs://notes/other.md',
                                label: 'other.md',
                                source: 'local',
                                type: 'resource',
                                uri: 'docs://notes/other.md',
                            },
                        ],
                    },
                })
            )
        ).toBe('chat')
    })
})
