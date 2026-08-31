/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatMessageList, type ChatMessageListHandle } from '@/components/chat/message-list/chat-message-list'
import { createMessageHeightHintLayoutKey, createMessageRenderFingerprint } from '@/components/chat/message-list/message-height-hints'
import { getMessageCopyText } from '@/components/chat/message-list/shared/message-list-utils'
import type { ChatComposerPayload } from '@/lib/ai/types/chat'
import type { MindMessage } from '@/lib/ai/types/message'
import { createMessageVirtualizationFixture } from '@/lib/dev/message-virtualization/mixed-message-fixture'

const assistantMessageRenderSpy = vi.hoisted(() => vi.fn())
const heightHintStoreMocks = vi.hoisted(() => ({
    readLocalMessageHeightHints: vi.fn(),
    writeLocalMessageHeightHints: vi.fn(),
}))
const virtuosoHarness = vi.hoisted(() => ({
    emitItemsRendered: (items: unknown[]) => {
        const callback = virtuosoHarness.props?.itemsRendered as ((nextItems: unknown[]) => void) | undefined
        callback?.(items)
    },
    props: null as Record<string, unknown> | null,
    renderRange: null as { endIndex: number; startIndex: number } | null,
    scrollToIndex: vi.fn(),
}))

vi.mock('@/components/instamind/local-chat-persistence/store', async importOriginal => ({
    ...(await importOriginal<typeof import('@/components/instamind/local-chat-persistence/store')>()),
    ...heightHintStoreMocks,
}))

vi.mock('react-virtuoso', async () => {
    const react = await import('react')

    return {
        Virtuoso({ ref, ...props }: Record<string, unknown> & { ref?: React.Ref<unknown> }) {
            virtuosoHarness.props = props
            react.useImperativeHandle(
                ref,
                () => ({
                    scrollToIndex: virtuosoHarness.scrollToIndex,
                }),
                []
            )

            const data = (props.data ?? []) as unknown[]
            const context = props.context
            const components = (props.components ?? {}) as {
                Footer?: React.ComponentType<{ context?: unknown }>
                Item?: React.ComponentType<React.PropsWithChildren<Record<string, unknown>>>
            }
            const Item = components.Item ?? 'div'
            const Footer = components.Footer
            const computeItemKey = props.computeItemKey as ((index: number, item: unknown, context: unknown) => React.Key) | undefined
            const itemContent = props.itemContent as ((index: number, item: unknown, context: unknown) => React.ReactNode) | undefined

            const startIndex = virtuosoHarness.renderRange?.startIndex ?? 0
            const endIndex = Math.min(virtuosoHarness.renderRange?.endIndex ?? data.length - 1, data.length - 1)
            const renderedData = endIndex < startIndex ? [] : data.slice(startIndex, endIndex + 1)

            return react.createElement(
                'div',
                { 'data-testid': 'virtuoso' },
                ...renderedData.map((item, offset) => {
                    const index = startIndex + offset

                    return react.createElement(
                        Item,
                        {
                            key: computeItemKey?.(index, item, context) ?? index,
                            'data-item-index': index,
                            context,
                        },
                        itemContent?.(index, item, context)
                    )
                }),
                Footer ? react.createElement(Footer, { context }) : null
            )
        },
    }
})

vi.mock('@/components/chat/message-list/messages/assistant-message', async importOriginal => {
    const actual = await importOriginal<typeof import('@/components/chat/message-list/messages/assistant-message')>()
    const react = await import('react')

    return {
        ...actual,
        AssistantMessage(props: Parameters<typeof actual.AssistantMessage>[0]) {
            assistantMessageRenderSpy(props)
            return react.createElement(actual.AssistantMessage, props)
        },
    }
})

afterEach(() => {
    cleanup()
    assistantMessageRenderSpy.mockClear()
    virtuosoHarness.props = null
    virtuosoHarness.renderRange = null
    virtuosoHarness.scrollToIndex.mockClear()
    heightHintStoreMocks.readLocalMessageHeightHints.mockReset()
    heightHintStoreMocks.readLocalMessageHeightHints.mockResolvedValue({ status: 'missing' })
    heightHintStoreMocks.writeLocalMessageHeightHints.mockReset()
    heightHintStoreMocks.writeLocalMessageHeightHints.mockResolvedValue({ status: 'written' })
})

function createAssistantMessage(id = 'assistant-reasoning', text = '最终答案'): MindMessage {
    return {
        id,
        role: 'assistant',
        createdAt: '2026-06-16T10:00:00.000Z',
        parts: [
            {
                id: 'reasoning-1',
                type: 'reasoning',
                text: '先分析用户问题，再组织最终回答。',
                format: 'markdown',
                visibility: 'collapsed',
            },
            {
                id: 'text-1',
                type: 'text',
                text,
                format: 'markdown',
            },
        ],
    }
}

function createDeliveryChainComposer(): ChatComposerPayload {
    return {
        command: {
            label: '生成交付计划',
            name: 'delivery-chain',
        },
        plainText: '',
        references: [
            {
                id: 'demo:scenario:request-limit-banner/requirement.md',
                label: 'request-limit-banner/requirement.md',
                source: 'local',
                type: 'resource',
                uri: 'demo://scenarios/request-limit-banner/requirement.md',
            },
        ],
    }
}

