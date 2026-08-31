import '../../app/globals.css'

import { ArrowDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { ChatMessageList, type ChatMessageListHandle } from '@/components/chat/message-list/chat-message-list'
import { useChatScrollPolicy } from '@/components/instamind/use-chat-scroll-policy'
import { Button } from '@/components/ui/button'
import type { MindMessage } from '@/lib/ai/types/message'
import { createMessageVirtualizationFixture } from '@/lib/dev/message-virtualization/mixed-message-fixture'

function appendStreamingText(messages: MindMessage[], revision: number): MindMessage[] {
    const lastIndex = messages.length - 1
    const lastMessage = messages[lastIndex]

    if (!lastMessage || lastMessage.role !== 'assistant') {
        return messages
    }

    const streamingPartIndex = lastMessage.parts.findIndex(part => part.id === 'acceptance-streaming-text')
    const streamingPart = streamingPartIndex >= 0 ? lastMessage.parts[streamingPartIndex] : undefined
    const nextPart = {
        id: 'acceptance-streaming-text',
        type: 'text' as const,
        text:
            streamingPart?.type === 'text'
                ? `${streamingPart.text}\n- tick ${revision}：持续增长的 Markdown 内容。`
                : `持续增长的 Markdown 内容。\n\n- tick ${revision}`,
        format: 'markdown' as const,
    }
    const parts = [...lastMessage.parts]

    if (streamingPartIndex >= 0) {
        parts[streamingPartIndex] = nextPart
    } else {
        parts.push(nextPart)
    }

    return [
        ...messages.slice(0, lastIndex),
        {
            ...lastMessage,
            parts,
            status: 'streaming' as const,
        },
    ]
}

export function MessageVirtualizationHarness() {
    const [messages, setMessages] = useState(() => createMessageVirtualizationFixture())
    const [scrollViewportElement, setScrollViewportElement] = useState<HTMLDivElement | null>(null)
    const [streaming, setStreaming] = useState(false)
    const [streamRevision, setStreamRevision] = useState(0)
    const [composerTall, setComposerTall] = useState(false)
    const [entryPositioned, setEntryPositioned] = useState(false)
    const [scrollbarWidth, setScrollbarWidth] = useState(0)
    const listRef = useRef<ChatMessageListHandle>(null)
    const entryStartedRef = useRef(false)
    const {
        composerContainerRef,
        composerOverlayInset,
        onAtBottomChange,
        onRangeChange,
        onScrollingChange,
        onTotalHeightChange,
        positionConversationEntryAtBottom,
        resetScrollPolicyForNewTurn,
        restoreFollowAndScrollToEnd,
        showScrollToBottom,
    } = useChatScrollPolicy({
        contentSignal: streamRevision,
        isStreamingOutput: streaming,
        listRef,
        messageCount: messages.length,
        scrollViewportElement,
    })

    useEffect(() => {
        if (!streaming) {
            return
        }

        const interval = window.setInterval(() => {
            setStreamRevision(current => {
                const nextRevision = current + 1
                setMessages(currentMessages => appendStreamingText(currentMessages, nextRevision))
                return nextRevision
            })
        }, 180)

        return () => window.clearInterval(interval)
    }, [streaming])

    useEffect(() => {
        if (!scrollViewportElement || entryStartedRef.current) {
            return
        }

        entryStartedRef.current = true
        positionConversationEntryAtBottom(
            {
                conversationId: 'acceptance-1000',
                lastMessageIndex: messages.length - 1,
                sequence: 1,
            },
            () => setEntryPositioned(true)
        )
    }, [messages.length, positionConversationEntryAtBottom, scrollViewportElement])

    useEffect(() => {
        if (!scrollViewportElement) {
            return
        }

        const syncScrollbarWidth = () => {
            setScrollbarWidth(Math.max(0, scrollViewportElement.offsetWidth - scrollViewportElement.clientWidth))
        }

        syncScrollbarWidth()
        const observer = new ResizeObserver(syncScrollbarWidth)
        observer.observe(scrollViewportElement)

        return () => observer.disconnect()
    }, [scrollViewportElement])

    function toggleStreaming() {
        setStreaming(current => !current)
    }

    function simulateNewTurn() {
        setStreaming(true)
        resetScrollPolicyForNewTurn()
    }

    return (
        <main
            className="h-dvh overflow-hidden bg-background text-foreground"
            style={{ ['--chat-content-column-width' as string]: '53.5rem' }}
        >
            <div
                ref={setScrollViewportElement}
                role="region"
                tabIndex={0}
                aria-label="虚拟消息验收记录"
                className="h-full overflow-y-auto overscroll-contain"
                data-slot="chat-message-viewport"
                style={{ scrollbarGutter: 'stable' }}
            >
                <div className="px-4 pt-8 sm:px-6 lg:px-8" data-slot="chat-message-content">
                    <div className="mx-auto w-full max-w-[var(--chat-content-column-width)]" data-slot="chat-message-column">
                        <div
                            className={entryPositioned ? undefined : 'invisible'}
                            data-entry-positioned={String(entryPositioned)}
                            data-slot="conversation-history-presentation"
                        >
                            <ChatMessageList
                                ref={listRef}
                                bottomInset={composerOverlayInset + 54}
                                conversationId="acceptance-1000"
                                enableReasoning
                                messages={messages}
                                onAtBottomChange={onAtBottomChange}
                                onDeleteUserTurn={() => true}
                                onRangeChange={onRangeChange}
                                onRegenerateLastTurn={() => true}
                                onScrollingChange={onScrollingChange}
                                onSelectFollowUpQuestion={() => undefined}
                                onSelectSuggestion={() => undefined}
                                onTotalHeightChange={onTotalHeightChange}
                                scrollParent={scrollViewportElement}
                                status={streaming ? 'streaming' : 'ready'}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="fixed right-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-wrap justify-end gap-2 rounded-xl border bg-background/95 p-2 shadow-lg">
                <Button type="button" size="sm" variant="outline" onClick={toggleStreaming}>
                    {streaming ? '停止流式增长' : '开始流式增长'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={simulateNewTurn}>
                    模拟新一轮
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setComposerTall(current => !current)}>
                    {composerTall ? '缩短 Composer' : '增高 Composer'}
                </Button>
            </div>

            <div
                className="pointer-events-none fixed bottom-0 left-0 z-20 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-12 pb-4 sm:px-6 lg:px-8"
                data-slot="chat-composer-shell"
                style={{ right: scrollbarWidth }}
            >
                <div
                    className="pointer-events-none mx-auto w-full max-w-[var(--chat-content-column-width)]"
                    data-slot="chat-composer-column"
                >
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        aria-label="回到底部"
                        aria-hidden={!showScrollToBottom}
                        disabled={!showScrollToBottom}
                        onClick={restoreFollowAndScrollToEnd}
                        className="pointer-events-auto absolute bottom-full left-1/2 mb-3 -translate-x-1/2 rounded-full bg-background/95 shadow-md"
                    >
                        <ArrowDown aria-hidden="true" />
                    </Button>
                    <div ref={composerContainerRef}>
                        <div
                            className="pointer-events-auto flex items-center rounded-2xl border bg-background px-4 shadow-lg transition-[height]"
                            data-acceptance-composer-height={composerTall ? 'tall' : 'normal'}
                            style={{ height: composerTall ? 180 : 76 }}
                        >
                            <span className="text-sm text-muted-foreground">
                                1000 条消息本地验收 Composer（{streaming ? `streaming ${streamRevision}` : 'ready'}）
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}

createRoot(document.getElementById('root')!).render(<MessageVirtualizationHarness />)
