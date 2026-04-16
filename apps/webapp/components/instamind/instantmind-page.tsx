'use client'

import { ArrowDown, CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ChatInputForm } from '@/components/chat/chat-input-form'
import { ChatMessageList } from '@/components/chat/chat-message-list'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { type ChatModel, defaultChatModel } from '@/lib/ai/models'
import type { ChatSkillMode } from '@/lib/ai/types/chat'

import { useChatStream } from './use-chat-stream'

const EXTRA_BOTTOM_SCROLL_SPACING = 88
const SCROLL_TO_BOTTOM_THRESHOLD = 120
const USER_SCROLL_INTENT_RESET_DELAY = 160

function getPageScroller() {
    return document.scrollingElement ?? document.documentElement
}

function getPageScrollTop() {
    const scroller = getPageScroller()

    return Math.max(0, scroller.scrollHeight - scroller.clientHeight)
}

function scrollPageToBottom(behavior: ScrollBehavior = 'auto') {
    window.scrollTo({
        top: getPageScrollTop(),
        behavior,
    })
}

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
        return false
    }

    if (target.isContentEditable) {
        return true
    }

    const tagName = target.tagName

    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

function isScrollNavigationKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
        return false
    }

    return (
        event.key === 'PageUp' ||
        event.key === 'PageDown' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === ' ' ||
        event.key === 'Spacebar'
    )
}

