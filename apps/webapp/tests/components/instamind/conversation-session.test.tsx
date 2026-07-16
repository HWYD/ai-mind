/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConversationMobileSelector } from '@/components/instamind/conversation-session/conversation-mobile-selector'
import { ConversationSidebar } from '@/components/instamind/conversation-session/conversation-sidebar'
import type { ConversationListItem, ConversationRegistryPayload } from '@/components/instamind/conversation-session/types'
import {
    DRAFT_CONVERSATION_STORAGE_KEY,
    SELECTED_CONVERSATION_STORAGE_KEY,
    useConversationSessions,
} from '@/components/instamind/conversation-session/use-conversation-sessions'

const localPersistenceMocks = vi.hoisted(() => ({
    createIndexFromRegistry: vi.fn(
        (input: { conversations: ConversationListItem[]; isDraft: boolean; selectedConversationId: string | null }) => ({
            conversations: input.conversations,
            isDraft: input.isDraft,
            revision: 1,
            schemaVersion: 1,
            selectedConversationId: input.selectedConversationId,
            updatedAt: '2026-07-05T10:00:00.000Z',
        })
    ),
    deleteLocalConversationSnapshots: vi.fn(),
    reconcileLocalConversationIndex: vi.fn(),
    readLocalConversationIndex: vi.fn(),
    writeLocalConversationIndex: vi.fn(),
}))

vi.mock('@/components/instamind/local-chat-persistence/store', () => localPersistenceMocks)

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

