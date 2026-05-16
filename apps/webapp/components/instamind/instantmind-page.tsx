'use client'

import { ArrowDown, CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ChatComposer } from '@/components/chat/composer/chat-composer'
import { ChatMessageList } from '@/components/chat/message-list/chat-message-list'
import type { EmptyStateSuggestion } from '@/components/chat/message-list/suggestions/empty-state-suggestion-options'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { type ChatModel, defaultChatModel } from '@/lib/ai/models'
import type { ChatComposerDisplaySegment, ChatComposerPayload, ChatSkillMode } from '@/lib/ai/types/chat'

import { useChatStream } from './use-chat-stream'

// 输入框固定在页面底部；这里给主内容额外留白，让最后一段回答滚到底时仍和输入框保持 128px 的舒适距离。
// 调大：底部空白更明显、触底滚动更不贴边；调小：页面更紧凑，但最后内容更容易贴近输入框。
const EXTRA_BOTTOM_SCROLL_SPACING = 128

// 用户离开底部超过 120px 时显示“回到底部”按钮，避免只差几像素时按钮反复闪烁。
// 调大：按钮出现更晚；调小：按钮更敏感。
const SCROLL_TO_BOTTOM_THRESHOLD = 120

// 自动跟随的最小滚动间隔。流式 Markdown 可能一帧内多次增高，64ms 可以合并滚动请求，减少视觉抖动。
// 调大：滚动频率更低但跟随略滞后；调小：跟随更即时但更容易抖。
const AUTO_SCROLL_MIN_INTERVAL_MS = 64

// 距离底部超过 64px 才真正执行自动滚动，让一两行新增内容先消耗底部缓冲，避免每来一点内容就滚一次。
// 调大：自动滚动更少、更稳；调小：更贴底但滚动更频繁。
const AUTO_SCROLL_DISTANCE_THRESHOLD = 64

// 自动跟随到底部的短缓动时长。这里保持很短，避免和持续增高的流式内容互相“追逐”造成卡顿。
// 调大：更柔和但可能拖泥带水；调小或 0：更干脆但动画感更弱。
const AUTO_SCROLL_ANIMATION_DURATION_MS = 120

// 用户点击“回到底部”按钮时的缓动时长，比自动跟随略长，让主动操作有更清楚的反馈。
const SCROLL_TO_BOTTOM_CLICK_ANIMATION_DURATION_MS = 180

// wheel/touchmove/键盘滚动与 scroll 事件不是同一时刻触发；保留 160ms 意图窗口，用于判断后续 scroll 是否来自用户。
// 调大：更容易识别为用户滚动；调小：可能漏判慢一点的触控板/移动端滚动。
const USER_SCROLL_INTENT_RESET_DELAY = 160

