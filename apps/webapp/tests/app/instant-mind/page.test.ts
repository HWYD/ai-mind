/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatModelsInitialState } from '@/lib/ai/models'

const initialChatModelsState: ChatModelsInitialState = {
    defaultModelId: 'qwen/qwen3.6-flash',
    modelError: null,
    models: [
        {
            family: 'qwen',
            id: 'qwen/qwen3.6-flash',
            label: 'qwen3.6-flash',
            provider: 'qwen',
        },
    ],
}

beforeEach(() => {
    vi.resetModules()
})

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

describe('/instant-mind route page', () => {
    it('waits for request connection before resolving initial model state', async () => {
        let releaseConnection: (() => void) | undefined
        const connectionMock = vi.fn().mockImplementation(
            () =>
                new Promise<void>(resolve => {
                    releaseConnection = resolve
                })
        )
        const resolveChatModelsInitialStateMock = vi.fn(() => initialChatModelsState)

        vi.doMock('next/server', () => ({
            connection: connectionMock,
        }))
        vi.doMock('@/components/instamind/instantmind-page', () => ({
            default: (props: unknown) => props,
        }))
        vi.doMock('@/lib/ai/model-provider', () => ({
            resolveChatModelsInitialState: resolveChatModelsInitialStateMock,
        }))

        const { default: InstantMindRoutePage } = await import('@/app/instant-mind/page')
        const pagePromise = InstantMindRoutePage()

        expect(connectionMock).toHaveBeenCalledTimes(1)
        expect(resolveChatModelsInitialStateMock).not.toHaveBeenCalled()

        releaseConnection?.()
        const result = await pagePromise

        expect(resolveChatModelsInitialStateMock).toHaveBeenCalledTimes(1)
        expect((result as { props?: { initialChatModelsState?: unknown } }).props?.initialChatModelsState).toEqual(initialChatModelsState)
    })
})

