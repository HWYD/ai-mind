'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

type UseChatAutoScrollOptions = {
    isStreamingOutput: boolean
    contentSignal: unknown
}

// 用户离开底部超过 120px 时显示“回到底部”按钮，避免只差几像素时按钮反复闪烁。
const SCROLL_TO_BOTTOM_THRESHOLD = 120

// 只有真正贴底才会因 Composer 尺寸变化再次对齐，避免打扰正在阅读历史的用户。
const PINNED_TO_END_THRESHOLD = 1

// 流式 Markdown 可能一帧内多次增高，64ms 可以合并滚动请求，减少视觉抖动。
const AUTO_SCROLL_MIN_INTERVAL_MS = 64

// 距离底部超过 64px 才真正执行自动跟随，让一两行新增内容先消耗底部缓冲。
const AUTO_SCROLL_DISTANCE_THRESHOLD = 64

// 流式自动跟随直接对齐底部，避免内容持续增高时反复取消、重启缓动动画。
const AUTO_SCROLL_ANIMATION_DURATION_MS = 0

// 用户点击“回到底部”按钮时的缓动时长，比自动跟随略长，让主动操作有更清楚的反馈。
const SCROLL_TO_BOTTOM_CLICK_ANIMATION_DURATION_MS = 180

// wheel/touchmove/键盘滚动与 scroll 事件不是同一时刻触发；保留 160ms 意图窗口，用于判断后续 scroll 是否来自用户。
const USER_SCROLL_INTENT_RESET_DELAY = 160

function getDistanceFromBottom(viewport: HTMLElement) {
    return Math.max(0, viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight)
}

function getBottomScrollTop(viewport: HTMLElement) {
    return Math.max(0, viewport.scrollHeight - viewport.clientHeight)
}

// 输入框内部滚动不应该被当作“用户正在浏览历史消息”，否则输入多行文本时会误锁自动跟随。
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

// 只识别会移动消息阅读位置的按键，普通输入和快捷键不参与自动滚动锁定。
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

interface ScrollSyncDecisionOptions {
    autoScrollLockedForCurrentTurn: boolean
    distanceFromBottom: number
    hasUserScrollIntent: boolean
    isStreamingOutput: boolean
    requestedAutoFollow: boolean
}

// 只做“是否自动跟随、是否显示回到底部按钮”的策略判断，不读取 DOM，也不执行真实滚动。
function resolveScrollSyncDecision({
    autoScrollLockedForCurrentTurn,
    distanceFromBottom,
    hasUserScrollIntent,
    isStreamingOutput,
    requestedAutoFollow,
}: ScrollSyncDecisionOptions) {
    const canAutoFollow = requestedAutoFollow && isStreamingOutput && !autoScrollLockedForCurrentTurn && !hasUserScrollIntent

    return {
        shouldScrollToBottom: canAutoFollow && distanceFromBottom > AUTO_SCROLL_DISTANCE_THRESHOLD,
        shouldShowScrollToBottom: canAutoFollow ? false : distanceFromBottom > SCROLL_TO_BOTTOM_THRESHOLD,
    }
}