beforeEach(() => {
    vi.clearAllMocks()
    localPersistenceMocks.readLocalConversationIndex.mockResolvedValue({ status: 'missing' })
    localPersistenceMocks.writeLocalConversationIndex.mockResolvedValue({ revision: 1, status: 'written' })
    localPersistenceMocks.reconcileLocalConversationIndex.mockResolvedValue({ revision: 1, status: 'written' })
    localPersistenceMocks.deleteLocalConversationSnapshots.mockResolvedValue(undefined)
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

    it('shows the local list first and replaces baseline local-only entries after valid server success', async () => {
        let resolveFetch: ((response: Response) => void) | undefined
        const localConversation = createConversation('conv-local', 'Yesterday')
        const retainedConversation = createConversation('conv-retained', 'Old retained title')
        const localIndex = {
            conversations: [localConversation, retainedConversation],
            isDraft: false,
            revision: 4,
            schemaVersion: 1,
            selectedConversationId: retainedConversation.id,
            updatedAt: '2026-07-05T10:00:00.000Z',
        }
        const serverConversation = createConversation('conv-retained', 'Server title', true)
        const fetchMock = vi.fn(
            () =>
                new Promise<Response>(resolve => {
                    resolveFetch = resolve
                })
        )

        localPersistenceMocks.readLocalConversationIndex.mockResolvedValue({ data: localIndex, status: 'valid' })
        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions())

        await waitFor(() => {
            expect(result.current.conversations).toEqual([
                expect.objectContaining({ id: 'conv-local' }),
                expect.objectContaining({ id: 'conv-retained' }),
            ])
        })

        await act(async () => {
            resolveFetch?.(
                Response.json(
                    createRegistryPayload({
                        selectedConversationId: 'conv-retained',
                        conversations: [serverConversation],
                    })
                )
            )
        })

        await waitFor(() => {
            expect(result.current.conversations).toEqual([expect.objectContaining({ id: 'conv-retained', title: 'Server title' })])
        })
        await waitFor(() => {
            expect(localPersistenceMocks.deleteLocalConversationSnapshots).toHaveBeenCalledWith(['conv-local'])
        })
        expect(localPersistenceMocks.reconcileLocalConversationIndex).toHaveBeenCalledWith(
            expect.objectContaining({ conversations: [serverConversation] }),
            localIndex
        )
    })

    it('keeps registry hydration active after Strict Mode remounts', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json(
                createRegistryPayload({
                    selectedConversationId: 'conv-a',
                    conversations: [createConversation('conv-a', 'Conversation A', true)],
                })
            )
        )

        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions(), {
            wrapper: StrictMode,
        })

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.selectedConversationId).toBe('conv-a')
        expect(result.current.conversations).toHaveLength(1)
    })

    it('restores local index as read-only cache when server registry is unavailable', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('registry down'))

        localPersistenceMocks.readLocalConversationIndex.mockResolvedValueOnce({
            data: {
                conversations: [createConversation('conv-local', 'Local Conversation')],
                isDraft: false,
                revision: 3,
                schemaVersion: 1,
                selectedConversationId: 'conv-local',
                updatedAt: '2026-07-05T10:00:00.000Z',
            },
            status: 'valid',
        })
        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.conversations).toEqual([expect.objectContaining({ id: 'conv-local', selected: true })])
        expect(result.current.selectedConversationId).toBe('conv-local')
        expect(result.current.isReadOnlyCache).toBe(true)
        expect(result.current.interactionDisabled).toBe(true)
        expect(localPersistenceMocks.reconcileLocalConversationIndex).not.toHaveBeenCalled()
        expect(localPersistenceMocks.deleteLocalConversationSnapshots).not.toHaveBeenCalled()
        expect(result.current.readOnlyCacheMessage).toContain('本地只读缓存')
    })

    it('retries registry recovery from read-only cache and returns to interactive state after server success', async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error('registry down'))
            .mockResolvedValueOnce(
                Response.json(
                    createRegistryPayload({
                        selectedConversationId: 'conv-server',
                        conversations: [createConversation('conv-server', 'Server Conversation', true)],
                    })
                )
            )

        localPersistenceMocks.readLocalConversationIndex.mockResolvedValue({
            data: {
                conversations: [createConversation('conv-local', 'Local Conversation')],
                isDraft: false,
                revision: 3,
                schemaVersion: 1,
                selectedConversationId: 'conv-local',
                updatedAt: '2026-07-05T10:00:00.000Z',
            },
            status: 'valid',
        })
        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions())

        await waitFor(() => {
            expect(result.current.isReadOnlyCache).toBe(true)
        })

        await act(async () => {
            expect(result.current.retryRecovery()).toBe(true)
        })

        await waitFor(() => {
            expect(result.current.isReadOnlyCache).toBe(false)
        })

        expect(result.current.selectedConversationId).toBe('conv-server')
        expect(result.current.conversations).toEqual([expect.objectContaining({ id: 'conv-server', selected: true })])
        expect(fetchMock).toHaveBeenCalledTimes(2)
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

    it('deletes a conversation only after a successful server response and cleans its local snapshot', async () => {
        const localIndex = {
            conversations: [createConversation('conv-a', 'Conversation A', true), createConversation('conv-b', 'Conversation B')],
            isDraft: false,
            revision: 3,
            schemaVersion: 1,
            selectedConversationId: 'conv-a',
            updatedAt: '2026-07-05T10:00:00.000Z',
        }
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json(
                    createRegistryPayload({
                        selectedConversationId: 'conv-a',
                        conversations: [
                            createConversation('conv-a', 'Conversation A', true),
                            createConversation('conv-b', 'Conversation B'),
                        ],
                    })
                )
            )
            .mockResolvedValueOnce(
                Response.json(
                    createRegistryPayload({
                        selectedConversationId: 'conv-a',
                        conversations: [createConversation('conv-a', 'Conversation A', true)],
                    })
                )
            )

        localPersistenceMocks.readLocalConversationIndex.mockResolvedValue({ data: localIndex, status: 'valid' })
        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        await act(async () => {
            expect(await result.current.deleteConversation('conv-b')).toBe(true)
        })

        expect(fetchMock).toHaveBeenLastCalledWith(
            '/api/chat/conversations',
            expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ conversationId: 'conv-b' }) })
        )
        await waitFor(() => {
            expect(localPersistenceMocks.deleteLocalConversationSnapshots).toHaveBeenCalledWith(['conv-b'])
        })
        expect(result.current.conversations.map(conversation => conversation.id)).toEqual(['conv-a'])
    })

    it('cleans the deleted snapshot even when the local index baseline does not contain the server conversation', async () => {
        const serverConversation = createConversation('conv-server-only', 'Server Conversation', true)
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json(
                    createRegistryPayload({
                        selectedConversationId: serverConversation.id,
                        conversations: [serverConversation],
                    })
                )
            )
            .mockResolvedValueOnce(
                Response.json(
                    createRegistryPayload({
                        selectedConversationId: null,
                        conversations: [],
                    })
                )
            )

        localPersistenceMocks.readLocalConversationIndex.mockResolvedValue({
            data: {
                conversations: [],
                isDraft: true,
                revision: 3,
                schemaVersion: 1,
                selectedConversationId: null,
                updatedAt: '2026-07-05T10:00:00.000Z',
            },
            status: 'valid',
        })
        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions())

        await waitFor(() => {
            expect(result.current.conversations).toEqual([expect.objectContaining({ id: serverConversation.id })])
        })

        await act(async () => {
            expect(await result.current.deleteConversation(serverConversation.id)).toBe(true)
        })

        await waitFor(() => {
            expect(localPersistenceMocks.deleteLocalConversationSnapshots).toHaveBeenCalledWith([serverConversation.id])
        })
    })

    it('keeps the local conversation and snapshot when deletion fails', async () => {
        const localConversation = createConversation('conv-delete-failure', 'Keep me', true)
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json(
                    createRegistryPayload({
                        selectedConversationId: localConversation.id,
                        conversations: [localConversation],
                    })
                )
            )
            .mockRejectedValueOnce(new Error('delete unavailable'))

        localPersistenceMocks.readLocalConversationIndex.mockResolvedValue({
            data: {
                conversations: [localConversation],
                isDraft: false,
                revision: 3,
                schemaVersion: 1,
                selectedConversationId: localConversation.id,
                updatedAt: '2026-07-05T10:00:00.000Z',
            },
            status: 'valid',
        })
        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useConversationSessions())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        await act(async () => {
            expect(await result.current.deleteConversation(localConversation.id)).toBe(false)
        })

        expect(result.current.conversations).toEqual([expect.objectContaining({ id: localConversation.id })])
        expect(result.current.error).toContain('删除失败')
        expect(localPersistenceMocks.deleteLocalConversationSnapshots).not.toHaveBeenCalledWith([localConversation.id])
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
        const mobileScrollArea = document.querySelector('[data-slot="scroll-area"]')
        expect(mobileScrollArea).toBeTruthy()
        expect(mobileScrollArea?.className).toContain('[&_[data-slot=scroll-area-viewport]>div]:w-full')
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

    it('exposes a delete-only action and requires confirmation on desktop and mobile', async () => {
        const onDeleteConversation = vi.fn().mockResolvedValue(true)

        render(
            <>
                <ConversationSidebar
                    conversations={[createConversation('conv-desktop', 'Desktop Conversation', true)]}
                    onCreateConversation={vi.fn()}
                    onDeleteConversation={onDeleteConversation}
                    onSelectConversation={vi.fn()}
                />
                <ConversationMobileSelector
                    conversations={[createConversation('conv-mobile', 'Mobile Conversation', true)]}
                    onCreateConversation={vi.fn()}
                    onDeleteConversation={onDeleteConversation}
                    onSelectConversation={vi.fn()}
                    selectedConversationTitle="Mobile Conversation"
                />
            </>
        )

        const desktopConversationButton = screen.getByRole('button', { name: 'Desktop Conversation' })
        const desktopActionButton = screen.getByRole('button', { name: '操作会话：Desktop Conversation' })

        expect(desktopConversationButton.className).toContain('cursor-pointer')
        expect(desktopConversationButton.className).toContain('pr-4')
        expect(desktopConversationButton.className).toContain('group-hover:pr-11')
        expect(desktopConversationButton.className).toContain('group-hover:bg-sidebar-accent')
        expect(desktopActionButton.className).toContain('data-[state=open]:opacity-100')

        fireEvent.pointerDown(desktopActionButton)
        expect(desktopActionButton.getAttribute('data-state')).toBe('open')
        expect(screen.getAllByRole('menuitem')).toHaveLength(1)
        expect(screen.getByRole('menuitem', { name: '删除' })).toBeTruthy()
        expect(screen.getByRole('menu').getAttribute('data-side')).toBe('bottom')
        expect(screen.getByRole('menu').getAttribute('data-align')).toBe('start')
        fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))
        expect(screen.getByRole('alertdialog')).toBeTruthy()
        expect(screen.getByText('这会删除“Desktop Conversation”以及该会话期间保存的所有记忆。删除后无法恢复。')).toBeTruthy()
        expect(screen.getByRole('button', { name: '删除' }).className).toContain('bg-destructive')
        expect(screen.getByRole('button', { name: '删除' }).className).toContain('text-destructive-foreground')
        fireEvent.click(screen.getByRole('button', { name: '取消' }))
        expect(onDeleteConversation).not.toHaveBeenCalled()

        fireEvent.pointerDown(screen.getByRole('button', { name: '操作会话：Desktop Conversation' }))
        fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))
        fireEvent.click(screen.getByRole('button', { name: '删除' }))

        await waitFor(() => {
            expect(onDeleteConversation).toHaveBeenCalledWith('conv-desktop')
        })

        fireEvent.click(screen.getByRole('button', { name: /会话抽屉/ }))
        fireEvent.pointerDown(screen.getAllByRole('button', { name: '操作会话：Mobile Conversation' })[0]!)
        expect(screen.getByRole('menu').getAttribute('data-side')).toBe('bottom')
        expect(screen.getByRole('menu').getAttribute('data-align')).toBe('end')
        fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))
        expect(screen.getByText('这会删除“Mobile Conversation”以及该会话期间保存的所有记忆。删除后无法恢复。')).toBeTruthy()
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
        expect(document.querySelectorAll('button[aria-haspopup="menu"]')).toHaveLength(0)

        fireEvent.click(screen.getByRole('button', { name: '打开会话抽屉' }))

        const drawerBrand = await screen.findAllByText('AI Mind')
        const drawerBrandLink = screen.getByRole('link', { name: 'AI Mind' })

        expect(drawerBrand.length).toBeGreaterThan(1)
        expect(drawerBrandLink.getAttribute('href')).toBe('/')

        const drawerCreateButtons = screen.getAllByRole('button', { name: '新聊天' })

        expect(drawerCreateButtons).toHaveLength(1)
        expect((drawerCreateButtons[0] as HTMLButtonElement).disabled).toBe(true)

        const allConversationButtons = screen.getAllByRole('button', { name: 'Conversation A' })
        const mobileActionButtons = document.querySelectorAll('button[aria-haspopup="menu"]')

        expect(allConversationButtons).toHaveLength(1)
        expect((allConversationButtons[0] as HTMLButtonElement).disabled).toBe(true)
        expect(mobileActionButtons).toHaveLength(1)
        expect((mobileActionButtons[0] as HTMLButtonElement).disabled).toBe(true)
        expect((mobileActionButtons[0] as HTMLButtonElement).className).toContain('disabled:opacity-100')
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