function createResourcePart(resourceName: string, uri: string) {
    return {
        id: uri,
        type: 'resource' as const,
        contentPreview: `preview for ${resourceName}`,
        location: 'local' as const,
        resourceName,
        serverId: 'project-docs-server',
        source: 'mcp' as const,
        status: 'completed' as const,
        uri,
    }
}

function createDisclosureMessages(reasoningPartId = 'reasoning-disclosure'): MindMessage[] {
    return [
        {
            id: 'assistant-disclosures',
            role: 'assistant',
            createdAt: '2026-08-24T10:00:00.000Z',
            parts: [
                {
                    id: reasoningPartId,
                    type: 'reasoning',
                    text: '需要跨虚拟卸载保留的推理内容。',
                    format: 'markdown',
                    visibility: 'collapsed',
                },
                {
                    id: 'workflow-disclosure',
                    type: 'workflow-progress',
                    workflowId: 'workflow-disclosure-run',
                    workflowKind: 'image_generation',
                    title: '图像生成',
                    status: 'completed',
                    summary: '已处理 3s',
                    visibility: 'collapsed',
                    steps: [
                        {
                            id: 'workflow-step',
                            title: '生成完成',
                            status: 'completed',
                            details: ['持久工作流详情'],
                        },
                    ],
                },
                createResourcePart('disclosure.md', 'demo://disclosure.md'),
            ],
        },
        {
            id: 'assistant-agent-disclosure',
            role: 'assistant',
            createdAt: '2026-08-24T10:01:00.000Z',
            parts: [
                {
                    type: 'agent-step',
                    agentName: 'version-plan-to-tasklist-agent',
                    runId: 'agent-disclosure-run',
                    status: 'completed',
                    graph: {
                        nodes: [],
                        routes: [],
                        runtime: 'LangGraph',
                        debugSummary: {
                            checkpointMode: 'memory',
                            currentNode: 'emitFinalArtifact',
                            draftRevisions: 0,
                            manualReviewItemCount: 0,
                            maxDraftRevisions: 1,
                            maxOptionalContextReads: 1,
                            maxSteps: 12,
                            optionalContextReads: 0,
                            runId: 'agent-disclosure-run',
                            runtimeMode: 'graph',
                            stepCount: 2,
                            threadId: 'agent-disclosure-thread',
                            visitedNodes: ['readVersionPlan', 'emitFinalArtifact'],
                        },
                    },
                },
            ],
        },
    ]
}

