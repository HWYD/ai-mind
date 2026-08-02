/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UserMessage } from '@/components/chat/message-list/messages/user-message'

describe('UserMessage', () => {
    it('renders submitted resource chips with the menu title instead of a syntax-prefixed path', () => {
        render(
            <UserMessage
                isCopied={false}
                isDeleteDisabled={false}
                message={{
                    id: 'user-delivery-chain',
                    role: 'user',
                    createdAt: '2026-08-01T10:00:00.000Z',
                    parts: [
                        {
                            id: 'composer-display',
                            type: 'text',
                            format: 'markdown',
                            text: '',
                            displaySegments: [
                                { type: 'command', command: { name: 'delivery-chain', label: '生成交付计划' } },
                                { type: 'text', text: ' ' },
                                {
                                    type: 'resource',
                                    reference: {
                                        id: 'demo:scenario:register-login/requirement.md',
                                        label: '注册登录系统',
                                        source: 'local',
                                        type: 'resource',
                                        uri: 'demo://scenarios/register-login/requirement.md',
                                    },
                                },
                            ],
                        },
                    ],
                }}
                onCopy={vi.fn()}
                onDelete={vi.fn()}
            />
        )

        expect(screen.getByText('生成交付计划')).toBeTruthy()
        expect(screen.getByText('注册登录系统')).toBeTruthy()
        expect(screen.queryByText('@注册登录系统')).toBeNull()
    })
})
