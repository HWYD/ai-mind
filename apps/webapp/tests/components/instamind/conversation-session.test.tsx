/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConversationMobileSelector } from '@/components/instamind/conversation-session/conversation-mobile-selector'
import { ConversationSidebar } from '@/components/instamind/conversation-session/conversation-sidebar'
import type { ConversationListItem, ConversationRegistryPayload } from '@/components/instamind/conversation-session/types'
import {
    DRAFT_CONVERSATION_STORAGE_KEY,
    SELECTED_CONVERSATION_STORAGE_KEY,
    useConversationSessions,
} from '@/components/instamind/conversation-session/use-conversation-sessions'

function createConversation(id: string, title: string, selected = false, hasMessages = true): ConversationListItem {
    return {
        id,
        title,
        selected,
        hasMessages,
        createdAt: '2026-07-05T10:00:00.000Z',
        lastActiveAt: '2026-07-05T10:00:00.000Z',
    }
}

function createRegistryPayload(options: {
    selectedConversationId: string | null
    conversations: ConversationListItem[]
}): ConversationRegistryPayload {
    return {
        limit: 10,
        selectedConversationId: options.selectedConversationId,
        conversations: options.conversations,
    }
}

afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
    cleanup()
})

describe('useConversationSessions', () => {
    it('hydrates from the server and treats localStorage as a stale restore hint only', async () => {
        window.localStorage.setItem(SELECTED_CONVERSATION_STORAGE_KEY, 'conv-stale')
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json(
                createRegistryPayload({
                    selectedConversationId: 'conv-b',
                    conversations: [createConversation('conv-b', 'Conversation B', true), createConversation('conv-a', 'Conversation A')],
                })
            )
        )

        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(fetchMock).toHaveBeenCalledWith('/api/chat/conversations?conversationId=conv-stale')
        expect(result.current.selectedConversationId).toBe('conv-b')
        expect(result.current.isDraft).toBe(false)
        expect(window.localStorage.getItem(SELECTED_CONVERSATION_STORAGE_KEY)).toBe('conv-b')
    })

    it('enters blank draft state locally without creating a persisted conversation', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json(
                createRegistryPayload({
                    selectedConversationId: 'conv-a',
                    conversations: [createConversation('conv-a', 'Conversation A', true)],
                })
            )
        )

        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions())

        await waitFor(() => {
            expect(result.current.selectedConversationId).toBe('conv-a')
        })

        await act(async () => {
            await result.current.createConversation()
        })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(result.current.selectedConversationId).toBeNull()
        expect(result.current.isDraft).toBe(true)
        expect(result.current.selectedConversation).toBeNull()
        expect(window.localStorage.getItem(SELECTED_CONVERSATION_STORAGE_KEY)).toBeNull()
        expect(window.localStorage.getItem(DRAFT_CONVERSATION_STORAGE_KEY)).toBe('1')
    })

    it('restores a local blank draft sentinel even when the server registry still has persisted conversations', async () => {
        window.localStorage.setItem(DRAFT_CONVERSATION_STORAGE_KEY, '1')
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json(
                createRegistryPayload({
                    selectedConversationId: 'conv-a',
                    conversations: [createConversation('conv-a', 'Conversation A', true)],
                })
            )
        )

        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(fetchMock).toHaveBeenCalledWith('/api/chat/conversations')
        expect(result.current.selectedConversationId).toBeNull()
        expect(result.current.isDraft).toBe(true)
        expect(result.current.selectedConversation).toBeNull()
    })

    it('blocks create and switch actions while interaction is locked', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json(
                createRegistryPayload({
                    selectedConversationId: 'conv-a',
                    conversations: [createConversation('conv-a', 'Conversation A', true)],
                })
            )
        )

        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions({ interactionLocked: true }))

        await waitFor(() => {
            expect(result.current.selectedConversationId).toBe('conv-a')
        })

        await act(async () => {
            expect(await result.current.createConversation()).toBe(false)
            expect(await result.current.selectConversation('conv-a')).toBe(false)
        })

        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})