describe('ChatMessageList', () => {
    it('waits for local height hints before the first persisted-history Virtuoso mount and gives an exact hit precedence', async () => {
        const message = createAssistantMessage('history-height-hint')
        const scrollParent = document.createElement('div')
        const onHeightHintBootstrapChange = vi.fn()
        let resolveRead: ((value: unknown) => void) | undefined
        heightHintStoreMocks.readLocalMessageHeightHints.mockReturnValue(
            new Promise(resolve => {
                resolveRead = resolve
            })
        )

        render(
            <ChatMessageList
                conversationId="conv-height-hints"
                enableReasoning={false}
                messages={[message]}
                onHeightHintBootstrapChange={onHeightHintBootstrapChange}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
                scrollParent={scrollParent}
                status="ready"
            />
        )

        expect(screen.queryByTestId('virtuoso')).toBeNull()
        expect(onHeightHintBootstrapChange).toHaveBeenLastCalledWith(true)
        expect(heightHintStoreMocks.readLocalMessageHeightHints).toHaveBeenCalledWith(
            'conv-height-hints',
            createMessageHeightHintLayoutKey({ enableReasoning: false, messageColumnWidth: 856 })
        )

        resolveRead?.({
            data: {
                conversationId: 'conv-height-hints',
                entries: [
                    {
                        height: 384,
                        measuredAt: '2026-08-30T10:00:00.000Z',
                        messageId: message.id,
                        presentation: 'history-default',
                        renderFingerprint: createMessageRenderFingerprint(message),
                    },
                ],
                geometryVersion: 1,
                key: 'conv-height-hints::g1|w856|r0|history-default',
                layoutKey: 'g1|w856|r0|history-default',
                messageColumnWidth: 856,
                updatedAt: '2026-08-30T10:00:00.000Z',
            },
            status: 'valid',
        })

        await waitFor(() => expect(screen.getByTestId('virtuoso')).toBeTruthy())
        expect((virtuosoHarness.props?.heightEstimates as number[])[0]).toBe(384)
        expect(onHeightHintBootstrapChange).toHaveBeenLastCalledWith(false)
    })

    it('reveals history with structural estimates when the local height-hint read exceeds its bootstrap budget', async () => {
        const scrollParent = document.createElement('div')
        const onHeightHintBootstrapChange = vi.fn()
        heightHintStoreMocks.readLocalMessageHeightHints.mockReturnValue(new Promise(() => {}))
        vi.useFakeTimers()

        try {
            render(
                <ChatMessageList
                    conversationId="conv-height-hint-timeout"
                    enableReasoning={false}
                    messages={[createAssistantMessage('height-hint-timeout')]}
                    onHeightHintBootstrapChange={onHeightHintBootstrapChange}
                    onDeleteUserTurn={vi.fn(() => true)}
                    onRegenerateLastTurn={vi.fn(() => true)}
                    onSelectFollowUpQuestion={vi.fn()}
                    onSelectSuggestion={vi.fn()}
                    scrollParent={scrollParent}
                    status="ready"
                />
            )

            expect(screen.queryByTestId('virtuoso')).toBeNull()

            await act(async () => {
                await vi.advanceTimersByTimeAsync(1_000)
            })

            expect(screen.getByTestId('virtuoso')).toBeTruthy()
            expect(onHeightHintBootstrapChange).toHaveBeenLastCalledWith(false)
        } finally {
            vi.useRealTimers()
        }
    })

    it('keys local height hints by the measured chat column rather than an inferred viewport width', async () => {
        const scrollParent = document.createElement('div')
        const messageColumn = document.createElement('div')
        messageColumn.dataset.slot = 'chat-main-column'
        Object.defineProperty(messageColumn, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ height: 0, width: 704, x: 0, y: 0 }),
        })
        scrollParent.append(messageColumn)
        document.body.append(scrollParent)
        heightHintStoreMocks.readLocalMessageHeightHints.mockResolvedValue({ status: 'missing' })

        render(
            <ChatMessageList
                conversationId="conv-measured-column"
                enableReasoning={false}
                messages={[createAssistantMessage('measured-column-height')]}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
                scrollParent={scrollParent}
                status="ready"
            />
        )

        await waitFor(() =>
            expect(heightHintStoreMocks.readLocalMessageHeightHints).toHaveBeenLastCalledWith(
                'conv-measured-column',
                createMessageHeightHintLayoutKey({ enableReasoning: false, messageColumnWidth: 704 })
            )
        )
    })

    it('ignores a stale height-hint read when the history presentation generation changes', async () => {
        const message = createAssistantMessage('stale-height-hint')
        const scrollParent = document.createElement('div')
        const resolvers: Array<(value: unknown) => void> = []
        heightHintStoreMocks.readLocalMessageHeightHints.mockImplementation(
            () =>
                new Promise(resolve => {
                    resolvers.push(resolve)
                })
        )
        const props = {
            conversationId: 'conv-stale-height-hints',
            enableReasoning: false,
            messages: [message],
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
            scrollParent,
            status: 'ready' as const,
        }
        const page = render(<ChatMessageList {...props} />)

        await waitFor(() => expect(resolvers).toHaveLength(1))
        page.rerender(<ChatMessageList {...props} enableReasoning />)
        await waitFor(() => expect(resolvers).toHaveLength(2))

        resolvers[0]?.({
            data: {
                conversationId: props.conversationId,
                entries: [],
                geometryVersion: 1,
                key: 'conv-stale-height-hints::g1|w856|r0|history-default',
                layoutKey: 'g1|w856|r0|history-default',
                messageColumnWidth: 856,
                updatedAt: '2026-08-30T10:00:00.000Z',
            },
            status: 'valid',
        })
        await Promise.resolve()
        expect(screen.queryByTestId('virtuoso')).toBeNull()

        resolvers[1]?.({
            data: {
                conversationId: props.conversationId,
                entries: [],
                geometryVersion: 1,
                key: 'conv-stale-height-hints::g1|w856|r1|history-default',
                layoutKey: 'g1|w856|r1|history-default',
                messageColumnWidth: 856,
                updatedAt: '2026-08-30T10:00:00.000Z',
            },
            status: 'valid',
        })

        await waitFor(() => expect(screen.getByTestId('virtuoso')).toBeTruthy())
    })

    it('persists only stable completed history measurements after streaming and active scrolling have ended', async () => {
        const message = createAssistantMessage('captured-history-height')
        const newerUserMessage: MindMessage = {
            createdAt: '2026-08-30T10:01:00.000Z',
            id: 'newer-user-message',
            parts: [{ format: 'markdown', text: '新一轮用户输入', type: 'text' }],
            role: 'user',
        }
        const scrollParent = document.createElement('div')
        const props = {
            conversationId: 'conv-captured-heights',
            enableReasoning: false,
            messages: [message, newerUserMessage],
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
            scrollParent,
            status: 'streaming' as const,
        }
        heightHintStoreMocks.readLocalMessageHeightHints.mockResolvedValue({ status: 'missing' })
        const page = render(<ChatMessageList {...props} />)

        await waitFor(() => expect(screen.getByTestId('virtuoso')).toBeTruthy())
        const streamingEntry = (virtuosoHarness.props?.data as unknown[])[0]
        virtuosoHarness.emitItemsRendered([
            { data: streamingEntry, index: 0, offset: 0, size: 256 },
            { data: streamingEntry, index: 0, offset: 0, size: 256 },
        ])
        await Promise.resolve()

        expect(heightHintStoreMocks.writeLocalMessageHeightHints).not.toHaveBeenCalled()

        page.rerender(<ChatMessageList {...props} status="ready" />)
        await waitFor(() => expect(screen.getByTestId('virtuoso')).toBeTruthy())
        const readyEntry = (virtuosoHarness.props?.data as unknown[])[0]
        const onScrollingChange = virtuosoHarness.props?.isScrolling as ((isScrolling: boolean) => void) | undefined
        onScrollingChange?.(true)
        virtuosoHarness.emitItemsRendered([
            { data: readyEntry, index: 0, offset: 0, size: 256 },
            { data: readyEntry, index: 0, offset: 0, size: 256 },
        ])
        await Promise.resolve()

        expect(heightHintStoreMocks.writeLocalMessageHeightHints).not.toHaveBeenCalled()

        onScrollingChange?.(false)
        await waitFor(() =>
            expect(heightHintStoreMocks.writeLocalMessageHeightHints).toHaveBeenCalledWith(
                expect.objectContaining({
                    conversationId: 'conv-captured-heights',
                    entries: [
                        expect.objectContaining({
                            height: 256,
                            messageId: message.id,
                            presentation: 'history-default',
                        }),
                    ],
                })
            )
        )
    })

    it('does not persist a history-default height while the user has an expanded disclosure for that message', async () => {
        const messages = createDisclosureMessages()
        const scrollParent = document.createElement('div')
        const originalFonts = document.fonts
        let resolveFonts: (() => void) | undefined
        Object.defineProperty(document, 'fonts', {
            configurable: true,
            value: {
                ready: new Promise<void>(resolve => {
                    resolveFonts = resolve
                }),
            },
        })
        heightHintStoreMocks.readLocalMessageHeightHints.mockResolvedValue({ status: 'missing' })

        try {
            render(
                <ChatMessageList
                    conversationId="conv-disclosure-height"
                    enableReasoning
                    messages={messages}
                    onDeleteUserTurn={vi.fn(() => true)}
                    onRegenerateLastTurn={vi.fn(() => true)}
                    onSelectFollowUpQuestion={vi.fn()}
                    onSelectSuggestion={vi.fn()}
                    scrollParent={scrollParent}
                    status="ready"
                />
            )

            await waitFor(() => expect(screen.getByTestId('virtuoso')).toBeTruthy())
            fireEvent.click(screen.getByText('已完成思考'))
            expect(screen.getByText('已完成思考').closest('button')?.getAttribute('aria-expanded')).toBe('true')

            const entry = (virtuosoHarness.props?.data as unknown[])[0]
            virtuosoHarness.emitItemsRendered([
                { data: entry, index: 0, offset: 0, size: 288 },
                { data: entry, index: 0, offset: 0, size: 288 },
            ])
            await new Promise(resolve => window.requestAnimationFrame(resolve))

            fireEvent.click(screen.getByText('已完成思考'))
            expect(screen.getByText('已完成思考').closest('button')?.getAttribute('aria-expanded')).toBe('false')
            resolveFonts?.()
            await Promise.resolve()
            await Promise.resolve()

            expect(heightHintStoreMocks.writeLocalMessageHeightHints).not.toHaveBeenCalled()
        } finally {
            Object.defineProperty(document, 'fonts', {
                configurable: true,
                value: originalFonts,
            })
        }
    })

    it('cancels a pending height-hint write when its Virtuoso generation unmounts', async () => {
        const message = createAssistantMessage('unmounted-height-hint')
        const newerUserMessage: MindMessage = {
            createdAt: '2026-08-30T10:01:00.000Z',
            id: 'unmounted-newer-user',
            parts: [{ format: 'markdown', text: '新一轮用户输入', type: 'text' }],
            role: 'user',
        }
        const scrollParent = document.createElement('div')
        const originalFonts = document.fonts
        let resolveFonts: (() => void) | undefined
        Object.defineProperty(document, 'fonts', {
            configurable: true,
            value: {
                ready: new Promise<void>(resolve => {
                    resolveFonts = resolve
                }),
            },
        })
        heightHintStoreMocks.readLocalMessageHeightHints.mockResolvedValue({ status: 'missing' })

        try {
            const page = render(
                <ChatMessageList
                    conversationId="conv-unmounted-height"
                    enableReasoning={false}
                    messages={[message, newerUserMessage]}
                    onDeleteUserTurn={vi.fn(() => true)}
                    onRegenerateLastTurn={vi.fn(() => true)}
                    onSelectFollowUpQuestion={vi.fn()}
                    onSelectSuggestion={vi.fn()}
                    scrollParent={scrollParent}
                    status="ready"
                />
            )

            await waitFor(() => expect(screen.getByTestId('virtuoso')).toBeTruthy())
            const entry = (virtuosoHarness.props?.data as unknown[])[0]
            virtuosoHarness.emitItemsRendered([
                { data: entry, index: 0, offset: 0, size: 256 },
                { data: entry, index: 0, offset: 0, size: 256 },
            ])
            await new Promise(resolve => window.requestAnimationFrame(resolve))

            page.unmount()
            resolveFonts?.()
            await Promise.resolve()
            await Promise.resolve()

            expect(heightHintStoreMocks.writeLocalMessageHeightHints).not.toHaveBeenCalled()
        } finally {
            Object.defineProperty(document, 'fonts', {
                configurable: true,
                value: originalFonts,
            })
        }
    })

    it('does not persist the latest assistant message before it becomes completed history', async () => {
        const latestAssistantMessage = createAssistantMessage('latest-assistant-height')
        const precedingUserMessage: MindMessage = {
            createdAt: '2026-08-30T10:00:00.000Z',
            id: 'preceding-user-height',
            parts: [{ format: 'markdown', text: '问题', type: 'text' }],
            role: 'user',
        }
        heightHintStoreMocks.readLocalMessageHeightHints.mockResolvedValue({ status: 'missing' })

        render(
            <ChatMessageList
                conversationId="conv-latest-assistant"
                enableReasoning={false}
                messages={[precedingUserMessage, latestAssistantMessage]}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
                scrollParent={document.createElement('div')}
                status="ready"
            />
        )

        await waitFor(() => expect(screen.getByTestId('virtuoso')).toBeTruthy())
        const latestEntry = (virtuosoHarness.props?.data as unknown[])[1]
        virtuosoHarness.emitItemsRendered([
            { data: latestEntry, index: 1, offset: 0, size: 256 },
            { data: latestEntry, index: 1, offset: 0, size: 256 },
        ])

        await new Promise(resolve => window.requestAnimationFrame(resolve))
        await Promise.resolve()
        expect(heightHintStoreMocks.writeLocalMessageHeightHints).not.toHaveBeenCalled()
    })

    it('delegates every non-empty message list and end command to free React Virtuoso', () => {
        const listRef = createRef<ChatMessageListHandle>()
        const scrollParent = document.createElement('div')

        render(
            <ChatMessageList
                ref={listRef}
                bottomInset={198}
                scrollParent={scrollParent}
                messages={[createAssistantMessage()]}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.getByTestId('virtuoso')).toBeTruthy()
        expect(virtuosoHarness.props).toEqual(
            expect.objectContaining({
                alignToBottom: true,
                atBottomThreshold: 120,
                customScrollParent: scrollParent,
                followOutput: false,
            })
        )

        listRef.current?.scrollToEnd('auto')

        expect(virtuosoHarness.scrollToIndex).toHaveBeenCalledWith({
            align: 'end',
            behavior: 'auto',
            index: 'LAST',
            offset: 198,
        })
    })

    it('reports committed item DOM indices through the Virtuoso Item component', () => {
        const onItemMounted = vi.fn()
        const onItemUnmounted = vi.fn()

        const page = render(
            <ChatMessageList
                messages={[createAssistantMessage('message-0'), createAssistantMessage('message-1'), createAssistantMessage('message-2')]}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onItemMounted={onItemMounted}
                onItemUnmounted={onItemUnmounted}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(onItemMounted.mock.calls.map(([itemIndex]) => itemIndex)).toEqual([0, 1, 2])

        virtuosoHarness.renderRange = { startIndex: 0, endIndex: -1 }
        page.rerender(
            <ChatMessageList
                messages={[createAssistantMessage('message-0'), createAssistantMessage('message-1'), createAssistantMessage('message-2')]}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onItemMounted={onItemMounted}
                onItemUnmounted={onItemUnmounted}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(onItemUnmounted.mock.calls.map(([itemIndex]) => itemIndex)).toEqual([0, 1, 2])
    })

    it('starts short and 1,000-message histories at the tail with stable keys and bounded buffers', () => {
        const defaultProps = {
            bottomInset: 198,
            enableReasoning: false,
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
            status: 'ready' as const,
        }
        const page = render(<ChatMessageList {...defaultProps} messages={[createAssistantMessage('message-0')]} />)

        expect(virtuosoHarness.props).toEqual(
            expect.objectContaining({
                increaseViewportBy: { bottom: 400, top: 600 },
                initialTopMostItemIndex: { align: 'end', index: 'LAST' },
                minOverscanItemCount: { bottom: 2, top: 2 },
            })
        )
        expect(
            (virtuosoHarness.props?.computeItemKey as (index: number, item: unknown) => React.Key)(0, {
                message: createAssistantMessage('stable-message-id'),
            })
        ).toBe('stable-message-id')
        expect((screen.getByTestId('virtuoso').lastElementChild as HTMLElement).style.height).toBe('198px')

        const messages = createMessageVirtualizationFixture()
        const fixturePartTypes = new Set(messages.flatMap(message => message.parts.map(part => part.type)))

        expect([...fixturePartTypes]).toEqual(
            expect.arrayContaining([
                'agent-step',
                'image-brief',
                'image-result',
                'prompt',
                'reasoning',
                'resource',
                'skill',
                'text',
                'tool',
                'workflow-progress',
            ])
        )
        virtuosoHarness.renderRange = { startIndex: 995, endIndex: 999 }
        page.rerender(<ChatMessageList {...defaultProps} messages={messages} />)

        expect(virtuosoHarness.props?.data as unknown[]).toHaveLength(1000)
        const heightEstimates = virtuosoHarness.props?.heightEstimates as number[]
        expect(heightEstimates).toHaveLength(1000)
        expect(new Set(heightEstimates).size).toBeGreaterThan(5)
        expect(heightEstimates[987]).toBeGreaterThan(heightEstimates[986])
        expect(document.querySelectorAll('[data-item-index]')).toHaveLength(5)
    })

    it('provides proportional image estimates without replacing Virtuoso dynamic measurement', () => {
        const defaultProps = {
            enableReasoning: false,
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
            status: 'ready' as const,
        }
        const imageMessages: MindMessage[] = [
            {
                id: 'landscape-image',
                role: 'assistant',
                createdAt: '2026-08-29T10:00:00.000Z',
                parts: [
                    {
                        contentPath: '/image/landscape',
                        expiresAt: '2099-01-01T00:00:00.000Z',
                        height: 480,
                        id: 'landscape-result',
                        runId: 'landscape-run',
                        suggestedFileName: 'landscape.png',
                        temporary: true,
                        type: 'image-result',
                        width: 640,
                    },
                ],
            },
            {
                id: 'portrait-image',
                role: 'assistant',
                createdAt: '2026-08-29T10:01:00.000Z',
                parts: [
                    {
                        contentPath: '/image/portrait',
                        expiresAt: '2099-01-01T00:00:00.000Z',
                        height: 640,
                        id: 'portrait-result',
                        runId: 'portrait-run',
                        suggestedFileName: 'portrait.png',
                        temporary: true,
                        type: 'image-result',
                        width: 480,
                    },
                ],
            },
        ]

        render(<ChatMessageList {...defaultProps} messages={imageMessages} />)

        const heightEstimates = virtuosoHarness.props?.heightEstimates as number[]
        expect(heightEstimates).toHaveLength(imageMessages.length)
        expect(heightEstimates[1]).toBeGreaterThan(heightEstimates[0])
        expect(virtuosoHarness.props).not.toHaveProperty('defaultItemHeight')
        expect(virtuosoHarness.props).not.toHaveProperty('fixedItemHeight')
    })

    it('keeps completed long text and rich fixture cards close to their measured height class', () => {
        const defaultProps = {
            enableReasoning: false,
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
            status: 'ready' as const,
        }
        const longTextMessage: MindMessage = {
            id: 'completed-long-text',
            role: 'assistant',
            createdAt: '2026-08-30T10:00:00.000Z',
            parts: [
                {
                    id: 'completed-long-text-part',
                    type: 'text',
                    format: 'markdown',
                    text: Array.from({ length: 180 }, (_, index) => `第 ${index + 1} 行已完成的长消息。`).join('\n'),
                },
            ],
        }

        virtuosoHarness.renderRange = { startIndex: 0, endIndex: 0 }
        render(<ChatMessageList {...defaultProps} messages={[longTextMessage, ...createMessageVirtualizationFixture()]} />)

        const heightEstimates = virtuosoHarness.props?.heightEstimates as number[]

        expect(heightEstimates[0]).toBeGreaterThan(4_000)
        expect(heightEstimates[894]).toBeGreaterThanOrEqual(320) // fixture 893: Skill + Prompt
        expect(heightEstimates[896]).toBeGreaterThanOrEqual(200) // fixture 895: Agent Trace
        expect(heightEstimates[898]).toBeGreaterThanOrEqual(960) // fixture 897: Image Brief + Result
        expect(heightEstimates[996]).toBeGreaterThanOrEqual(360) // fixture 995: Tool
        expect(heightEstimates[998]).toBeGreaterThanOrEqual(380) // fixture 997: Resource
    })

    it('estimates only parts that the current assistant presentation can render', () => {
        const defaultProps = {
            enableReasoning: false,
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
            status: 'ready' as const,
        }
        const textOnly: MindMessage = {
            id: 'text-only',
            role: 'assistant',
            createdAt: '2026-08-30T10:00:00.000Z',
            parts: [{ id: 'text-only-part', type: 'text', format: 'markdown', text: '完成态回复。' }],
        }
        const hiddenReasoning = createAssistantMessage('hidden-reasoning', '完成态回复。')
        const nonRenderedWorkflow: MindMessage = {
            id: 'non-rendered-workflow',
            role: 'assistant',
            createdAt: '2026-08-30T10:01:00.000Z',
            parts: [
                { id: 'workflow-text', type: 'text', format: 'markdown', text: '完成态回复。' },
                {
                    id: 'ordinary-workflow',
                    type: 'workflow-progress',
                    workflowId: 'ordinary-workflow-run',
                    workflowKind: 'ordinary-workflow',
                    title: '普通工作流',
                    status: 'completed',
                    summary: '已完成',
                    visibility: 'collapsed',
                    steps: [],
                },
            ],
        }

        const page = render(<ChatMessageList {...defaultProps} messages={[textOnly, hiddenReasoning, nonRenderedWorkflow]} />)

        const heightEstimates = virtuosoHarness.props?.heightEstimates as number[]

        expect(heightEstimates[1]).toBe(heightEstimates[0])
        expect(heightEstimates[2]).toBe(heightEstimates[0])

        page.rerender(<ChatMessageList {...defaultProps} enableReasoning messages={[textOnly, hiddenReasoning, nonRenderedWorkflow]} />)

        const revealedHeightEstimates = virtuosoHarness.props?.heightEstimates as number[]

        expect(revealedHeightEstimates[1]).toBeGreaterThan(revealedHeightEstimates[0])
        expect(revealedHeightEstimates[2]).toBe(revealedHeightEstimates[0])
    })

    it('uses wider visual units for unbroken CJK prose than equal-length ASCII prose', () => {
        const defaultProps = {
            enableReasoning: false,
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
            status: 'ready' as const,
        }
        const messages: MindMessage[] = [
            {
                id: 'ascii-prose',
                role: 'assistant',
                createdAt: '2026-08-30T10:00:00.000Z',
                parts: [{ id: 'ascii-prose-part', type: 'text', format: 'markdown', text: 'a'.repeat(240) }],
            },
            {
                id: 'cjk-prose',
                role: 'assistant',
                createdAt: '2026-08-30T10:01:00.000Z',
                parts: [{ id: 'cjk-prose-part', type: 'text', format: 'markdown', text: '中'.repeat(240) }],
            },
        ]

        render(<ChatMessageList {...defaultProps} messages={messages} />)

        const heightEstimates = virtuosoHarness.props?.heightEstimates as number[]

        expect(heightEstimates[1]).toBeGreaterThan(heightEstimates[0])
    })

    it('contains assistant part margins within the measured message row', () => {
        const { container } = render(
            <ChatMessageList
                messages={[createAssistantMessage()]}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(container.querySelector('article > div')?.classList.contains('flow-root')).toBe(true)
    })

    it('prepares nearest user composer mappings without rescanning message prefixes', () => {
        const firstComposer = createDeliveryChainComposer()
        const secondComposer = { ...createDeliveryChainComposer(), plainText: '第二轮' }
        const messages: MindMessage[] = [
            {
                id: 'user-1',
                role: 'user',
                createdAt: '2026-08-20T10:00:00.000Z',
                composer: firstComposer,
                parts: [{ type: 'text', text: '第一轮', format: 'markdown' }],
            },
            createAssistantMessage('assistant-1'),
            {
                id: 'user-2',
                role: 'user',
                createdAt: '2026-08-20T10:01:00.000Z',
                composer: secondComposer,
                parts: [{ type: 'text', text: '第二轮', format: 'markdown' }],
            },
            createAssistantMessage('assistant-2'),
        ]
        const sliceSpy = vi.spyOn(messages, 'slice')

        render(
            <ChatMessageList
                messages={messages}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(sliceSpy).not.toHaveBeenCalled()
        expect(assistantMessageRenderSpy).toHaveBeenCalledWith(
            expect.objectContaining({ message: messages[1], requestComposer: firstComposer })
        )
        expect(assistantMessageRenderSpy).toHaveBeenCalledWith(
            expect.objectContaining({ message: messages[3], requestComposer: secondComposer })
        )
    })

    it('keeps meaningful disclosure choices after two virtual unmount roundtrips', () => {
        const messages = createDisclosureMessages()
        const props = {
            conversationId: 'conversation-disclosure',
            enableReasoning: true,
            messages,
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
            status: 'ready' as const,
        }
        const page = render(<ChatMessageList {...props} />)

        fireEvent.click(screen.getByText('已完成思考'))
        fireEvent.click(screen.getByRole('button', { name: '已处理 3s' }))
        const resourceDetails = screen.getByText('查看原始预览（最多 3000 字）').closest('details') as HTMLDetailsElement
        resourceDetails.open = true
        fireEvent(resourceDetails, new Event('toggle'))
        fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
        fireEvent.click(screen.getByRole('button', { name: '收起详情' }))

        for (let roundtrip = 0; roundtrip < 2; roundtrip += 1) {
            virtuosoHarness.renderRange = { startIndex: 0, endIndex: -1 }
            page.rerender(<ChatMessageList {...props} />)
            expect(screen.queryByRole('button', { name: '已完成思考' })).toBeNull()

            virtuosoHarness.renderRange = null
            page.rerender(<ChatMessageList {...props} />)

            expect(screen.getByText('已完成思考').closest('button')?.getAttribute('aria-expanded')).toBe('true')
            expect(screen.getByText('持久工作流详情')).toBeTruthy()
            expect((screen.getByText('查看原始预览（最多 3000 字）').closest('details') as HTMLDetailsElement).open).toBe(true)
            expect(screen.getByRole('button', { name: '展开详情' })).toBeTruthy()
            fireEvent.click(screen.getByRole('button', { name: '展开详情' }))
            expect(screen.getByText('Run')).toBeTruthy()
            fireEvent.click(screen.getByRole('button', { name: '收起详情' }))
        }
    })

    it('isolates disclosure state by conversation and prunes replaced part identities', () => {
        const defaultProps = {
            enableReasoning: true,
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
            status: 'ready' as const,
        }
        const page = render(
            <ChatMessageList {...defaultProps} conversationId="conversation-a" messages={createDisclosureMessages('reasoning-a')} />
        )

        fireEvent.click(screen.getByText('已完成思考'))
        expect(screen.getByText('已完成思考').closest('button')?.getAttribute('aria-expanded')).toBe('true')

        page.rerender(
            <ChatMessageList {...defaultProps} conversationId="conversation-b" messages={createDisclosureMessages('reasoning-a')} />
        )
        expect(screen.getByText('已完成思考').closest('button')?.getAttribute('aria-expanded')).toBe('false')

        fireEvent.click(screen.getByText('已完成思考'))
        page.rerender(
            <ChatMessageList {...defaultProps} conversationId="conversation-b" messages={createDisclosureMessages('reasoning-b')} />
        )
        expect(screen.getByText('已完成思考').closest('button')?.getAttribute('aria-expanded')).toBe('false')

        fireEvent.click(screen.getByText('已完成思考'))
        page.rerender(
            <ChatMessageList
                {...defaultProps}
                conversationId="conversation-b"
                messages={createDisclosureMessages('reasoning-b').slice(1)}
            />
        )
        page.rerender(
            <ChatMessageList {...defaultProps} conversationId="conversation-b" messages={createDisclosureMessages('reasoning-b')} />
        )
        expect(screen.getByText('已完成思考').closest('button')?.getAttribute('aria-expanded')).toBe('false')
    })

    it('copies a command chip with its stable command name', () => {
        const message: MindMessage = {
            id: 'user-image',
            role: 'user',
            createdAt: '2026-08-01T10:00:00.000Z',
            parts: [
                {
                    type: 'text',
                    text: '生成猫咪照片',
                    format: 'markdown',
                    displaySegments: [
                        { type: 'command', command: { label: '生成图片', name: 'image' } },
                        { type: 'text', text: ' 生成猫咪照片' },
                    ],
                },
            ],
        }

        expect(getMessageCopyText(message)).toBe('/image 生成猫咪照片')
    })

    it('隐藏深度思考时不展示 reasoning 面板', () => {
        render(
            <ChatMessageList
                messages={[createAssistantMessage()]}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.getByText('最终答案')).toBeTruthy()
        expect(screen.queryByText('已完成思考')).toBeNull()
        expect(screen.queryByText('先分析用户问题，再组织最终回答。')).toBeNull()
    })

    it('开启深度思考时展示 reasoning 面板', () => {
        render(
            <ChatMessageList
                messages={[createAssistantMessage()]}
                status="ready"
                enableReasoning
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.getByText('最终答案')).toBeTruthy()
        expect(screen.getByText('已完成思考')).toBeTruthy()
        expect(screen.getByText('先分析用户问题，再组织最终回答。')).toBeTruthy()
    })

    it('会把上一条 user composer 传给 delivery-chain assistant message，用于聚合内部 demo resources', () => {
        const messages: MindMessage[] = [
            {
                id: 'user-delivery-chain',
                role: 'user',
                createdAt: '2026-06-29T12:00:00.000Z',
                composer: createDeliveryChainComposer(),
                parts: [
                    {
                        id: 'user-text',
                        type: 'text',
                        text: '/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md',
                        format: 'markdown',
                    },
                ],
            },
            {
                id: 'assistant-delivery-chain',
                role: 'assistant',
                createdAt: '2026-06-29T12:00:01.000Z',
                parts: [
                    createResourcePart('plan-rubric.md', 'demo://rubrics/plan-rubric.md'),
                    createResourcePart('task-rubric.md', 'demo://rubrics/task-rubric.md'),
                    createResourcePart('review-rubric.md', 'demo://rubrics/review-rubric.md'),
                    createResourcePart('delivery-boundaries.md', 'demo://governance/delivery-boundaries.md'),
                    createResourcePart('engineering-rules.md', 'demo://governance/engineering-rules.md'),
                    createResourcePart('request-limit-banner/requirement.md', 'demo://scenarios/request-limit-banner/requirement.md'),
                    createResourcePart('request-limit-banner/context.md', 'demo://scenarios/request-limit-banner/context.md'),
                    {
                        id: 'report-text',
                        type: 'text',
                        text: '# Delivery Chain Report / 交付计划报告',
                        format: 'markdown',
                    },
                ],
            },
        ]

        render(
            <ChatMessageList
                messages={messages}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.getByText('已读取 demo 上下文 6 项')).toBeTruthy()
        expect(screen.queryByText('资源读取：plan-rubric.md')).toBeNull()
    })

    it('hides empty-state suggestions when the parent marks the empty state as non-draft', () => {
        render(
            <ChatMessageList
                messages={[]}
                status="ready"
                enableReasoning={false}
                showEmptyStateSuggestions={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.queryByText('试试这些能力')).toBeNull()
    })

    it('keeps completed-reply recommendations in the tree while their actions are temporarily unavailable', () => {
        render(
            <ChatMessageList
                actionsDisabled
                messages={[createAssistantMessage()]}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        const recommendationButtons = within(screen.getByRole('group', { name: '推荐问题' })).getAllByRole('button')

        expect(recommendationButtons).toHaveLength(3)
        expect(recommendationButtons.every(button => (button as HTMLButtonElement).disabled)).toBe(true)
    })

    it('only rerenders the latest assistant message when recommendation actions become disabled', () => {
        const messages = [createAssistantMessage('assistant-history', '历史回复'), createAssistantMessage('assistant-latest', '最新回复')]
        const props = {
            enableReasoning: false,
            messages,
            status: 'ready' as const,
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
        }
        const page = render(<ChatMessageList {...props} />)

        assistantMessageRenderSpy.mockClear()
        page.rerender(<ChatMessageList {...props} actionsDisabled />)

        expect(assistantMessageRenderSpy).toHaveBeenCalledTimes(1)
        expect(assistantMessageRenderSpy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                followUpSuggestionsDisabled: true,
                message: expect.objectContaining({ id: 'assistant-latest' }),
            })
        )
    })

    it('renders image summary and result parts after an image generation task completes', async () => {
        const message: MindMessage = {
            id: 'assistant-image-result',
            role: 'assistant',
            createdAt: '2026-08-01T10:00:00.000Z',
            parts: [
                {
                    id: 'image-brief-1',
                    type: 'image-brief',
                    runId: 'run-1',
                    summary: {
                        assumptions: [],
                        avoid: [],
                        intent: '一只晒太阳的猫',
                        mustInclude: [],
                        scene: '阳台',
                        subjects: ['猫'],
                    },
                },
                {
                    id: 'image-result-1',
                    type: 'image-result',
                    runId: 'run-1',
                    contentPath: '/api/chat/runs/run-1/image',
                    expiresAt: '2000-01-01T00:00:00.000Z',
                    suggestedFileName: 'cat.png',
                    temporary: true,
                },
            ],
        }

        const onSelectFollowUpQuestion = vi.fn()

        render(
            <ChatMessageList
                messages={[message]}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={onSelectFollowUpQuestion}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.getByText('图像生成摘要')).toBeTruthy()
        expect(screen.getByText('生成结果')).toBeTruthy()

        const recommendationButtons = within(screen.getByRole('group', { name: '推荐问题' })).getAllByRole('button')
        await waitFor(() => expect(screen.getByText(/临时图片已过期/)).toBeTruthy())
        const selectedQuestion = recommendationButtons[0].textContent ?? ''

        fireEvent.click(recommendationButtons[0])

        expect(onSelectFollowUpQuestion).toHaveBeenCalledWith(selectedQuestion)
    })
})