// 聊天页保留浏览器整页滚动，不引入内部滚动容器，因此滚动目标统一收口到 document.scrollingElement。
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
    const [skillMode, setSkillMode] = useState<ChatSkillMode>('auto')
    const [model, setModel] = useState<ChatModel>(defaultChatModel)
    const [enableReasoning, setEnableReasoning] = useState(true)
    const inputContainerRef = useRef<HTMLDivElement>(null)
    const inputHeightRef = useRef<number | null>(null)
    // 用户滚动意图与程序滚动分开记录，防止 window.scrollTo 触发 scroll 后被误判成用户手动浏览。
    const userScrollIntentRef = useRef(false)
    const userScrollIntentTimeoutRef = useRef<number | null>(null)
    const autoScrollLockedForCurrentTurnRef = useRef(false)
    const programmaticScrollRef = useRef(false)
    const programmaticScrollResetRafRef = useRef<number | null>(null)
    // 高频滚动调度状态全部放在 ref，避免每次流式增量或 scroll 事件都推动 React 重渲染。
    const lastAutoScrollAtRef = useRef(0)
    const pendingAutoScrollTimeoutRef = useRef<number | null>(null)
    const scrollAnimationRafRef = useRef<number | null>(null)
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
    const wasStreamingOutputRef = useRef(isStreamingOutput)

    useEffect(() => {
        isStreamingOutputRef.current = isStreamingOutput
    }, [isStreamingOutput])

    const clearProgrammaticScrollReset = useCallback(() => {
        if (programmaticScrollResetRafRef.current === null) {
            return
        }

        window.cancelAnimationFrame(programmaticScrollResetRafRef.current)
        programmaticScrollResetRafRef.current = null
    }, [])

    const clearPendingAutoScroll = useCallback(() => {
        if (pendingAutoScrollTimeoutRef.current === null) {
            return
        }

        window.clearTimeout(pendingAutoScrollTimeoutRef.current)
        pendingAutoScrollTimeoutRef.current = null
    }, [])

    const clearScrollAnimation = useCallback(() => {
        if (scrollAnimationRafRef.current === null) {
            return
        }

        window.cancelAnimationFrame(scrollAnimationRafRef.current)
        scrollAnimationRafRef.current = null
    }, [])

    const markProgrammaticScroll = useCallback(() => {
        programmaticScrollRef.current = true
        clearProgrammaticScrollReset()

        // 程序滚动会异步触发 scroll 事件，延后两个 rAF 再清标记，覆盖浏览器实际派发事件的时间差。
        programmaticScrollResetRafRef.current = window.requestAnimationFrame(() => {
            programmaticScrollResetRafRef.current = window.requestAnimationFrame(() => {
                programmaticScrollRef.current = false
                programmaticScrollResetRafRef.current = null
            })
        })
    }, [clearProgrammaticScrollReset])

    const scrollPageToBottomFromCode = useCallback(
        (durationMs = AUTO_SCROLL_ANIMATION_DURATION_MS) => {
            clearScrollAnimation()
            markProgrammaticScroll()

            const startTop = getPageScroller().scrollTop
            const targetTop = getPageScrollTop()
            const distance = targetTop - startTop

            if (durationMs <= 0 || Math.abs(distance) < 1) {
                scrollPageToBottom()
                return
            }

            const startedAt = performance.now()

            const step = (timestamp: number) => {
                const progress = Math.min(1, (timestamp - startedAt) / durationMs)
                // 自动跟随只做短促缓动，过长动画会和持续增长的内容高度互相追逐，反而更容易卡顿。
                const easedProgress = 1 - (1 - progress) ** 3

                markProgrammaticScroll()
                window.scrollTo({
                    top: startTop + distance * easedProgress,
                    behavior: 'auto',
                })

                if (progress < 1) {
                    scrollAnimationRafRef.current = window.requestAnimationFrame(step)
                    return
                }

                scrollAnimationRafRef.current = null
                markProgrammaticScroll()
                scrollPageToBottom()
            }

            scrollAnimationRafRef.current = window.requestAnimationFrame(step)
        },
        [clearScrollAnimation, markProgrammaticScroll]
    )

    const scheduleScrollSync = useCallback(
        (allowAutoFollow = false) => {
            // 多个 messages/bottomSpacing/resize 变化会合并到同一帧处理，先测量，再决定是否滚动。
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
                const canAutoFollow =
                    shouldAutoFollow &&
                    isStreamingOutputRef.current &&
                    !autoScrollLockedForCurrentTurnRef.current &&
                    !userScrollIntentRef.current

                setShowScrollToBottom(current => {
                    if (canAutoFollow) {
                        return current ? false : current
                    }

                    return current === shouldShowScrollToBottom ? current : shouldShowScrollToBottom
                })

                if (!canAutoFollow) {
                    return
                }

                if (distanceFromBottom <= AUTO_SCROLL_DISTANCE_THRESHOLD) {
                    return
                }

                // 距离底部超过缓冲阈值后再滚动，并用最小间隔合并多次流式 DOM 更新。
                const now = performance.now()
                const remainingThrottleTime = AUTO_SCROLL_MIN_INTERVAL_MS - (now - lastAutoScrollAtRef.current)

                if (remainingThrottleTime > 0) {
                    if (pendingAutoScrollTimeoutRef.current === null) {
                        pendingAutoScrollTimeoutRef.current = window.setTimeout(() => {
                            pendingAutoScrollTimeoutRef.current = null

                            if (!isStreamingOutputRef.current || autoScrollLockedForCurrentTurnRef.current || userScrollIntentRef.current) {
                                return
                            }

                            const latestScroller = getPageScroller()
                            const latestDistanceFromBottom =
                                latestScroller.scrollHeight - latestScroller.scrollTop - latestScroller.clientHeight

                            if (latestDistanceFromBottom <= AUTO_SCROLL_DISTANCE_THRESHOLD) {
                                return
                            }

                            lastAutoScrollAtRef.current = performance.now()
                            scrollPageToBottomFromCode()
                            setShowScrollToBottom(current => (current ? false : current))
                        }, remainingThrottleTime)
                    }

                    return
                }

                clearPendingAutoScroll()
                lastAutoScrollAtRef.current = now
                scrollPageToBottomFromCode()
                setShowScrollToBottom(current => (current ? false : current))
            })
        },
        [clearPendingAutoScroll, scrollPageToBottomFromCode]
    )

    useEffect(() => {
        return () => {
            if (scrollSyncRafRef.current !== null) {
                window.cancelAnimationFrame(scrollSyncRafRef.current)
                scrollSyncRafRef.current = null
            }

            clearProgrammaticScrollReset()
            clearPendingAutoScroll()
            clearScrollAnimation()
        }
    }, [clearPendingAutoScroll, clearProgrammaticScrollReset, clearScrollAnimation])

    useEffect(() => {
        if (!inputContainerRef.current) {
            return
        }

        // 输入框高度会随着多行输入、工具栏状态变化而改变，底部留白必须同步更新。
        const updateSpacing = () => {
            const height = inputContainerRef.current?.offsetHeight ?? 0

            if (inputHeightRef.current === height) {
                return
            }

            inputHeightRef.current = height
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

            // wheel/touchmove 与 scroll 不是同一个事件，短暂保留意图标记，让后续 scroll 能消费它。
            userScrollIntentTimeoutRef.current = window.setTimeout(() => {
                userScrollIntentRef.current = false
                userScrollIntentTimeoutRef.current = null
            }, USER_SCROLL_INTENT_RESET_DELAY)
        }

        const markUserScrollIntent = () => {
            if (!isStreamingOutputRef.current) {
                return
            }

            // 本轮流式输出期间，一旦用户主动浏览历史内容，就锁住自动跟随，直到下一轮请求重置。
            userScrollIntentRef.current = true
            scheduleUserScrollIntentReset()
        }

        const handleWheel = (event: WheelEvent) => {
            if (isEditableTarget(event.target)) {
                return
            }

            clearScrollAnimation()

            if (isStreamingOutputRef.current) {
                markUserScrollIntent()
            }
        }

        const handleTouchMove = (event: TouchEvent) => {
            if (isEditableTarget(event.target)) {
                return
            }

            clearScrollAnimation()

            if (isStreamingOutputRef.current) {
                markUserScrollIntent()
            }
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isScrollNavigationKey(event)) {
                return
            }

            clearScrollAnimation()

            if (isStreamingOutputRef.current) {
                markUserScrollIntent()
            }
        }

        const handleScroll = () => {
            const isProgrammaticScroll = programmaticScrollRef.current && !userScrollIntentRef.current

            if (isProgrammaticScroll) {
                userScrollIntentRef.current = false
                clearUserScrollIntentTimeout()
                return
            }

            if (!isStreamingOutputRef.current) {
                userScrollIntentRef.current = false
                clearUserScrollIntentTimeout()
                scheduleScrollSync(false)
                return
            }

            if (!isProgrammaticScroll && userScrollIntentRef.current) {
                // 只有“用户输入事件之后发生的 scroll”才视为手动滚动，程序触底滚动不会触发本轮锁定。
                autoScrollLockedForCurrentTurnRef.current = true
                clearPendingAutoScroll()
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
    }, [clearPendingAutoScroll, clearScrollAnimation, scheduleScrollSync])

    useEffect(() => {
        // 任何消息增量、输入框高度或流式状态变化，都只调度一次页面级滚动同步。
        scheduleScrollSync(isStreamingOutput)
    }, [bottomSpacing, isStreamingOutput, messages, scheduleScrollSync])

    useEffect(() => {
        const wasStreamingOutput = wasStreamingOutputRef.current

        wasStreamingOutputRef.current = isStreamingOutput

        if (!wasStreamingOutput || isStreamingOutput || autoScrollLockedForCurrentTurnRef.current) {
            return
        }

        clearPendingAutoScroll()
        window.requestAnimationFrame(() => {
            if (autoScrollLockedForCurrentTurnRef.current) {
                return
            }

            // 流结束后再对齐一次底部，覆盖最后一批 Markdown 渲染导致的高度补涨。
            scrollPageToBottomFromCode()
            setShowScrollToBottom(current => (current ? false : current))
        })
    }, [clearPendingAutoScroll, isStreamingOutput, scrollPageToBottomFromCode])

    async function handleSubmit(value: string, composer?: ChatComposerPayload, displaySegments?: ChatComposerDisplaySegment[]) {
        // 新一轮请求开始前恢复自动跟随；用户上一轮的手动浏览锁定不带到下一轮。
        autoScrollLockedForCurrentTurnRef.current = false
        programmaticScrollRef.current = false
        lastAutoScrollAtRef.current = 0
        clearPendingAutoScroll()
        userScrollIntentRef.current = false
        if (userScrollIntentTimeoutRef.current !== null) {
            window.clearTimeout(userScrollIntentTimeoutRef.current)
            userScrollIntentTimeoutRef.current = null
        }

        // sendMessage 内部会立即写入用户消息并切到 submitted；这里返回 true 代表 Composer 可以立刻清空草稿，
        // 不需要等完整流式回答结束后才清空输入框。
        void sendMessage(value, composer, displaySegments)
        return true
    }

    function handleSelectSuggestion(suggestion: EmptyStateSuggestion) {
        if (status === 'submitted' || status === 'streaming') {
            return
        }

        void handleSubmit(suggestion.text, suggestion.composer, suggestion.displaySegments)
    }

    function handleSelectFollowUpQuestion(question: string) {
        if (status === 'submitted' || status === 'streaming') {
            return
        }

        void handleSubmit(question)
    }

    async function handleRegenerateLastTurn() {
        // 重新生成等价于新一轮 assistant 输出，也需要重新开启自动跟随策略。
        autoScrollLockedForCurrentTurnRef.current = false
        programmaticScrollRef.current = false
        lastAutoScrollAtRef.current = 0
        clearPendingAutoScroll()
        userScrollIntentRef.current = false
        if (userScrollIntentTimeoutRef.current !== null) {
            window.clearTimeout(userScrollIntentTimeoutRef.current)
            userScrollIntentTimeoutRef.current = null
        }

        return regenerateLastTurn()
    }

    function handleScrollToBottomClick() {
        // 用户点击“回到底部”是明确的恢复跟随意图，因此清掉本轮锁定并立即对齐页面底部。
        autoScrollLockedForCurrentTurnRef.current = false
        userScrollIntentRef.current = false
        clearPendingAutoScroll()
        if (userScrollIntentTimeoutRef.current !== null) {
            window.clearTimeout(userScrollIntentTimeoutRef.current)
            userScrollIntentTimeoutRef.current = null
        }

        scrollPageToBottomFromCode(SCROLL_TO_BOTTOM_CLICK_ANIMATION_DURATION_MS)
        setShowScrollToBottom(current => (current ? false : current))

        window.requestAnimationFrame(() => {
            scrollPageToBottomFromCode(SCROLL_TO_BOTTOM_CLICK_ANIMATION_DURATION_MS)
            setShowScrollToBottom(current => (current ? false : current))
        })
    }

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 px-6 pt-9" style={{ paddingBottom: `${bottomSpacing}px` }}>
                <header>
                    <h1 className="m-0 text-4xl font-semibold tracking-tight">AI Mind</h1>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">
                        AI Runtime 实验台：支持普通问答、深度思考、Tool 调用与多来源上下文读取。
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
                    enableReasoning={enableReasoning}
                    onDeleteUserTurn={deleteUserTurn}
                    onRegenerateLastTurn={handleRegenerateLastTurn}
                    onSelectFollowUpQuestion={handleSelectFollowUpQuestion}
                    onSelectSuggestion={handleSelectSuggestion}
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
                        <ChatComposer
                            status={status}
                            skillMode={skillMode}
                            model={model}
                            enableReasoning={enableReasoning}
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