describe('conversation session UI', () => {
    it('renders the desktop sidebar with a filtered recent list and forwards create/select actions', () => {
        const onCreateConversation = vi.fn()
        const onSelectConversation = vi.fn()

        render(
            <ConversationSidebar
                conversations={[
                    createConversation('conv-a', 'A very long conversation title for truncation', true),
                    createConversation('conv-empty', '新会话', false, false),
                    createConversation('conv-b', 'Conversation B'),
                ]}
                onCreateConversation={onCreateConversation}
                onSelectConversation={onSelectConversation}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: '新聊天' }))
        fireEvent.click(screen.getByRole('button', { name: 'Conversation B' }))

        const sidebar = document.querySelector('[data-slot="sidebar"]')
        const desktopScrollArea = document.querySelector('[data-slot="scroll-area"]')

        expect(sidebar?.getAttribute('data-state')).toBe('expanded')
        expect(sidebar?.className).toContain('overflow-hidden')
        expect(sidebar?.className).toContain('ease-linear')
        expect(desktopScrollArea).toBeTruthy()
        expect(screen.getByText('最近').textContent).toBe('最近')
        expect(screen.getByRole('link', { name: 'AI Mind' }).getAttribute('href')).toBe('/')
        expect(screen.queryByText('Instant Mind')).toBeNull()
        expect(screen.queryByRole('button', { name: '新会话' })).toBeNull()
        expect(screen.getByRole('button', { name: 'A very long conversation title for truncation' }).getAttribute('aria-current')).toBe(
            'page'
        )
        expect(onCreateConversation).toHaveBeenCalledTimes(1)
        expect(onSelectConversation).toHaveBeenCalledWith('conv-b')
    })

    it('renders the mobile drawer with filtered recent conversations and closes it after accepted actions', async () => {
        const onCreateConversation = vi.fn().mockResolvedValue(true)
        const onSelectConversation = vi.fn().mockResolvedValue(true)

        render(
            <ConversationMobileSelector
                conversations={[
                    createConversation('conv-a', 'Conversation A', true),
                    createConversation('conv-empty', '新会话', false, false),
                    createConversation('conv-b', 'Conversation B'),
                ]}
                onCreateConversation={onCreateConversation}
                onSelectConversation={onSelectConversation}
                selectedConversationTitle="当前会话"
            />
        )

        fireEvent.click(screen.getByRole('button', { name: '打开会话抽屉' }))

        expect((await screen.findByText('AI Mind')).textContent).toBe('AI Mind')
        expect(document.querySelector('[data-slot="sheet-content"]')).toBeTruthy()
        expect(document.querySelector('[data-slot="scroll-area"]')).toBeTruthy()
        expect(screen.getByRole('link', { name: 'AI Mind' }).getAttribute('href')).toBe('/')
        expect(screen.getByText('最近').textContent).toBe('最近')
        expect(screen.queryByRole('button', { name: '新会话' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Conversation B' }))

        await waitFor(() => {
            expect(onSelectConversation).toHaveBeenCalledWith('conv-b')
        })
        await waitFor(() => {
            expect(screen.queryByText('AI Mind')).toBeNull()
        })

        fireEvent.click(screen.getByRole('button', { name: '新聊天' }))

        await waitFor(() => {
            expect(onCreateConversation).toHaveBeenCalledTimes(1)
        })
    })

    it('keeps the mobile drawer trigger available but disables create/select actions when session interaction is blocked', async () => {
        render(
            <>
                <ConversationSidebar
                    conversations={[createConversation('conv-a', 'Conversation A', true)]}
                    disabled
                    onCreateConversation={vi.fn()}
                    onSelectConversation={vi.fn()}
                />
                <ConversationMobileSelector
                    conversations={[createConversation('conv-a', 'Conversation A', true)]}
                    disabled
                    onCreateConversation={vi.fn()}
                    onSelectConversation={vi.fn()}
                    selectedConversationTitle="当前会话"
                />
            </>
        )

        const initialCreateButtons = screen.getAllByRole('button', { name: '新聊天' })
        const initialConversationButtons = screen.getAllByRole('button', { name: 'Conversation A' })

        expect(initialCreateButtons).toHaveLength(2)
        expect(initialConversationButtons).toHaveLength(1)
        expect((initialCreateButtons[0] as HTMLButtonElement).disabled).toBe(true)
        expect((initialCreateButtons[1] as HTMLButtonElement).disabled).toBe(true)
        expect((initialConversationButtons[0] as HTMLButtonElement).disabled).toBe(true)
        expect((screen.getByRole('button', { name: '打开会话抽屉' }) as HTMLButtonElement).disabled).toBe(false)

        fireEvent.click(screen.getByRole('button', { name: '打开会话抽屉' }))

        const drawerBrand = await screen.findAllByText('AI Mind')
        const drawerBrandLink = screen.getByRole('link', { name: 'AI Mind' })

        expect(drawerBrand.length).toBeGreaterThan(1)
        expect(drawerBrandLink.getAttribute('href')).toBe('/')

        const drawerCreateButtons = screen.getAllByRole('button', { name: '新聊天' })

        expect(drawerCreateButtons).toHaveLength(1)
        expect((drawerCreateButtons[0] as HTMLButtonElement).disabled).toBe(true)

        const allConversationButtons = screen.getAllByRole('button', { name: 'Conversation A' })

        expect(allConversationButtons).toHaveLength(1)
        expect((allConversationButtons[0] as HTMLButtonElement).disabled).toBe(true)
    })

    it('keeps collapsed desktop sidebar semantics aligned with draft-first behavior', () => {
        const onToggleCollapsed = vi.fn()

        render(
            <ConversationSidebar
                collapsed
                conversations={[
                    createConversation('conv-a', 'Conversation A', true),
                    createConversation('conv-empty', '新会话', false, false),
                ]}
                onCreateConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                onToggleCollapsed={onToggleCollapsed}
            />
        )

        const sidebar = document.querySelector('[data-slot="sidebar"]')

        expect(sidebar?.getAttribute('data-state')).toBe('collapsed')
        expect(screen.queryByRole('link', { name: 'AI Mind' })).toBeNull()
        expect(screen.getByRole('button', { name: '新聊天' })).toBeTruthy()
        expect(screen.getByRole('button', { name: '展开最近会话' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: '新会话' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: '展开最近会话' }))

        expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
    })
})
