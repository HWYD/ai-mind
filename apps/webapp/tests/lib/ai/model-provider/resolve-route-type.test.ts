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
                        plainText: '@demo',
                    },
                })
            )
        ).toBe('chat')
    })

    it('tasklist + demo version-plans reference 解析为 tasklist', () => {
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
                                id: 'demo://version-plans/v0.2.0-controlled-agent-graph.md',
                                label: 'v0.2.0-controlled-agent-graph.md',
                                source: 'local',
                                type: 'resource',
                                uri: 'demo://version-plans/v0.2.0-controlled-agent-graph.md',
                            },
                        ],
                    },
                })
            )
        ).toBe('tasklist')
    })

    it('tasklist + deprecated demo://versions/ reference 仍解析为 chat', () => {
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
                                id: 'demo://versions/v0.2.0-controlled-agent-graph.md',
                                label: 'v0.2.0-controlled-agent-graph.md',
                                source: 'local',
                                type: 'resource',
                                uri: 'demo://versions/v0.2.0-controlled-agent-graph.md',
                            },
                        ],
                    },
                })
            )
        ).toBe('chat')
    })

    it('tasklist 但引用非 demo version plan 时仍解析为 chat', () => {
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
                                id: 'demo://governance/delivery-boundaries.md',
                                label: 'delivery-boundaries.md',
                                source: 'local',
                                type: 'resource',
                                uri: 'demo://governance/delivery-boundaries.md',
                            },
                        ],
                    },
                })
            )
        ).toBe('chat')
    })

    it('tasklist + legacy docs version plan reference 仍解析为 chat', () => {
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
        ).toBe('chat')
    })
})