export default function InstantMindPage() {
    const [input, setInput] = useState('')
    const [skillMode, setSkillMode] = useState<ChatSkillMode>('auto')
    const [model, setModel] = useState<ChatModel>(defaultChatModel)
    const [enableReasoning, setEnableReasoning] = useState(true)
    const inputContainerRef = useRef<HTMLDivElement>(null)
    const userScrollIntentRef = useRef(false)
    const userScrollIntentTimeoutRef = useRef<number | null>(null)
    const autoScrollLockedForCurrentTurnRef = useRef(false)
    const scrollSyncRafRef = useRef<number | null>(null)
    const scrollSyncAutoFollowRef = useRef(false)
    const [bottomSpacing, setBottomSpacing] = useState(220 + EXTRA_BOTTOM_SCROLL_SPACING)
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)
    const { messages, status, error, sendMessage, cancel, deleteUserTurn, regenerateLastTurn } = useChatStream({
        skillMode,
        model,
        enableReasoning,
    })
    const isStreamingOutput = status === 'submitted' || status === 'streaming'
    const isStreamingOutputRef = useRef(isStreamingOutput)

    useEffect(() => {
        isStreamingOutputRef.current = isStreamingOutput
    }, [isStreamingOutput])

    const scheduleScrollSync = useCallback((allowAutoFollow = false) => {
        scrollSyncAutoFollowRef.current = scrollSyncAutoFollowRef.current || allowAutoFollow

        if (scrollSyncRafRef.current !== null) {
            return
        }

        scrollSyncRafRef.current = window.requestAnimationFrame(() => {
            scrollSyncRafRef.current = null
            const shouldAutoFollow = scrollSyncAutoFollowRef.current
            scrollSyncAutoFollowRef.current = false

            const scroller = getPageScroller()
            const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
            const shouldShowScrollToBottom = distanceFromBottom > SCROLL_TO_BOTTOM_THRESHOLD

            setShowScrollToBottom(current => (current === shouldShowScrollToBottom ? current : shouldShowScrollToBottom))

            if (!shouldAutoFollow || !isStreamingOutputRef.current || autoScrollLockedForCurrentTurnRef.current) {
                return
            }

            scrollPageToBottom()
            setShowScrollToBottom(current => (current ? false : current))
        })
    }, [])

    useEffect(() => {
        return () => {
            if (scrollSyncRafRef.current !== null) {
                window.cancelAnimationFrame(scrollSyncRafRef.current)
                scrollSyncRafRef.current = null
            }
        }
    }, [])

    useEffect(() => {
        if (!inputContainerRef.current) {
            return
        }

        const updateSpacing = () => {
            const height = inputContainerRef.current?.offsetHeight ?? 0

            setBottomSpacing(height + EXTRA_BOTTOM_SCROLL_SPACING)
        }

        updateSpacing()

        const observer = new ResizeObserver(() => {
            updateSpacing()
        })

        observer.observe(inputContainerRef.current)

        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        const handleResize = () => {
            scheduleScrollSync(false)
        }

        handleResize()
        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
        }
    }, [scheduleScrollSync])

    useEffect(() => {
        const clearUserScrollIntentTimeout = () => {
            if (userScrollIntentTimeoutRef.current === null) {
                return
            }

            window.clearTimeout(userScrollIntentTimeoutRef.current)
            userScrollIntentTimeoutRef.current = null
        }

        const scheduleUserScrollIntentReset = () => {
            clearUserScrollIntentTimeout()

            userScrollIntentTimeoutRef.current = window.setTimeout(() => {
                userScrollIntentRef.current = false
                userScrollIntentTimeoutRef.current = null
            }, USER_SCROLL_INTENT_RESET_DELAY)
        }

        const markUserScrollIntent = () => {
            if (!isStreamingOutputRef.current) {
                return
            }

            userScrollIntentRef.current = true
            scheduleUserScrollIntentReset()
        }

        const handleWheel = (event: WheelEvent) => {
            if (isStreamingOutputRef.current && !isEditableTarget(event.target)) {
                markUserScrollIntent()
            }
        }

        const handleTouchMove = (event: TouchEvent) => {
            if (isStreamingOutputRef.current && !isEditableTarget(event.target)) {
                markUserScrollIntent()
            }
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isStreamingOutputRef.current && isScrollNavigationKey(event)) {
                markUserScrollIntent()
            }
        }

        const handleScroll = () => {
            if (!isStreamingOutputRef.current) {
                userScrollIntentRef.current = false
                clearUserScrollIntentTimeout()
                scheduleScrollSync(false)
                return
            }

            if (userScrollIntentRef.current) {
                autoScrollLockedForCurrentTurnRef.current = true
            }

            userScrollIntentRef.current = false
            clearUserScrollIntentTimeout()
            scheduleScrollSync(false)
        }

        window.addEventListener('wheel', handleWheel, { passive: true })
        window.addEventListener('touchmove', handleTouchMove, { passive: true })
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('scroll', handleScroll, { passive: true })

        return () => {
            window.removeEventListener('wheel', handleWheel)
            window.removeEventListener('touchmove', handleTouchMove)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('scroll', handleScroll)
            clearUserScrollIntentTimeout()
        }
    }, [scheduleScrollSync])

    useEffect(() => {
        scheduleScrollSync(isStreamingOutput)
    }, [bottomSpacing, isStreamingOutput, messages, scheduleScrollSync])

    async function handleSubmit() {
        const nextInput = input.trim()

        if (!nextInput) {
            return
        }

        autoScrollLockedForCurrentTurnRef.current = false
        userScrollIntentRef.current = false
        if (userScrollIntentTimeoutRef.current !== null) {
            window.clearTimeout(userScrollIntentTimeoutRef.current)
            userScrollIntentTimeoutRef.current = null
        }
        setInput('')
        const accepted = await sendMessage(nextInput)

        if (!accepted) {
            setInput(nextInput)
        }
    }

    async function handleRegenerateLastTurn() {
        autoScrollLockedForCurrentTurnRef.current = false
        userScrollIntentRef.current = false
        if (userScrollIntentTimeoutRef.current !== null) {
            window.clearTimeout(userScrollIntentTimeoutRef.current)
            userScrollIntentTimeoutRef.current = null
        }

        return regenerateLastTurn()
    }

    function handleScrollToBottomClick() {
        autoScrollLockedForCurrentTurnRef.current = false
        userScrollIntentRef.current = false
        if (userScrollIntentTimeoutRef.current !== null) {
            window.clearTimeout(userScrollIntentTimeoutRef.current)
            userScrollIntentTimeoutRef.current = null
        }

        scrollPageToBottom()
        setShowScrollToBottom(current => (current ? false : current))

        window.requestAnimationFrame(() => {
            scrollPageToBottom()
            setShowScrollToBottom(current => (current ? false : current))
        })
    }

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 px-6 pt-9" style={{ paddingBottom: `${bottomSpacing}px` }}>
                <header>
                    <h1 className="m-0 text-4xl font-semibold tracking-tight">InstantMind</h1>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">
                        基于 LangChain.js 与 Ollama 的最小运行时实验，支持工具调用、reader skill 和本地多轮上下文。
                    </p>
                </header>

                {error ? (
                    <Alert variant="destructive">
                        <CircleAlert className="size-4" strokeWidth={2.2} />
                        <AlertTitle>请求错误</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <ChatMessageList
                    messages={messages}
                    status={status}
                    onDeleteUserTurn={deleteUserTurn}
                    onRegenerateLastTurn={handleRegenerateLastTurn}
                />
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 overflow-visible bg-background/90 pb-4 backdrop-blur-sm">
                <div className="relative mx-auto max-w-5xl px-6">
                    <div
                        className={[
                            'pointer-events-none absolute left-1/2 bottom-full mb-3 -translate-x-1/2 transition-[opacity,transform] duration-200 ease-out',
                            showScrollToBottom ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
                        ].join(' ')}
                    >
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-lg"
                            aria-label="回到底部"
                            aria-hidden={!showScrollToBottom}
                            disabled={!showScrollToBottom}
                            onClick={handleScrollToBottomClick}
                            className="pointer-events-auto rounded-full border-border/70 bg-background/95 shadow-md shadow-black/5 hover:bg-muted/60"
                        >
                            <ArrowDown className="size-4" strokeWidth={2.4} />
                        </Button>
                    </div>

                    <div ref={inputContainerRef}>
                        <ChatInputForm
                            input={input}
                            status={status}
                            skillMode={skillMode}
                            model={model}
                            enableReasoning={enableReasoning}
                            onInputChange={setInput}
                            onSkillModeChange={setSkillMode}
                            onModelChange={setModel}
                            onEnableReasoningChange={setEnableReasoning}
                            onSubmit={handleSubmit}
                            onStop={cancel}
                        />
                    </div>
                </div>
            </div>
        </main>
    )
}
