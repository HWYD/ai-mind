/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
        vi.doMock('@/components/instamind/use-chat-auto-scroll', () => ({
            useChatAutoScroll: () => ({
                inputContainerRef: { current: null },
                bottomSpacing: 24,
                showScrollToBottom: false,
                resetAutoScrollForNewTurn: vi.fn(),
                restoreAutoFollowAndScrollToBottom: vi.fn(),
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
            ChatMessageList: () => React.createElement('div', { 'data-testid': 'chat-message-list' }),
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
        vi.doMock('@/components/instamind/use-chat-auto-scroll', () => ({
            useChatAutoScroll: () => ({
                inputContainerRef: { current: null },
                bottomSpacing: 24,
                showScrollToBottom: false,
                resetAutoScrollForNewTurn: vi.fn(),
                restoreAutoFollowAndScrollToBottom: vi.fn(),
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
        const scrollShell = document.querySelector('[data-slot="chat-scroll-shell"]')

        expect(mainColumn?.className).toContain('max-w-[var(--chat-content-column-width)]')
        expect(mainColumn?.className).toContain('min-h-[calc(100vh-var(--chat-bottom-spacing)-1.5rem)]')
        expect(composerColumn?.className).toContain('max-w-[var(--chat-content-column-width)]')
        expect(composerColumn?.parentElement?.className).not.toContain('max-w-4xl')
        expect(scrollShell?.className).toContain('pb-[var(--chat-bottom-spacing)]')
        expect(scrollShell?.className).toContain('transition-[padding-left]')
        expect(composerShell?.className).toContain('transition-[left]')
        expect(mainColumn?.contains(screen.getByTestId('conversation-mobile-selector'))).toBe(false)
        expect(scrollShell?.contains(screen.getByTestId('conversation-mobile-selector'))).toBe(true)
        expect((document.querySelector('main') as HTMLElement | null)?.style.getPropertyValue('--chat-bottom-spacing')).toBe('24px')
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
        vi.doMock('@/components/instamind/use-chat-auto-scroll', () => ({
            useChatAutoScroll: () => ({
                inputContainerRef: { current: null },
                bottomSpacing: 24,
                showScrollToBottom: false,
                resetAutoScrollForNewTurn: vi.fn(),
                restoreAutoFollowAndScrollToBottom: vi.fn(),
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
        vi.doMock('@/components/instamind/use-chat-auto-scroll', () => ({
            useChatAutoScroll: () => ({
                inputContainerRef: { current: null },
                bottomSpacing: 24,
                showScrollToBottom: false,
                resetAutoScrollForNewTurn: vi.fn(),
                restoreAutoFollowAndScrollToBottom: vi.fn(),
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
                    'data-disabled': String(props.disabled),
                }),
        }))
        vi.doMock('@/components/instamind/conversation-session/conversation-mobile-selector', () => ({
            ConversationMobileSelector: (props: Record<string, unknown>) =>
                React.createElement('div', {
                    'data-testid': 'conversation-mobile-selector',
                    'data-disabled': String(props.disabled),
                }),
        }))
        vi.doMock('@/components/instamind/human-review/human-review-composer-panel', () => ({
            HumanReviewComposerPanel: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/thread-memory-status-hint', () => ({
            ThreadMemoryStatusHint: () => React.createElement('div'),
        }))
        vi.doMock('@/components/instamind/use-chat-auto-scroll', () => ({
            useChatAutoScroll: () => ({
                inputContainerRef: { current: null },
                bottomSpacing: 24,
                showScrollToBottom: false,
                resetAutoScrollForNewTurn: vi.fn(),
                restoreAutoFollowAndScrollToBottom: vi.fn(),
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
        expect(screen.getByTestId('conversation-sidebar').getAttribute('data-disabled')).toBe('true')
        expect(screen.getByTestId('conversation-mobile-selector').getAttribute('data-disabled')).toBe('true')
        expect(screen.getByTestId('chat-composer').getAttribute('data-submit-disabled')).toBe('true')
        expect(screen.getByRole('button', { name: '重试连接服务端' })).toBeTruthy()
        expect(screen.getByRole('button', { name: '重试连接服务端' }).getAttribute('aria-describedby')).toBe(
            'instamind-readonly-cache-description'
        )

        fireEvent.click(screen.getByRole('button', { name: '重试连接服务端' }))

        expect(retryRecovery).toHaveBeenCalledTimes(1)
        expect(retryHydration).toHaveBeenCalledTimes(1)
    })
})