describe('InstantMindPage integration', () => {
    it('locks conversation controls during streaming but keeps the composer available for stop', async () => {
        const createConversation = vi.fn()
        const selectConversation = vi.fn()
        const cancel = vi.fn()
        const useConversationSessionsMock = vi.fn(() => ({
            conversations: [
                {
                    id: 'conv-a',
                    title: 'Conversation A',
                    selected: true,
                    hasMessages: true,
                    createdAt: '2026-07-05T10:00:00.000Z',
                    lastActiveAt: '2026-07-05T10:00:00.000Z',
                },
            ],
            createConversation,
            deleteConversation: vi.fn(),
            error: 'Conversation registry is unavailable.',
            handleConversationPromoted: vi.fn(),
            interactionDisabled: false,
            isDraft: false,
            isLoading: false,
            isMutating: false,
            selectedConversation: {
                id: 'conv-a',
                title: 'Conversation A',
                selected: true,
                hasMessages: true,
                createdAt: '2026-07-05T10:00:00.000Z',
                lastActiveAt: '2026-07-05T10:00:00.000Z',
            },
            selectedConversationId: 'conv-a',
            selectConversation,
        }))

        vi.doUnmock('@/components/instamind/instantmind-page')
        vi.doMock('next/image', () => ({
            default: (props: Record<string, unknown>) => React.createElement('img', props),
        }))
        vi.doMock('next/link', () => ({
            default: ({ children, ...props }: Record<string, unknown>) => React.createElement('a', props, children as React.ReactNode),
        }))
        vi.doMock('@/components/chat/composer/chat-composer', () => ({
            ChatComposer: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'chat-composer',
                    'data-disabled': String(props.disabled),
                    'data-placeholder': String(props.placeholder ?? ''),
                    'data-status': String(props.status),
                    'data-submit-disabled': String(props.submitDisabled),
                }),
        }))
        vi.doMock('@/components/chat/message-list/chat-message-list', () => ({
            ChatMessageList: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'chat-message-list',
                    'data-actions-disabled': String(props.actionsDisabled),
                }),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-sidebar', () => ({
            ConversationSidebar: (props: Record<string, unknown>) =>
                React.createElement(
                    React.Fragment,
                    null,
                    React.createElement('div', {
                        'data-testid': 'conversation-sidebar',
                        'data-collapsed': String(props.collapsed),
                        'data-disabled': String(props.disabled),
                        'data-has-delete': String(typeof props.onDeleteConversation === 'function'),
                    }),
                    React.createElement(
                        'button',
                        {
                            type: 'button',
                            'aria-label': String(props.collapsed ? '展开会话侧边栏' : '折叠会话侧边栏'),
                            onClick: () => (props.onToggleCollapsed as (() => void) | undefined)?.(),
                        },
                        'toggle'
                    )
                ),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-mobile-selector', () => ({
            ConversationMobileSelector: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'conversation-mobile-selector',
                    'data-disabled': String(props.disabled),
                    'data-title': String(props.selectedConversationTitle),
                }),
        }))
        vi.doMock('@/components/instamind/human-review/human-review-composer-panel', () => ({
            HumanReviewComposerPanel: () => React.createElement('div', { 'data-testid': 'human-review-panel' }),
        }))
        vi.doMock('@/components/instamind/thread-memory-status-hint', () => ({
            ThreadMemoryStatusHint: () => React.createElement('div', { 'data-testid': 'thread-memory-status-hint' }),
        }))
        vi.doMock('@/components/instamind/use-chat-scroll-policy', () => ({
            useChatScrollPolicy: () => ({
                composerContainerRef: { current: null },
                composerOverlayInset: 144,
                messageContentRef: { current: null },
                scrollViewportRef: { current: null },
                cancelConversationEntryPositioning: vi.fn(),
                showScrollToBottom: false,
                resetScrollPolicyForNewTurn: vi.fn(),
                restoreFollowAndScrollToEnd: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-models', () => ({
            useChatModels: () => ({
                hasAvailableModels: true,
                isLoading: false,
                model: 'qwen/qwen3.6-flash',
                modelError: null,
                modelGroups: [],
                setModel: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-stream', () => ({
            useChatStream: () => ({
                imageQuotaError: '今日生图次数已用完（3 次）。',
                messages: [],
                status: 'streaming',
                hydrationStatus: 'ready',
                messageConversationId: 'conv-a',
                threadMemoryStatusHint: null,
                pendingInterrupt: null,
                sendMessage: vi.fn(),
                retryHydration: vi.fn(),
                resumeAgentRun: vi.fn(),
                cancel,
                deleteUserTurn: vi.fn(),
                regenerateLastTurn: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/conversation-session/use-conversation-sessions', () => ({
            useConversationSessions: useConversationSessionsMock,
        }))

        const { default: InstantMindPage } = await import('@/components/instamind/instantmind-page')

        render(React.createElement(InstantMindPage, { initialChatModelsState }))

        await waitFor(() => {
            const lastCall = useConversationSessionsMock.mock.calls[useConversationSessionsMock.mock.calls.length - 1] as unknown as
                | [{ interactionLocked: boolean }]
                | undefined

            expect(lastCall?.[0]?.interactionLocked).toBe(true)
        })

        expect(document.querySelector('[data-slot="alert"]')).toBeTruthy()
        expect(screen.getByText('今日生图次数已达上限').textContent).toBe('今日生图次数已达上限')
        expect(screen.getByText('今日生图次数已用完（3 次）。').textContent).toBe('今日生图次数已用完（3 次）。')
        expect(screen.getByText('会话列表暂时不可用').textContent).toBe('会话列表暂时不可用')
        expect(screen.getByText('Conversation registry is unavailable.').textContent).toBe('Conversation registry is unavailable.')
        expect(screen.getByTestId('conversation-sidebar').getAttribute('data-disabled')).toBe('true')
        expect(screen.getByTestId('conversation-sidebar').getAttribute('data-has-delete')).toBe('true')
        expect(screen.getByTestId('conversation-mobile-selector').getAttribute('data-disabled')).toBe('true')
        expect(screen.getByTestId('conversation-mobile-selector').getAttribute('data-title')).toBe('Conversation A')
        expect(screen.getByTestId('chat-composer').getAttribute('data-disabled')).toBe('false')
        expect(screen.getByTestId('chat-composer').getAttribute('data-submit-disabled')).toBe('false')
        expect(screen.getByTestId('chat-composer').getAttribute('data-status')).toBe('streaming')
        expect(screen.getByTestId('chat-message-list').getAttribute('data-actions-disabled')).toBe('false')
        expect(createConversation).not.toHaveBeenCalled()
        expect(selectConversation).not.toHaveBeenCalled()
        expect(cancel).not.toHaveBeenCalled()
    }, 15000)

    it('keeps the composer placeholder empty without a selected conversation and toggles sidebar collapse state', async () => {
        const chatMessageListPropsSpy = vi.fn()

        vi.doUnmock('@/components/instamind/instantmind-page')
        vi.doMock('next/image', () => ({
            default: (props: Record<string, unknown>) => React.createElement('img', props),
        }))
        vi.doMock('next/link', () => ({
            default: ({ children, ...props }: Record<string, unknown>) => React.createElement('a', props, children as React.ReactNode),
        }))
        vi.doMock('@/components/chat/composer/chat-composer', () => ({
            ChatComposer: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'chat-composer',
                    'data-disabled': String(props.disabled),
                    'data-placeholder': String(props.placeholder ?? ''),
                    'data-submit-disabled': String(props.submitDisabled),
                }),
        }))
        vi.doMock('@/components/chat/message-list/chat-message-list', () => ({
            ChatMessageList: (props: Record<string, unknown>) => {
                chatMessageListPropsSpy(props)
                return React.createElement('div', { 'data-testid': 'chat-message-list' })
            },
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-sidebar', () => ({
            ConversationSidebar: (props: Record<string, unknown>) =>
                React.createElement(
                    React.Fragment,
                    null,
                    React.createElement('div', {
                        'data-testid': 'conversation-sidebar',
                        'data-collapsed': String(props.collapsed),
                    }),
                    React.createElement(
                        'button',
                        {
                            type: 'button',
                            'aria-label': String(props.collapsed ? '展开会话侧边栏' : '折叠会话侧边栏'),
                            onClick: () => (props.onToggleCollapsed as (() => void) | undefined)?.(),
                        },
                        'toggle'
                    )
                ),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-mobile-selector', () => ({
            ConversationMobileSelector: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'conversation-mobile-selector',
                    'data-title': String(props.selectedConversationTitle),
                }),
        }))
        vi.doMock('@/components/instamind/human-review/human-review-composer-panel', () => ({
            HumanReviewComposerPanel: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/thread-memory-status-hint', () => ({
            ThreadMemoryStatusHint: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/use-chat-scroll-policy', () => ({
            useChatScrollPolicy: () => ({
                composerContainerRef: { current: null },
                composerOverlayInset: 144,
                messageContentRef: { current: null },
                scrollViewportRef: { current: null },
                cancelConversationEntryPositioning: vi.fn(),
                showScrollToBottom: false,
                resetScrollPolicyForNewTurn: vi.fn(),
                restoreFollowAndScrollToEnd: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-models', () => ({
            useChatModels: () => ({
                hasAvailableModels: true,
                isLoading: false,
                model: 'qwen/qwen3.6-flash',
                modelError: null,
                modelGroups: [],
                setModel: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-stream', () => ({
            useChatStream: () => ({
                messages: [],
                status: 'ready',
                hydrationStatus: 'idle',
                messageConversationId: null,
                threadMemoryStatusHint: null,
                pendingInterrupt: null,
                sendMessage: vi.fn(),
                retryHydration: vi.fn(),
                resumeAgentRun: vi.fn(),
                cancel: vi.fn(),
                deleteUserTurn: vi.fn(),
                regenerateLastTurn: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/conversation-session/use-conversation-sessions', () => ({
            useConversationSessions: () => ({
                conversations: [],
                createConversation: vi.fn(),
                error: null,
                handleConversationPromoted: vi.fn(),
                interactionDisabled: true,
                isDraft: true,
                isLoading: true,
                isMutating: false,
                selectedConversation: null,
                selectedConversationId: null,
                selectConversation: vi.fn(),
            }),
        }))

        const { default: InstantMindPage } = await import('@/components/instamind/instantmind-page')

        render(React.createElement(InstantMindPage, { initialChatModelsState }))

        expect(screen.getByTestId('chat-composer').getAttribute('data-disabled')).toBe('false')
        expect(screen.getByTestId('chat-composer').getAttribute('data-submit-disabled')).toBe('true')
        expect(screen.getByTestId('chat-composer').getAttribute('data-placeholder')).toBe('')
        expect(screen.getByTestId('conversation-mobile-selector').getAttribute('data-title')).toBe('新会话')
        expect(screen.getByTestId('conversation-sidebar').getAttribute('data-collapsed')).toBe('false')

        const mainColumn = document.querySelector('[data-slot="chat-main-column"]')
        const composerColumn = document.querySelector('[data-slot="chat-composer-column"]')
        const composerShell = document.querySelector('[data-slot="chat-composer-shell"]')
        const composerGradientMask = document.querySelector('[data-slot="chat-composer-gradient-mask"]')
        const messageContent = document.querySelector('[data-slot="chat-message-content"]') as HTMLElement | null
        const messageViewport = document.querySelector('[data-slot="chat-message-viewport"]') as HTMLElement | null

        expect(mainColumn?.className).toContain('max-w-[var(--chat-content-column-width)]')
        expect(composerColumn?.className).toContain('max-w-[var(--chat-content-column-width)]')
        expect(composerColumn?.parentElement?.className).not.toContain('max-w-4xl')
        expect(messageViewport?.className).toContain('h-full')
        expect(messageViewport?.className).toContain('overflow-y-auto')
        expect(messageViewport?.style.getPropertyValue('scrollbar-gutter')).toBe('stable both-edges')
        expect(composerShell?.className).toContain('fixed')
        expect(composerShell?.className).toContain('bottom-0')
        expect(composerShell?.className).toContain('right-0')
        expect(composerShell?.className).not.toContain('bg-gradient-to-t')
        expect(composerShell?.className).toContain('pt-12')
        expect(composerShell?.className).toContain('transition-[left]')
        expect(composerGradientMask?.className).toContain('bg-gradient-to-t')
        expect(composerGradientMask?.className).toContain('max-w-[calc(var(--chat-content-column-width)+4rem)]')
        expect(composerShell?.firstElementChild?.className).toContain('pointer-events-none')
        expect(composerColumn?.className).toContain('pointer-events-auto')
        const instantMindPage = document.querySelector('main') as HTMLElement | null
        expect(instantMindPage?.className).toContain('h-dvh')
        expect(instantMindPage?.className).toContain('overflow-hidden')
        expect(instantMindPage?.getAttribute('data-slot')).toBe('instant-mind-page')
        expect(instantMindPage?.style.getPropertyValue('--chat-scrollbar-width')).toBe('')
        expect(messageViewport?.contains(screen.getByTestId('conversation-mobile-selector'))).toBe(true)
        expect(messageContent?.style.paddingBottom).toBe('')
        expect(chatMessageListPropsSpy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                bottomInset: 198,
                scrollParent: messageViewport,
            })
        )
        expect(chatMessageListPropsSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({
                scrollParent: null,
            })
        )
        fireEvent.click(screen.getByRole('button', { name: '折叠会话侧边栏' }))

        await waitFor(() => {
            expect(screen.getByTestId('conversation-sidebar').getAttribute('data-collapsed')).toBe('true')
        })
    }, 10000)

    it('shows a message-shaped hydration skeleton while switching persisted conversations', async () => {
        vi.doUnmock('@/components/instamind/instantmind-page')
        vi.doMock('next/image', () => ({
            default: (props: Record<string, unknown>) => React.createElement('img', props),
        }))
        vi.doMock('next/link', () => ({
            default: ({ children, ...props }: Record<string, unknown>) => React.createElement('a', props, children as React.ReactNode),
        }))
        vi.doMock('@/components/chat/composer/chat-composer', () => ({
            ChatComposer: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'chat-composer',
                    'data-submit-disabled': String(props.submitDisabled),
                }),
        }))
        vi.doMock('@/components/chat/message-list/chat-message-list', () => ({
            ChatMessageList: () => React.createElement('div', { 'data-testid': 'chat-message-list' }),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-sidebar', () => ({
            ConversationSidebar: () => React.createElement('div', { 'data-testid': 'conversation-sidebar' }),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-mobile-selector', () => ({
            ConversationMobileSelector: () => React.createElement('div', { 'data-testid': 'conversation-mobile-selector' }),
        }))
        vi.doMock('@/components/instamind/human-review/human-review-composer-panel', () => ({
            HumanReviewComposerPanel: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/thread-memory-status-hint', () => ({
            ThreadMemoryStatusHint: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/use-chat-scroll-policy', () => ({
            useChatScrollPolicy: () => ({
                composerContainerRef: { current: null },
                scrollViewportRef: { current: null },
                cancelConversationEntryPositioning: vi.fn(),
                showScrollToBottom: false,
                resetScrollPolicyForNewTurn: vi.fn(),
                restoreFollowAndScrollToEnd: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-models', () => ({
            useChatModels: () => ({
                hasAvailableModels: true,
                isLoading: false,
                model: 'qwen/qwen3.6-flash',
                modelError: null,
                modelGroups: [],
                setModel: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-stream', () => ({
            useChatStream: () => ({
                messages: [],
                status: 'ready',
                hydrationStatus: 'loading',
                messageConversationId: null,
                threadMemoryStatusHint: null,
                pendingInterrupt: null,
                sendMessage: vi.fn(),
                retryHydration: vi.fn(),
                resumeAgentRun: vi.fn(),
                cancel: vi.fn(),
                deleteUserTurn: vi.fn(),
                regenerateLastTurn: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/conversation-session/use-conversation-sessions', () => ({
            useConversationSessions: () => ({
                conversations: [
                    {
                        id: 'conv-a',
                        title: 'Conversation A',
                        selected: true,
                        hasMessages: true,
                        createdAt: '2026-07-05T10:00:00.000Z',
                        lastActiveAt: '2026-07-05T10:00:00.000Z',
                    },
                ],
                createConversation: vi.fn(),
                error: null,
                handleConversationPromoted: vi.fn(),
                interactionDisabled: false,
                isDraft: false,
                isLoading: false,
                isMutating: false,
                selectedConversation: {
                    id: 'conv-a',
                    title: 'Conversation A',
                    selected: true,
                    hasMessages: true,
                    createdAt: '2026-07-05T10:00:00.000Z',
                    lastActiveAt: '2026-07-05T10:00:00.000Z',
                },
                selectedConversationId: 'conv-a',
                selectConversation: vi.fn(),
            }),
        }))

        const { default: InstantMindPage } = await import('@/components/instamind/instantmind-page')

        render(React.createElement(InstantMindPage, { initialChatModelsState }))

        expect(screen.getByRole('status', { name: '会话加载中' })).toBeTruthy()
        expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
        expect(screen.queryByTestId('chat-message-list')).toBeNull()
        expect(screen.getByTestId('chat-composer').getAttribute('data-submit-disabled')).toBe('true')
    })

    it('shows a local alert for hydration failure and retries on demand', async () => {
        const retryHydration = vi.fn()

        vi.doUnmock('@/components/instamind/instantmind-page')
        vi.doMock('next/image', () => ({
            default: (props: Record<string, unknown>) => React.createElement('img', props),
        }))
        vi.doMock('next/link', () => ({
            default: ({ children, ...props }: Record<string, unknown>) => React.createElement('a', props, children as React.ReactNode),
        }))
        vi.doMock('@/components/chat/composer/chat-composer', () => ({
            ChatComposer: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'chat-composer',
                    'data-submit-disabled': String(props.submitDisabled),
                }),
        }))
        vi.doMock('@/components/chat/message-list/chat-message-list', () => ({
            ChatMessageList: () => React.createElement('div', { 'data-testid': 'chat-message-list' }),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-sidebar', () => ({
            ConversationSidebar: () => React.createElement('div', { 'data-testid': 'conversation-sidebar' }),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-mobile-selector', () => ({
            ConversationMobileSelector: () => React.createElement('div', { 'data-testid': 'conversation-mobile-selector' }),
        }))
        vi.doMock('@/components/instamind/human-review/human-review-composer-panel', () => ({
            HumanReviewComposerPanel: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/thread-memory-status-hint', () => ({
            ThreadMemoryStatusHint: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/use-chat-scroll-policy', () => ({
            useChatScrollPolicy: () => ({
                composerContainerRef: { current: null },
                scrollViewportRef: { current: null },
                cancelConversationEntryPositioning: vi.fn(),
                showScrollToBottom: false,
                resetScrollPolicyForNewTurn: vi.fn(),
                restoreFollowAndScrollToEnd: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-models', () => ({
            useChatModels: () => ({
                hasAvailableModels: true,
                isLoading: false,
                model: 'qwen/qwen3.6-flash',
                modelError: null,
                modelGroups: [],
                setModel: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-stream', () => ({
            useChatStream: () => ({
                messages: [],
                status: 'ready',
                hydrationStatus: 'failed',
                messageConversationId: null,
                threadMemoryStatusHint: null,
                pendingInterrupt: null,
                sendMessage: vi.fn(),
                retryHydration,
                resumeAgentRun: vi.fn(),
                cancel: vi.fn(),
                deleteUserTurn: vi.fn(),
                regenerateLastTurn: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/conversation-session/use-conversation-sessions', () => ({
            useConversationSessions: () => ({
                conversations: [
                    {
                        id: 'conv-a',
                        title: 'Conversation A',
                        selected: true,
                        hasMessages: true,
                        createdAt: '2026-07-05T10:00:00.000Z',
                        lastActiveAt: '2026-07-05T10:00:00.000Z',
                    },
                ],
                createConversation: vi.fn(),
                error: null,
                handleConversationPromoted: vi.fn(),
                interactionDisabled: false,
                isDraft: false,
                isLoading: false,
                isMutating: false,
                selectedConversation: {
                    id: 'conv-a',
                    title: 'Conversation A',
                    selected: true,
                    hasMessages: true,
                    createdAt: '2026-07-05T10:00:00.000Z',
                    lastActiveAt: '2026-07-05T10:00:00.000Z',
                },
                selectedConversationId: 'conv-a',
                selectConversation: vi.fn(),
            }),
        }))

        const { default: InstantMindPage } = await import('@/components/instamind/instantmind-page')

        render(React.createElement(InstantMindPage, { initialChatModelsState }))

        expect(document.querySelector('[data-slot="alert"]')).toBeTruthy()
        expect(screen.getByText('会话加载失败').textContent).toBe('会话加载失败')
        expect(screen.queryByTestId('chat-message-list')).toBeNull()
        expect(screen.getByTestId('chat-composer').getAttribute('data-submit-disabled')).toBe('true')

        fireEvent.click(screen.getByRole('button', { name: '重试加载' }))

        expect(retryHydration).toHaveBeenCalledTimes(1)
    })

    it('shows read-only local cache notice and disables interactive actions', async () => {
        const retryHydration = vi.fn()
        const retryRecovery = vi.fn()

        vi.doUnmock('@/components/instamind/instantmind-page')
        vi.doMock('next/image', () => ({
            default: (props: Record<string, unknown>) => React.createElement('img', props),
        }))
        vi.doMock('next/link', () => ({
            default: ({ children, ...props }: Record<string, unknown>) => React.createElement('a', props, children as React.ReactNode),
        }))
        vi.doMock('@/components/chat/composer/chat-composer', () => ({
            ChatComposer: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'chat-composer',
                    'data-submit-disabled': String(props.submitDisabled),
                }),
        }))
        vi.doMock('@/components/chat/message-list/chat-message-list', () => ({
            ChatMessageList: () => React.createElement('div', { 'data-testid': 'chat-message-list' }),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-sidebar', () => ({
            ConversationSidebar: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'conversation-sidebar',
                    'data-create-disabled': String(props.createDisabled),
                    'data-delete-disabled': String(props.deleteDisabled),
                    'data-selection-disabled': String(props.disabled),
                }),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-mobile-selector', () => ({
            ConversationMobileSelector: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'conversation-mobile-selector',
                    'data-create-disabled': String(props.createDisabled),
                    'data-delete-disabled': String(props.deleteDisabled),
                    'data-selection-disabled': String(props.disabled),
                }),
        }))
        vi.doMock('@/components/instamind/human-review/human-review-composer-panel', () => ({
            HumanReviewComposerPanel: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/thread-memory-status-hint', () => ({
            ThreadMemoryStatusHint: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/use-chat-scroll-policy', () => ({
            useChatScrollPolicy: () => ({
                composerContainerRef: { current: null },
                scrollViewportRef: { current: null },
                cancelConversationEntryPositioning: vi.fn(),
                showScrollToBottom: false,
                resetScrollPolicyForNewTurn: vi.fn(),
                restoreFollowAndScrollToEnd: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-models', () => ({
            useChatModels: () => ({
                hasAvailableModels: true,
                isLoading: false,
                model: 'qwen/qwen3.6-flash',
                modelError: null,
                modelGroups: [],
                setModel: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-stream', () => ({
            useChatStream: () => ({
                messages: [],
                status: 'ready',
                hydrationStatus: 'ready',
                messageConversationId: 'conv-a',
                readOnlyCacheMessage: '当前显示的是浏览器本地只读缓存，服务端会话上下文暂时不可用。',
                threadMemoryStatusHint: null,
                pendingInterrupt: null,
                sendMessage: vi.fn(),
                retryHydration,
                resumeAgentRun: vi.fn(),
                cancel: vi.fn(),
                deleteUserTurn: vi.fn(),
                regenerateLastTurn: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/conversation-session/use-conversation-sessions', () => ({
            useConversationSessions: () => ({
                conversations: [
                    {
                        id: 'conv-a',
                        title: 'Conversation A',
                        selected: true,
                        hasMessages: true,
                        createdAt: '2026-07-05T10:00:00.000Z',
                        lastActiveAt: '2026-07-05T10:00:00.000Z',
                    },
                ],
                createConversation: vi.fn(),
                error: null,
                handleConversationPromoted: vi.fn(),
                interactionDisabled: false,
                isDraft: false,
                isLoading: false,
                isMutating: false,
                isReadOnlyCache: false,
                readOnlyCacheMessage: null,
                retryRecovery,
                selectedConversation: {
                    id: 'conv-a',
                    title: 'Conversation A',
                    selected: true,
                    hasMessages: true,
                    createdAt: '2026-07-05T10:00:00.000Z',
                    lastActiveAt: '2026-07-05T10:00:00.000Z',
                },
                selectedConversationId: 'conv-a',
                selectConversation: vi.fn(),
            }),
        }))

        const { default: InstantMindPage } = await import('@/components/instamind/instantmind-page')

        render(React.createElement(InstantMindPage, { initialChatModelsState }))

        expect(screen.getByText('本地只读缓存').textContent).toBe('本地只读缓存')
        expect(screen.getByText('当前显示的是浏览器本地只读缓存，服务端会话上下文暂时不可用。').textContent).toContain(
            '服务端会话上下文暂时不可用'
        )
        expect(screen.getByTestId('conversation-sidebar').getAttribute('data-selection-disabled')).toBe('false')
        expect(screen.getByTestId('conversation-sidebar').getAttribute('data-create-disabled')).toBe('true')
        expect(screen.getByTestId('conversation-sidebar').getAttribute('data-delete-disabled')).toBe('true')
        expect(screen.getByTestId('conversation-mobile-selector').getAttribute('data-selection-disabled')).toBe('false')
        expect(screen.getByTestId('conversation-mobile-selector').getAttribute('data-create-disabled')).toBe('true')
        expect(screen.getByTestId('conversation-mobile-selector').getAttribute('data-delete-disabled')).toBe('true')
        expect(screen.getByTestId('chat-composer').getAttribute('data-submit-disabled')).toBe('true')
        expect(screen.getByRole('button', { name: '重试连接服务端' })).toBeTruthy()
        expect(screen.getByRole('button', { name: '重试连接服务端' }).getAttribute('aria-describedby')).toBe(
            'instamind-readonly-cache-description'
        )

        fireEvent.click(screen.getByRole('button', { name: '重试连接服务端' }))

        expect(retryRecovery).toHaveBeenCalledTimes(1)
        expect(retryHydration).toHaveBeenCalledTimes(1)
    })

    it('positions a newly hydrated current conversation before revealing its history', async () => {
        const cancelConversationEntryPositioning = vi.fn()
        let finishEntryPositioningA: (() => void) | undefined
        let finishEntryPositioningB: (() => void) | undefined
        let startEntryPositioning: FrameRequestCallback | undefined
        const positionConversationEntryAtBottom = vi.fn((target: { conversationId: string }, onPositioned?: () => void) => {
            if (target.conversationId === 'conv-entry-a') {
                finishEntryPositioningA = onPositioned
            } else {
                finishEntryPositioningB = onPositioned
            }
        })
        let selectedConversationId = 'conv-entry-a'
        const scrollViewportRef = { current: null as HTMLDivElement | null }

        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            startEntryPositioning = callback
            return 1
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

        vi.doUnmock('@/components/instamind/instantmind-page')
        vi.doMock('@/components/chat/composer/chat-composer', () => ({
            ChatComposer: () => React.createElement('div', { 'data-testid': 'chat-composer' }),
        }))
        vi.doMock('@/components/chat/message-list/chat-message-list', () => ({
            ChatMessageList: () => React.createElement('div', { 'data-testid': 'chat-message-list' }),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-sidebar', () => ({
            ConversationSidebar: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-mobile-selector', () => ({
            ConversationMobileSelector: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/human-review/human-review-composer-panel', () => ({
            HumanReviewComposerPanel: () => null,
        }))
        vi.doMock('@/components/instamind/thread-memory-status-hint', () => ({
            ThreadMemoryStatusHint: () => null,
        }))
        vi.doMock('@/components/instamind/use-chat-scroll-policy', () => ({
            useChatScrollPolicy: () => ({
                composerContainerRef: { current: null },
                scrollViewportRef,
                cancelConversationEntryPositioning,
                positionConversationEntryAtBottom,
                resetScrollPolicyForNewTurn: vi.fn(),
                restoreFollowAndScrollToEnd: vi.fn(),
                showScrollToBottom: true,
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-models', () => ({
            useChatModels: () => ({
                hasAvailableModels: true,
                isLoading: false,
                model: 'qwen/qwen3.6-flash',
                modelError: null,
                modelGroups: [],
                setModel: vi.fn(),
            }),
        }))
        vi.doMock('@/components/instamind/use-chat-stream', () => ({
            useChatStream: () => ({
                cancel: vi.fn(),
                deleteUserTurn: vi.fn(),
                historyEntryReady: {
                    conversationId: selectedConversationId,
                    sequence: selectedConversationId === 'conv-entry-a' ? 1 : 2,
                },
                hydrationStatus: 'ready',
                imageQuotaError: null,
                messageConversationId: selectedConversationId,
                messages: [],
                pendingInterrupt: null,
                readOnlyCacheMessage: null,
                regenerateLastTurn: vi.fn(),
                resumeAgentRun: vi.fn(),
                retryHydration: vi.fn(),
                sendMessage: vi.fn(),
                status: 'ready',
                threadMemoryStatusHint: null,
            }),
        }))
        vi.doMock('@/components/instamind/conversation-session/use-conversation-sessions', () => ({
            useConversationSessions: () => ({
                conversations: [],
                createConversation: vi.fn(),
                deleteConversation: vi.fn(),
                error: null,
                handleConversationPromoted: vi.fn(),
                interactionDisabled: false,
                isDraft: false,
                isLoading: false,
                isMutating: false,
                isReadOnlyCache: false,
                readOnlyCacheMessage: null,
                retryRecovery: vi.fn(),
                selectedConversation: {
                    id: selectedConversationId,
                    title: 'Entry',
                    selected: true,
                    hasMessages: true,
                    createdAt: '2026-08-21T10:00:00.000Z',
                    lastActiveAt: '2026-08-21T10:00:00.000Z',
                },
                selectedConversationId,
                selectConversation: vi.fn(),
            }),
        }))

        const { default: InstantMindPage } = await import('@/components/instamind/instantmind-page')

        const page = render(React.createElement(InstantMindPage, { initialChatModelsState }))

        expect(positionConversationEntryAtBottom).not.toHaveBeenCalled()
        expect(document.querySelector('[data-slot="conversation-history-presentation"]')?.getAttribute('data-entry-positioned')).toBe(
            'false'
        )
        expect(screen.getByRole('status', { name: '会话加载中' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: '回到底部' })).toBeNull()

        const messageViewport = document.querySelector('[data-slot="chat-message-viewport"]') as HTMLElement
        const layoutSkeleton = document.querySelector('[data-slot="conversation-entry-layout-skeleton"]')
        expect(messageViewport.className).toContain('overflow-y-hidden')
        expect(layoutSkeleton).toBeTruthy()
        expect(layoutSkeleton?.className).toContain('lg:left-[var(--conversation-sidebar-width)]')
        expect(messageViewport.contains(layoutSkeleton)).toBe(false)

        act(() => {
            startEntryPositioning?.(0)
        })

        expect(positionConversationEntryAtBottom).toHaveBeenCalledTimes(1)
        expect(positionConversationEntryAtBottom).toHaveBeenCalledWith(
            {
                conversationId: 'conv-entry-a',
                lastMessageIndex: -1,
                sequence: 1,
            },
            expect.any(Function)
        )
        expect(document.querySelector('[data-slot="conversation-history-end-anchor"]')).toBeNull()
        expect(cancelConversationEntryPositioning).toHaveBeenCalledTimes(1)
        expect(document.querySelector('[data-slot="conversation-history-presentation"]')?.getAttribute('data-entry-positioned')).toBe(
            'false'
        )
        expect(screen.getByTestId('chat-message-list')).toBeTruthy()

        act(() => {
            finishEntryPositioningA?.()
        })

        expect(document.querySelector('[data-slot="conversation-history-presentation"]')?.getAttribute('data-entry-positioned')).toBe(
            'true'
        )
        expect(screen.getByRole('button', { name: '回到底部' })).toBeTruthy()
        expect(messageViewport.className).toContain('overflow-y-auto')
        expect(document.querySelector('[data-slot="conversation-entry-layout-skeleton"]')).toBeNull()

        Object.defineProperties(messageViewport, {
            clientWidth: { configurable: true, value: 985 },
            offsetWidth: { configurable: true, value: 1000 },
        })
        selectedConversationId = 'conv-entry-b'
        page.rerender(React.createElement(InstantMindPage, { initialChatModelsState }))

        expect(cancelConversationEntryPositioning).toHaveBeenCalledTimes(2)
        expect((document.querySelector('main') as HTMLElement).style.getPropertyValue('--chat-scrollbar-width')).toBe('')
        expect(positionConversationEntryAtBottom).toHaveBeenCalledTimes(1)
        expect(messageViewport.className).toContain('overflow-y-hidden')
        expect(document.querySelector('[data-slot="conversation-entry-layout-skeleton"]')).toBeTruthy()

        act(() => {
            startEntryPositioning?.(0)
        })

        expect(positionConversationEntryAtBottom).toHaveBeenCalledTimes(2)
        expect(cancelConversationEntryPositioning.mock.invocationCallOrder[1]).toBeLessThan(
            positionConversationEntryAtBottom.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY
        )

        expect(document.querySelector('[data-slot="conversation-history-presentation"]')?.getAttribute('data-entry-positioned')).toBe(
            'false'
        )

        act(() => {
            finishEntryPositioningA?.()
        })

        expect(document.querySelector('[data-slot="conversation-history-presentation"]')?.getAttribute('data-entry-positioned')).toBe(
            'false'
        )

        act(() => {
            finishEntryPositioningB?.()
        })

        expect(document.querySelector('[data-slot="conversation-history-presentation"]')?.getAttribute('data-entry-positioned')).toBe(
            'true'
        )
    })
})
