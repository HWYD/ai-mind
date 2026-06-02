'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type UseChatAutoScrollOptions = {
    isStreamingOutput: boolean
    contentSignal: unknown
}

// 输入框固定在页面底部；这里给主内容额外留白，让最后一段回答滚到底时仍和输入框保持 128px 的舒适距离。
// 调大：底部空白更明显、触底滚动更不贴边；调小：页面更紧凑，但最后内容更容易贴近输入框。
const EXTRA_BOTTOM_SCROLL_SPACING = 128

// 首帧还没测到 Composer 真实高度时，先用估算高度占位，避免页面内容短暂贴到底部。
const ESTIMATED_COMPOSER_HEIGHT = 220

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
const AUTO_SCROLL_ANIMATION_DURATION_MS = 48

// 用户点击“回到底部”按钮时的缓动时长，比自动跟随略长，让主动操作有更清楚的反馈。
const SCROLL_TO_BOTTOM_CLICK_ANIMATION_DURATION_MS = 180

// wheel/touchmove/键盘滚动与 scroll 事件不是同一时刻触发；保留 160ms 意图窗口，用于判断后续 scroll 是否来自用户。
// 调大：更容易识别为用户滚动；调小：可能漏判慢一点的触控板/移动端滚动。
const USER_SCROLL_INTENT_RESET_DELAY = 160

// 聊天页保留浏览器整页滚动，不引入内部滚动容器，因此滚动目标统一收口到 document.scrollingElement。
function getPageScroller() {
    return document.scrollingElement ?? document.documentElement
}

function getPageBottomScrollTop() {
    const scroller = getPageScroller()

    return Math.max(0, scroller.scrollHeight - scroller.clientHeight)
}

function scrollPageToBottom(behavior: ScrollBehavior = 'auto') {
    window.scrollTo({
        top: getPageBottomScrollTop(),
        behavior,
    })
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

// 只识别会移动整页阅读位置的按键，普通输入和快捷键不参与自动滚动锁定。
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
// DOM 测量和滚动副作用留在 scheduleScrollSync，便于把调度逻辑和决策逻辑分开读。
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

function useChatComposerBottomSpacing() {
    const inputContainerRef = useRef<HTMLDivElement>(null)
    const inputHeightRef = useRef<number | null>(null)
    const [bottomSpacing, setBottomSpacing] = useState(ESTIMATED_COMPOSER_HEIGHT + EXTRA_BOTTOM_SCROLL_SPACING)

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

    return {
        inputContainerRef,
        bottomSpacing,
    }
}

export function useChatAutoScroll({ isStreamingOutput, contentSignal }: UseChatAutoScrollOptions) {
    const { inputContainerRef, bottomSpacing } = useChatComposerBottomSpacing()
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
    // 同一帧内可能同时收到消息增量、Composer 高度变化和 resize；只要其中一次允许跟随，本帧就保留自动跟随请求。
    const scrollSyncAutoFollowRef = useRef(false)
    const finishScrollRafRef = useRef<number | null>(null)
    const restoreAutoFollowRafRef = useRef<number | null>(null)
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)
    // 事件监听和 rAF 回调不会随每次 render 重新创建，用 ref 读取最新流式状态。
    const isStreamingOutputRef = useRef(isStreamingOutput)
    // 记录上一次 render 同步后的流式状态，用来识别“刚从输出中变为结束”的时刻。
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
            const targetTop = getPageBottomScrollTop()
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
            // 多个 contentSignal/bottomSpacing/resize 变化会合并到同一帧处理，先测量，再决定是否滚动。
            scrollSyncAutoFollowRef.current = scrollSyncAutoFollowRef.current || allowAutoFollow

            if (scrollSyncRafRef.current !== null) {
                return
            }

            scrollSyncRafRef.current = window.requestAnimationFrame(() => {
                scrollSyncRafRef.current = null
                const requestedAutoFollow = scrollSyncAutoFollowRef.current
                scrollSyncAutoFollowRef.current = false

                const scroller = getPageScroller()
                const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
                const decision = resolveScrollSyncDecision({
                    autoScrollLockedForCurrentTurn: autoScrollLockedForCurrentTurnRef.current,
                    distanceFromBottom,
                    hasUserScrollIntent: userScrollIntentRef.current,
                    isStreamingOutput: isStreamingOutputRef.current,
                    requestedAutoFollow,
                })

                setShowScrollToBottom(current => {
                    return current === decision.shouldShowScrollToBottom ? current : decision.shouldShowScrollToBottom
                })

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

                            const latestScroller = getPageScroller()
                            const latestDistanceFromBottom =
                                latestScroller.scrollHeight - latestScroller.scrollTop - latestScroller.clientHeight

                            if (latestDistanceFromBottom <= AUTO_SCROLL_DISTANCE_THRESHOLD) {
                                return
                            }

                            lastAutoScrollAtRef.current = performance.now()
                            scrollPageToBottomFromCode()
                            setShowScrollToBottom(current => (current ? false : current))
                        }, remainingAutoScrollDelay)
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

    // 用户点击“回到底部”是明确的恢复跟随意图，因此清掉本轮锁定并立即对齐页面底部。
    const restoreAutoFollowAndScrollToBottom = useCallback(() => {
        autoScrollLockedForCurrentTurnRef.current = false
        userScrollIntentRef.current = false
        clearPendingAutoScroll()
        clearFinishScroll()
        clearUserScrollIntentTimeout()
        clearRestoreAutoFollowScroll()

        scrollPageToBottomFromCode(SCROLL_TO_BOTTOM_CLICK_ANIMATION_DURATION_MS)
        setShowScrollToBottom(current => (current ? false : current))

        restoreAutoFollowRafRef.current = window.requestAnimationFrame(() => {
            restoreAutoFollowRafRef.current = null
            scrollPageToBottomFromCode(SCROLL_TO_BOTTOM_CLICK_ANIMATION_DURATION_MS)
            setShowScrollToBottom(current => (current ? false : current))
        })
    }, [clearFinishScroll, clearPendingAutoScroll, clearRestoreAutoFollowScroll, clearUserScrollIntentTimeout, scrollPageToBottomFromCode])

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
            clearUserScrollIntentTimeout()
        }
    }, [
        clearFinishScroll,
        clearPendingAutoScroll,
        clearProgrammaticScrollReset,
        clearRestoreAutoFollowScroll,
        clearScrollAnimation,
        clearUserScrollIntentTimeout,
    ])

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
        }
    }, [clearPendingAutoScroll, clearScrollAnimation, clearUserScrollIntentTimeout, scheduleScrollSync])

    useEffect(() => {
        // 任何消息增量、输入框高度或流式状态变化，都只调度一次页面级滚动同步。
        scheduleScrollSync(isStreamingOutput)
    }, [bottomSpacing, contentSignal, isStreamingOutput, scheduleScrollSync])

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
            scrollPageToBottomFromCode()
            setShowScrollToBottom(current => (current ? false : current))
        })
    }, [clearFinishScroll, clearPendingAutoScroll, isStreamingOutput, scrollPageToBottomFromCode])

    return {
        inputContainerRef,
        bottomSpacing,
        showScrollToBottom,
        resetAutoScrollForNewTurn,
        restoreAutoFollowAndScrollToBottom,
    }
}