export function useChatAutoScroll({ isStreamingOutput, contentSignal }: UseChatAutoScrollOptions) {
    const scrollViewportRef = useRef<HTMLDivElement>(null)
    const composerContainerRef = useRef<HTMLDivElement>(null)
    const messageContentRef = useRef<HTMLDivElement>(null)
    const userScrollIntentRef = useRef(false)
    const userScrollIntentTimeoutRef = useRef<number | null>(null)
    const autoScrollLockedForCurrentTurnRef = useRef(false)
    const programmaticScrollRef = useRef(false)
    const programmaticScrollResetRafRef = useRef<number | null>(null)
    const isPinnedToEndRef = useRef(true)
    // 高频滚动调度状态全部放在 ref，避免每次流式增量或 scroll 事件都推动 React 重渲染。
    const lastAutoScrollAtRef = useRef(0)
    const pendingAutoScrollTimeoutRef = useRef<number | null>(null)
    const scrollAnimationRafRef = useRef<number | null>(null)
    const scrollSyncRafRef = useRef<number | null>(null)
    const scrollSyncAutoFollowRef = useRef(false)
    const finishScrollRafRef = useRef<number | null>(null)
    const restoreAutoFollowRafRef = useRef<number | null>(null)
    const conversationEntryRafRef = useRef<number | null>(null)
    const conversationEntryPositionedCallbackRef = useRef<(() => void) | null>(null)
    const composerResizeRafRef = useRef<number | null>(null)
    const composerOverlayInsetRef = useRef(0)
    const previousComposerOverlayInsetRef = useRef<number | null>(null)
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)
    const [composerOverlayInset, setComposerOverlayInset] = useState(0)
    // 事件监听和 rAF 回调不会随每次 render 重新创建，用 ref 读取最新流式状态。
    const isStreamingOutputRef = useRef(isStreamingOutput)
    const wasStreamingOutputRef = useRef(isStreamingOutput)

    useEffect(() => {
        isStreamingOutputRef.current = isStreamingOutput
    }, [isStreamingOutput])

    const clearUserScrollIntentTimeout = useCallback(() => {
        if (userScrollIntentTimeoutRef.current === null) {
            return
        }

        window.clearTimeout(userScrollIntentTimeoutRef.current)
        userScrollIntentTimeoutRef.current = null
    }, [])

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

    const clearFinishScroll = useCallback(() => {
        if (finishScrollRafRef.current === null) {
            return
        }

        window.cancelAnimationFrame(finishScrollRafRef.current)
        finishScrollRafRef.current = null
    }, [])

    const clearRestoreAutoFollowScroll = useCallback(() => {
        if (restoreAutoFollowRafRef.current === null) {
            return
        }

        window.cancelAnimationFrame(restoreAutoFollowRafRef.current)
        restoreAutoFollowRafRef.current = null
    }, [])

    const clearComposerResizePositioning = useCallback(() => {
        if (composerResizeRafRef.current === null) {
            return
        }

        window.cancelAnimationFrame(composerResizeRafRef.current)
        composerResizeRafRef.current = null
    }, [])

    const cancelConversationEntryPositioning = useCallback(() => {
        if (conversationEntryRafRef.current !== null) {
            window.cancelAnimationFrame(conversationEntryRafRef.current)
            conversationEntryRafRef.current = null
        }

        conversationEntryPositionedCallbackRef.current = null
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

    const scrollViewportToBottomFromCode = useCallback(
        (durationMs = AUTO_SCROLL_ANIMATION_DURATION_MS) => {
            clearScrollAnimation()

            const viewport = scrollViewportRef.current

            if (!viewport) {
                return
            }

            markProgrammaticScroll()
            isPinnedToEndRef.current = true
            const startTop = viewport.scrollTop
            const targetTop = getBottomScrollTop(viewport)
            const distance = targetTop - startTop

            if (durationMs <= 0 || Math.abs(distance) < 1) {
                viewport.scrollTop = targetTop
                return
            }

            const startedAt = performance.now()

            const step = (timestamp: number) => {
                const activeViewport = scrollViewportRef.current

                if (!activeViewport) {
                    scrollAnimationRafRef.current = null
                    return
                }

                const progress = Math.min(1, (timestamp - startedAt) / durationMs)
                const easedProgress = 1 - (1 - progress) ** 3

                markProgrammaticScroll()
                activeViewport.scrollTop = startTop + distance * easedProgress

                if (progress < 1) {
                    scrollAnimationRafRef.current = window.requestAnimationFrame(step)
                    return
                }

                scrollAnimationRafRef.current = null
                markProgrammaticScroll()
                activeViewport.scrollTop = getBottomScrollTop(activeViewport)
                isPinnedToEndRef.current = true
            }

            scrollAnimationRafRef.current = window.requestAnimationFrame(step)
        },
        [clearScrollAnimation, markProgrammaticScroll]
    )

    const scheduleScrollSync = useCallback(
        (allowAutoFollow = false) => {
            scrollSyncAutoFollowRef.current = scrollSyncAutoFollowRef.current || allowAutoFollow

            if (scrollSyncRafRef.current !== null) {
                return
            }

            scrollSyncRafRef.current = window.requestAnimationFrame(() => {
                scrollSyncRafRef.current = null
                const requestedAutoFollow = scrollSyncAutoFollowRef.current
                scrollSyncAutoFollowRef.current = false
                const viewport = scrollViewportRef.current

                if (!viewport) {
                    return
                }

                const distanceFromBottom = getDistanceFromBottom(viewport)
                isPinnedToEndRef.current = distanceFromBottom <= PINNED_TO_END_THRESHOLD
                const decision = resolveScrollSyncDecision({
                    autoScrollLockedForCurrentTurn: autoScrollLockedForCurrentTurnRef.current,
                    distanceFromBottom,
                    hasUserScrollIntent: userScrollIntentRef.current,
                    isStreamingOutput: isStreamingOutputRef.current,
                    requestedAutoFollow,
                })

                setShowScrollToBottom(current =>
                    current === decision.shouldShowScrollToBottom ? current : decision.shouldShowScrollToBottom
                )

                if (!decision.shouldScrollToBottom) {
                    return
                }

                // 距离底部超过缓冲阈值后再滚动，并用最小间隔合并多次流式 DOM 更新。
                const now = performance.now()
                const remainingAutoScrollDelay = AUTO_SCROLL_MIN_INTERVAL_MS - (now - lastAutoScrollAtRef.current)

                if (remainingAutoScrollDelay > 0) {
                    if (pendingAutoScrollTimeoutRef.current === null) {
                        pendingAutoScrollTimeoutRef.current = window.setTimeout(() => {
                            pendingAutoScrollTimeoutRef.current = null

                            if (!isStreamingOutputRef.current || autoScrollLockedForCurrentTurnRef.current || userScrollIntentRef.current) {
                                return
                            }

                            const latestViewport = scrollViewportRef.current

                            if (!latestViewport || getDistanceFromBottom(latestViewport) <= AUTO_SCROLL_DISTANCE_THRESHOLD) {
                                return
                            }

                            lastAutoScrollAtRef.current = performance.now()
                            scrollViewportToBottomFromCode()
                            setShowScrollToBottom(current => (current ? false : current))
                        }, remainingAutoScrollDelay)
                    }

                    return
                }

                clearPendingAutoScroll()
                lastAutoScrollAtRef.current = now
                scrollViewportToBottomFromCode()
                setShowScrollToBottom(current => (current ? false : current))
            })
        },
        [clearPendingAutoScroll, scrollViewportToBottomFromCode]
    )

    const schedulePinnedViewportPositioning = useCallback(() => {
        const viewport = scrollViewportRef.current

        if (!viewport || !isPinnedToEndRef.current || composerResizeRafRef.current !== null) {
            return
        }

        const scrollTopBeforeResize = viewport.scrollTop

        composerResizeRafRef.current = window.requestAnimationFrame(() => {
            composerResizeRafRef.current = null

            const activeViewport = scrollViewportRef.current

            // Resize 之后、下一帧之前用户若已上滑，保留新的阅读位置而不是按旧贴底状态回贴。
            if (!activeViewport || Math.abs(activeViewport.scrollTop - scrollTopBeforeResize) > PINNED_TO_END_THRESHOLD) {
                return
            }

            scrollViewportToBottomFromCode()
            setShowScrollToBottom(current => (current ? false : current))
        })
    }, [scrollViewportToBottomFromCode])

    // 新一轮请求开始前恢复自动跟随；用户上一轮的手动浏览锁定不带到下一轮。
    const resetAutoScrollForNewTurn = useCallback(() => {
        autoScrollLockedForCurrentTurnRef.current = false
        programmaticScrollRef.current = false
        lastAutoScrollAtRef.current = 0
        clearPendingAutoScroll()
        clearScrollAnimation()
        clearFinishScroll()
        clearRestoreAutoFollowScroll()
        userScrollIntentRef.current = false
        clearUserScrollIntentTimeout()
    }, [clearFinishScroll, clearPendingAutoScroll, clearRestoreAutoFollowScroll, clearScrollAnimation, clearUserScrollIntentTimeout])

    // 用户点击“回到底部”是明确的恢复跟随意图，因此清掉本轮锁定并立即对齐消息视口底部。
    const restoreAutoFollowAndScrollToBottom = useCallback(() => {
        autoScrollLockedForCurrentTurnRef.current = false
        userScrollIntentRef.current = false
        clearPendingAutoScroll()
        clearFinishScroll()
        clearUserScrollIntentTimeout()
        clearRestoreAutoFollowScroll()

        scrollViewportToBottomFromCode(SCROLL_TO_BOTTOM_CLICK_ANIMATION_DURATION_MS)
        setShowScrollToBottom(current => (current ? false : current))

        restoreAutoFollowRafRef.current = window.requestAnimationFrame(() => {
            restoreAutoFollowRafRef.current = null
            scrollViewportToBottomFromCode(SCROLL_TO_BOTTOM_CLICK_ANIMATION_DURATION_MS)
            setShowScrollToBottom(current => (current ? false : current))
        })
    }, [
        clearFinishScroll,
        clearPendingAutoScroll,
        clearRestoreAutoFollowScroll,
        clearUserScrollIntentTimeout,
        scrollViewportToBottomFromCode,
    ])

    // 历史会话首次可见前直接对齐消息视口底部；独立于流式自动跟随与用户手动“回到底部”的缓动反馈。
    const positionConversationEntryAtBottom = useCallback(
        (onPositioned?: () => void) => {
            cancelConversationEntryPositioning()
            conversationEntryPositionedCallbackRef.current = onPositioned ?? null

            const positionEntry = () => {
                scrollViewportToBottomFromCode()
            }

            positionEntry()
            setShowScrollToBottom(current => (current ? false : current))

            // 消息卡片的本地测量可能在同一帧内补齐，首帧绘制前再校正一次。
            conversationEntryRafRef.current = window.requestAnimationFrame(() => {
                conversationEntryRafRef.current = null
                positionEntry()
                setShowScrollToBottom(current => (current ? false : current))
                const positionedCallback = conversationEntryPositionedCallbackRef.current
                conversationEntryPositionedCallbackRef.current = null
                positionedCallback?.()
            })
        },
        [cancelConversationEntryPositioning, scrollViewportToBottomFromCode]
    )

    // Composer 悬浮在消息视口上方；真实高度同时决定消息末尾安全区。只有变化前已经贴底，才在下一帧重新对齐最新消息。
    useLayoutEffect(() => {
        const composer = composerContainerRef.current
        const messageContent = messageContentRef.current

        if (!composer && !messageContent) {
            return
        }

        const syncComposerOverlayInset = () => {
            if (!composer) {
                return false
            }

            const nextInset = Math.ceil(composer.getBoundingClientRect().height)

            if (composerOverlayInsetRef.current === nextInset) {
                return false
            }

            composerOverlayInsetRef.current = nextInset
            setComposerOverlayInset(nextInset)

            return true
        }

        syncComposerOverlayInset()

        const observer = new ResizeObserver(entries => {
            const composerInsetChanged = entries.some(entry => entry.target === composer) && syncComposerOverlayInset()

            if (!composerInsetChanged && entries.some(entry => entry.target === messageContent)) {
                schedulePinnedViewportPositioning()
            }
        })

        if (composer) {
            observer.observe(composer)
        }

        if (messageContent) {
            observer.observe(messageContent)
        }

        return () => observer.disconnect()
    }, [schedulePinnedViewportPositioning])

    // Composer 的安全区先提交为消息内容的 padding，再排队校正；避免按旧 scrollHeight 对齐后漏掉这次真实末尾变化。
    useLayoutEffect(() => {
        const previousInset = previousComposerOverlayInsetRef.current
        previousComposerOverlayInsetRef.current = composerOverlayInset

        if (previousInset === null || previousInset === composerOverlayInset) {
            return
        }

        schedulePinnedViewportPositioning()
    }, [composerOverlayInset, schedulePinnedViewportPositioning])

    // 这个 effect 本体不启动新任务，只登记统一清理逻辑；卸载或依赖变化时取消尚未完成的异步滚动任务。
    useEffect(() => {
        return () => {
            if (scrollSyncRafRef.current !== null) {
                window.cancelAnimationFrame(scrollSyncRafRef.current)
                scrollSyncRafRef.current = null
            }

            clearProgrammaticScrollReset()
            clearPendingAutoScroll()
            clearScrollAnimation()
            clearFinishScroll()
            clearRestoreAutoFollowScroll()
            clearComposerResizePositioning()
            cancelConversationEntryPositioning()
            clearUserScrollIntentTimeout()
        }
    }, [
        cancelConversationEntryPositioning,
        clearComposerResizePositioning,
        clearFinishScroll,
        clearPendingAutoScroll,
        clearProgrammaticScrollReset,
        clearRestoreAutoFollowScroll,
        clearScrollAnimation,
        clearUserScrollIntentTimeout,
    ])

    useEffect(() => {
        const handleResize = () => {
            if (isPinnedToEndRef.current) {
                schedulePinnedViewportPositioning()
                return
            }

            scheduleScrollSync(false)
        }

        window.addEventListener('resize', handleResize)

        return () => window.removeEventListener('resize', handleResize)
    }, [schedulePinnedViewportPositioning, scheduleScrollSync])

    useEffect(() => {
        const viewport = scrollViewportRef.current

        if (!viewport) {
            return
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
            markUserScrollIntent()
        }

        const handleTouchMove = (event: TouchEvent) => {
            if (isEditableTarget(event.target)) {
                return
            }

            clearScrollAnimation()
            markUserScrollIntent()
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isScrollNavigationKey(event)) {
                return
            }

            clearScrollAnimation()
            markUserScrollIntent()
        }

        const handleScroll = () => {
            isPinnedToEndRef.current = getDistanceFromBottom(viewport) <= PINNED_TO_END_THRESHOLD
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

            if (userScrollIntentRef.current) {
                // 只有“用户输入事件之后发生的 scroll”才视为手动滚动，程序触底滚动不会触发本轮锁定。
                autoScrollLockedForCurrentTurnRef.current = true
                clearPendingAutoScroll()
            }

            userScrollIntentRef.current = false
            clearUserScrollIntentTimeout()
            scheduleScrollSync(false)
        }

        viewport.addEventListener('wheel', handleWheel, { passive: true })
        viewport.addEventListener('touchmove', handleTouchMove, { passive: true })
        viewport.addEventListener('keydown', handleKeyDown)
        viewport.addEventListener('scroll', handleScroll, { passive: true })

        return () => {
            viewport.removeEventListener('wheel', handleWheel)
            viewport.removeEventListener('touchmove', handleTouchMove)
            viewport.removeEventListener('keydown', handleKeyDown)
            viewport.removeEventListener('scroll', handleScroll)
        }
    }, [clearPendingAutoScroll, clearScrollAnimation, clearUserScrollIntentTimeout, scheduleScrollSync])

    useEffect(() => {
        scheduleScrollSync(isStreamingOutput)
    }, [contentSignal, isStreamingOutput, scheduleScrollSync])

    useEffect(() => {
        const wasStreamingOutput = wasStreamingOutputRef.current

        wasStreamingOutputRef.current = isStreamingOutput

        if (!wasStreamingOutput || isStreamingOutput || autoScrollLockedForCurrentTurnRef.current) {
            return
        }

        clearPendingAutoScroll()
        clearFinishScroll()
        finishScrollRafRef.current = window.requestAnimationFrame(() => {
            finishScrollRafRef.current = null

            if (autoScrollLockedForCurrentTurnRef.current) {
                return
            }

            // 流结束后再对齐一次底部，覆盖最后一批 Markdown 渲染导致的高度补涨。
            scrollViewportToBottomFromCode()
            setShowScrollToBottom(current => (current ? false : current))
        })
    }, [clearFinishScroll, clearPendingAutoScroll, isStreamingOutput, scrollViewportToBottomFromCode])

    return {
        composerContainerRef,
        composerOverlayInset,
        messageContentRef,
        scrollViewportRef,
        showScrollToBottom,
        resetAutoScrollForNewTurn,
        restoreAutoFollowAndScrollToBottom,
        positionConversationEntryAtBottom,
        cancelConversationEntryPositioning,
    }
}
