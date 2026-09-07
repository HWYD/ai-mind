'use client'

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { ChatMessageListHandle } from '@/components/chat/message-list/chat-message-list'

interface VisibleRange {
    endIndex: number
    startIndex: number
}

export interface ConversationEntryTarget {
    conversationId: string
    lastMessageIndex: number
    sequence: number
}

export interface ConversationEntryObservationScope {
    conversationId: string
    sequence: number
}

interface ConversationEntryItemMount extends ConversationEntryObservationScope {
    itemIndex: number
}

interface ConversationEntryObservations extends ConversationEntryObservationScope {
    atBottom: boolean | null
    itemIndices: Set<number>
    isScrolling: boolean
    visibleRange: VisibleRange | null
}

interface PendingConversationEntry extends ConversationEntryTarget {
    atBottom: boolean
    isScrolling: boolean
    lastItemMounted: boolean
    lastItemInRange: boolean
    onPositioned: (() => void) | null
    readinessRevision: number
}

interface UseChatScrollPolicyOptions {
    contentSignal: unknown
    isStreamingOutput: boolean
    listRef: RefObject<ChatMessageListHandle | null>
    messageCount: number
    scrollViewportElement: HTMLElement | null
    presentationKey?: string
    acceptedTurnRevision?: number
}

function getConversationEntryGenerationKey(scope: ConversationEntryObservationScope) {
    return JSON.stringify([scope.conversationId, scope.sequence])
}

function isSameConversationEntryGeneration(left: ConversationEntryObservationScope, right: ConversationEntryObservationScope) {
    return left.conversationId === right.conversationId && left.sequence === right.sequence
}

function getConversationEntryObservations(
    observationsByGeneration: Map<string, ConversationEntryObservations>,
    scope: ConversationEntryObservationScope
) {
    const key = getConversationEntryGenerationKey(scope)
    let observations = observationsByGeneration.get(key)

    if (!observations) {
        observations = {
            ...scope,
            atBottom: null,
            isScrolling: false,
            itemIndices: new Set<number>(),
            visibleRange: null,
        }
        observationsByGeneration.set(key, observations)
    }

    return observations
}

function isConversationEntryReady(entry: PendingConversationEntry) {
    return entry.atBottom && entry.lastItemInRange && entry.lastItemMounted && !entry.isScrolling
}

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
        return false
    }

    if (target.isContentEditable) {
        return true
    }

    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

function nestedScrollerConsumes(target: EventTarget | null, viewport: HTMLElement, direction: number) {
    let element = target instanceof HTMLElement ? target : null
    while (element && element !== viewport) {
        const style = window.getComputedStyle(element)
        if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) {
            const canMove = direction < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1
            if (canMove || style.overscrollBehaviorY === 'contain' || style.overscrollBehaviorY === 'none') return true
        }
        element = element.parentElement
    }
    return false
}

function isUpwardNavigationKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
        return false
    }

    return (
        event.key === 'ArrowUp' ||
        event.key === 'PageUp' ||
        event.key === 'Home' ||
        ((event.key === ' ' || event.key === 'Spacebar') && event.shiftKey)
    )
}

export function useChatScrollPolicy({
    contentSignal,
    listRef,
    messageCount,
    scrollViewportElement,
    presentationKey = 'current',
    acceptedTurnRevision = 0,
}: UseChatScrollPolicyOptions) {
    const composerContainerRef = useRef<HTMLDivElement>(null)
    const [composerOverlayInset, setComposerOverlayInset] = useState(0)
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)
    const messageCountRef = useRef(messageCount)
    const atBottomRef = useRef(true)
    const lastObservedTotalListHeightRef = useRef<number | null>(null)
    const visibleRangeRef = useRef<VisibleRange | null>(null)
    const isListScrollingRef = useRef(false)
    const intentRef = useRef<'following' | 'reading'>('following')
    const followRafRef = useRef<number | null>(null)
    const forceFollowRef = useRef(false)
    const followGrowthMicrotaskRef = useRef(false)
    const entryRevealRafRef = useRef<number | null>(null)
    const entryRetryRafRef = useRef<number | null>(null)
    const entryRetryForceRef = useRef(false)
    const entryObservationsRef = useRef(new Map<string, ConversationEntryObservations>())
    const activeEntryGenerationRef = useRef<ConversationEntryObservationScope | null>(null)
    const pendingEntryRef = useRef<PendingConversationEntry | null>(null)
    const presentationRef = useRef(presentationKey)
    useLayoutEffect(() => {
        presentationRef.current = presentationKey
        lastObservedTotalListHeightRef.current = null
    }, [presentationKey])

    useLayoutEffect(() => {
        messageCountRef.current = messageCount
    }, [messageCount])

    const clearFollowWork = useCallback(() => {
        if (followRafRef.current !== null) window.cancelAnimationFrame(followRafRef.current)
        followRafRef.current = null
        forceFollowRef.current = false
    }, [])

    const issueScrollToEnd = useCallback(
        (behavior: 'auto' | 'smooth') => {
            if (messageCountRef.current > 0) listRef.current?.scrollToEnd(behavior)
        },
        [listRef]
    )

    const scheduleFollowToEnd = useCallback(
        (force = false) => {
            if (intentRef.current !== 'following' || pendingEntryRef.current) return
            forceFollowRef.current ||= force
            if (followRafRef.current !== null) return
            const generation = presentationRef.current
            followRafRef.current = window.requestAnimationFrame(() => {
                if (presentationRef.current !== generation) return
                followRafRef.current = null
                const shouldForce = forceFollowRef.current
                forceFollowRef.current = false
                if (intentRef.current === 'following' && !pendingEntryRef.current && (shouldForce || !atBottomRef.current)) {
                    issueScrollToEnd('auto')
                }
            })
        },
        [issueScrollToEnd]
    )

    const scheduleFollowGrowth = useCallback(() => {
        if (followGrowthMicrotaskRef.current) return
        followGrowthMicrotaskRef.current = true
        // 用微任务在同一帧内合并连续的高度增长事件并滚动到底：既不跨帧产生残影，
        // 又能把同一批测量增长合并成单次到底命令（保留 maxCommandsPerFrame <= 1 的契约）。
        queueMicrotask(() => {
            followGrowthMicrotaskRef.current = false
            if (intentRef.current === 'following' && !pendingEntryRef.current) {
                issueScrollToEnd('auto')
            }
        })
    }, [issueScrollToEnd])

    const lockFollowForReader = useCallback(() => {
        intentRef.current = 'reading'
        clearFollowWork()
        setShowScrollToBottom(!atBottomRef.current && !pendingEntryRef.current && messageCountRef.current > 0)
    }, [clearFollowWork])

    const clearConversationEntryWork = useCallback(() => {
        if (entryRevealRafRef.current !== null) {
            window.cancelAnimationFrame(entryRevealRafRef.current)
            entryRevealRafRef.current = null
        }

        if (entryRetryRafRef.current !== null) {
            window.cancelAnimationFrame(entryRetryRafRef.current)
            entryRetryRafRef.current = null
        }

        entryRetryForceRef.current = false
        pendingEntryRef.current = null
    }, [])

    const invalidateConversationEntryReveal = useCallback(() => {
        const entry = pendingEntryRef.current

        if (!entry) {
            return
        }

        entry.readinessRevision += 1

        if (entryRevealRafRef.current !== null) {
            window.cancelAnimationFrame(entryRevealRafRef.current)
            entryRevealRafRef.current = null
        }
    }, [])

    const tryRevealConversationEntry = useCallback(() => {
        const entry = pendingEntryRef.current

        if (!entry || !isConversationEntryReady(entry) || entryRevealRafRef.current !== null) {
            return
        }

        const revealRevision = entry.readinessRevision
        entryRevealRafRef.current = window.requestAnimationFrame(() => {
            entryRevealRafRef.current = null
            const currentEntry = pendingEntryRef.current

            if (
                !currentEntry ||
                currentEntry.conversationId !== entry.conversationId ||
                currentEntry.sequence !== entry.sequence ||
                currentEntry.readinessRevision !== revealRevision ||
                !isConversationEntryReady(currentEntry)
            ) {
                return
            }

            entryRevealRafRef.current = window.requestAnimationFrame(() => {
                entryRevealRafRef.current = null
                const confirmedEntry = pendingEntryRef.current

                if (
                    !confirmedEntry ||
                    confirmedEntry.conversationId !== entry.conversationId ||
                    confirmedEntry.sequence !== entry.sequence ||
                    confirmedEntry.readinessRevision !== revealRevision ||
                    !isConversationEntryReady(confirmedEntry)
                ) {
                    return
                }

                pendingEntryRef.current = null
                setShowScrollToBottom(false)
                confirmedEntry.onPositioned?.()
            })
        })
    }, [])

    const scheduleConversationEntryRetry = useCallback(
        (force = false) => {
            const entry = pendingEntryRef.current

            if (!entry || (!force && isConversationEntryReady(entry))) {
                return
            }

            entryRetryForceRef.current ||= force

            if (entryRetryRafRef.current !== null) {
                return
            }

            const retryConversationId = entry.conversationId
            const retrySequence = entry.sequence
            const retryRaf = window.requestAnimationFrame(() => {
                if (entryRetryRafRef.current === retryRaf) {
                    entryRetryRafRef.current = null
                }

                const shouldForce = entryRetryForceRef.current
                entryRetryForceRef.current = false
                const currentEntry = pendingEntryRef.current

                if (
                    !currentEntry ||
                    currentEntry.conversationId !== retryConversationId ||
                    currentEntry.sequence !== retrySequence ||
                    (!shouldForce && isConversationEntryReady(currentEntry))
                ) {
                    return
                }

                issueScrollToEnd('auto')
                tryRevealConversationEntry()
            })
            entryRetryRafRef.current = retryRaf
        },
        [issueScrollToEnd, tryRevealConversationEntry]
    )

    const cancelConversationEntryPositioning = useCallback(() => {
        clearFollowWork()
        clearConversationEntryWork()
        activeEntryGenerationRef.current = null
        visibleRangeRef.current = null
        isListScrollingRef.current = false
        intentRef.current = 'following'
        atBottomRef.current = true
        setShowScrollToBottom(false)
    }, [clearConversationEntryWork, clearFollowWork])

    useLayoutEffect(() => {
        cancelConversationEntryPositioning()
        return clearFollowWork
    }, [cancelConversationEntryPositioning, clearFollowWork, presentationKey])

    const onAtBottomChange = useCallback(
        (atBottom: boolean, scope?: ConversationEntryObservationScope) => {
            const entry = pendingEntryRef.current
            const active = activeEntryGenerationRef.current
            if (scope) {
                getConversationEntryObservations(entryObservationsRef.current, scope).atBottom = atBottom
                if (presentationRef.current !== 'current' && scope.conversationId !== presentationRef.current) return
                if (
                    (entry && !isSameConversationEntryGeneration(entry, scope)) ||
                    (!entry && active && !isSameConversationEntryGeneration(active, scope))
                )
                    return
            } else if (entry) return
            atBottomRef.current = atBottom
            const canShowButton = !atBottom && !entry && messageCountRef.current > 0
            const isReading = intentRef.current === 'reading'
            // 跟随中的瞬时离底不显示；显式回底保留已有按钮，直到首次确认到底。
            setShowScrollToBottom(visible => canShowButton && (isReading || visible))
            if (entry) {
                invalidateConversationEntryReveal()
                entry.atBottom = atBottom
                if (!atBottom) scheduleConversationEntryRetry()
                tryRevealConversationEntry()
            } else if (!atBottom) scheduleFollowToEnd()
        },
        [invalidateConversationEntryReveal, scheduleConversationEntryRetry, scheduleFollowToEnd, tryRevealConversationEntry]
    )

    const onRangeChange = useCallback(
        (range: VisibleRange, scope?: ConversationEntryObservationScope) => {
            const entry = pendingEntryRef.current
            const activeGeneration = activeEntryGenerationRef.current

            if (scope) {
                getConversationEntryObservations(entryObservationsRef.current, scope).visibleRange = range
                if (presentationRef.current !== 'current' && scope.conversationId !== presentationRef.current) return

                if (
                    (entry && !isSameConversationEntryGeneration(entry, scope)) ||
                    (!entry && activeGeneration && !isSameConversationEntryGeneration(activeGeneration, scope))
                ) {
                    return
                }
            } else if (entry) {
                return
            }

            visibleRangeRef.current = range

            if (entry) {
                invalidateConversationEntryReveal()
                entry.lastItemInRange = entry.lastMessageIndex < 0 || range.endIndex >= entry.lastMessageIndex

                if (!entry.lastItemInRange) {
                    scheduleConversationEntryRetry()
                }

                tryRevealConversationEntry()
            }
        },
        [invalidateConversationEntryReveal, scheduleConversationEntryRetry, tryRevealConversationEntry]
    )

    const onItemMounted = useCallback(
        (observation: ConversationEntryItemMount) => {
            const observations = getConversationEntryObservations(entryObservationsRef.current, observation)
            const itemWasMounted = observations.itemIndices.has(observation.itemIndex)
            observations.itemIndices.add(observation.itemIndex)
            const entry = pendingEntryRef.current

            if (!entry || !isSameConversationEntryGeneration(entry, observation)) {
                return
            }

            if (!itemWasMounted) {
                invalidateConversationEntryReveal()
            }

            if (!observations.itemIndices.has(entry.lastMessageIndex)) {
                scheduleConversationEntryRetry()
                return
            }

            entry.lastItemMounted = true
            tryRevealConversationEntry()
        },
        [invalidateConversationEntryReveal, scheduleConversationEntryRetry, tryRevealConversationEntry]
    )

    const onItemUnmounted = useCallback(
        (observation: ConversationEntryItemMount) => {
            const observations = entryObservationsRef.current.get(getConversationEntryGenerationKey(observation))

            if (!observations) {
                return
            }

            const itemWasMounted = observations.itemIndices.delete(observation.itemIndex)
            const entry = pendingEntryRef.current

            if (
                !itemWasMounted ||
                !entry ||
                !isSameConversationEntryGeneration(entry, observation) ||
                observations.itemIndices.has(entry.lastMessageIndex)
            ) {
                return
            }

            invalidateConversationEntryReveal()
            entry.lastItemMounted = false
            scheduleConversationEntryRetry()
        },
        [invalidateConversationEntryReveal, scheduleConversationEntryRetry]
    )

    const onScrollingChange = useCallback(
        (isScrolling: boolean, scope?: ConversationEntryObservationScope) => {
            const entry = pendingEntryRef.current
            const active = activeEntryGenerationRef.current
            if (scope) {
                getConversationEntryObservations(entryObservationsRef.current, scope).isScrolling = isScrolling
                if (presentationRef.current !== 'current' && scope.conversationId !== presentationRef.current) return
                if (
                    (entry && !isSameConversationEntryGeneration(entry, scope)) ||
                    (!entry && active && !isSameConversationEntryGeneration(active, scope))
                )
                    return
            } else if (entry) return
            const changed = isListScrollingRef.current !== isScrolling
            isListScrollingRef.current = isScrolling
            if (entry && changed) {
                invalidateConversationEntryReveal()
                entry.isScrolling = isScrolling
                if (!isScrolling) {
                    if (isConversationEntryReady(entry)) tryRevealConversationEntry()
                    else scheduleConversationEntryRetry()
                }
            }
        },
        [invalidateConversationEntryReveal, scheduleConversationEntryRetry, tryRevealConversationEntry]
    )

    const onTotalHeightChange = useCallback(
        (height: number, scope?: ConversationEntryObservationScope) => {
            if (scope && presentationRef.current !== 'current' && scope.conversationId !== presentationRef.current) return
            const entry = pendingEntryRef.current
            const active = activeEntryGenerationRef.current
            if (
                (scope && entry && !isSameConversationEntryGeneration(entry, scope)) ||
                (scope && !entry && active && !isSameConversationEntryGeneration(active, scope)) ||
                (!scope && entry)
            )
                return
            const previousHeight = lastObservedTotalListHeightRef.current
            lastObservedTotalListHeightRef.current = height
            if (entry) {
                invalidateConversationEntryReveal()
                scheduleConversationEntryRetry(true)
            } else if (previousHeight !== null && height > previousHeight) {
                // Virtuoso 已在 paint 前的 layout 阶段测出新总高；用微任务同帧合并滚动到底，
                // 避免 rAF 跨帧使内容先以旧 scrollTop 绘制出一帧残影。atBottom 回调可能仍保留
                // 增长前的状态，这里只依赖高度增长的确定性结果直接跟随。
                scheduleFollowGrowth()
            } else {
                scheduleFollowToEnd(false)
            }
        },
        [invalidateConversationEntryReveal, scheduleConversationEntryRetry, scheduleFollowToEnd, scheduleFollowGrowth]
    )

    const restoreFollowAndScrollToEnd = useCallback(() => {
        intentRef.current = 'following'
        scheduleFollowToEnd(true)
    }, [scheduleFollowToEnd])

    const positionConversationEntryAtBottom = useCallback(
        (target: ConversationEntryTarget, onPositioned?: () => void) => {
            clearConversationEntryWork()
            const generationKey = getConversationEntryGenerationKey(target)
            const observations = entryObservationsRef.current.get(generationKey)
            entryObservationsRef.current.clear()

            if (observations) {
                entryObservationsRef.current.set(generationKey, observations)
            }

            activeEntryGenerationRef.current = target
            atBottomRef.current = target.lastMessageIndex < 0 || observations?.atBottom === true
            visibleRangeRef.current = observations?.visibleRange ?? null
            isListScrollingRef.current = observations?.isScrolling ?? false
            pendingEntryRef.current = {
                ...target,
                atBottom: atBottomRef.current,
                isScrolling: isListScrollingRef.current,
                lastItemMounted: target.lastMessageIndex < 0 || Boolean(observations?.itemIndices.has(target.lastMessageIndex)),
                lastItemInRange:
                    target.lastMessageIndex < 0 ||
                    Boolean(observations?.visibleRange && observations.visibleRange.endIndex >= target.lastMessageIndex),
                onPositioned: onPositioned ?? null,
                readinessRevision: 0,
            }

            if (target.lastMessageIndex >= 0) {
                issueScrollToEnd('auto')
                scheduleConversationEntryRetry()
            }

            tryRevealConversationEntry()
        },
        [clearConversationEntryWork, issueScrollToEnd, scheduleConversationEntryRetry, tryRevealConversationEntry]
    )

    useLayoutEffect(() => {
        const composer = composerContainerRef.current

        if (!composer) {
            return
        }

        const syncComposerOverlayInset = () => {
            const nextInset = Math.ceil(composer.getBoundingClientRect().height)
            setComposerOverlayInset(current => (current === nextInset ? current : nextInset))
        }

        syncComposerOverlayInset()
        const observer = new ResizeObserver(syncComposerOverlayInset)
        observer.observe(composer)

        return () => observer.disconnect()
    }, [])

    useLayoutEffect(() => {
        if (acceptedTurnRevision > 0) restoreFollowAndScrollToEnd()
    }, [acceptedTurnRevision, restoreFollowAndScrollToEnd])

    useEffect(() => {
        const viewport = scrollViewportElement
        if (!viewport) return
        let lastTop = viewport.scrollTop
        let downInputUntil = 0
        let touchY: number | null = null
        let scrollbarDragging = false
        const handleWheel = (event: WheelEvent) => {
            if (event.ctrlKey || isEditableTarget(event.target) || nestedScrollerConsumes(event.target, viewport, event.deltaY)) return
            if (event.deltaY < 0) {
                lockFollowForReader()
                downInputUntil = 0
            } else if (event.deltaY > 0) downInputUntil = performance.now() + 250
        }
        const handleTouchStart = (event: TouchEvent) => {
            touchY = event.touches[0]?.clientY ?? null
        }
        const handleTouchMove = (event: TouchEvent) => {
            const y = event.touches[0]?.clientY
            if (
                y !== undefined &&
                touchY !== null &&
                !isEditableTarget(event.target) &&
                !nestedScrollerConsumes(event.target, viewport, touchY - y)
            ) {
                if (y > touchY) {
                    lockFollowForReader()
                    downInputUntil = 0
                } else if (y < touchY) downInputUntil = performance.now() + 250
            }
            touchY = y ?? null
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (nestedScrollerConsumes(event.target, viewport, isUpwardNavigationKey(event) ? -1 : 1)) return
            if (isUpwardNavigationKey(event)) {
                lockFollowForReader()
                downInputUntil = 0
            } else if (
                !event.defaultPrevented &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey &&
                !isEditableTarget(event.target) &&
                ['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)
            ) {
                downInputUntil = performance.now() + 250
            }
        }
        const handlePointerDown = (event: PointerEvent) => {
            const rect = viewport.getBoundingClientRect()
            scrollbarDragging =
                event.target === viewport && event.clientX >= rect.right - Math.max(viewport.offsetWidth - viewport.clientWidth, 12)
            if (scrollbarDragging) lockFollowForReader()
        }
        const handlePointerUp = () => {
            scrollbarDragging = false
        }
        const handleScroll = () => {
            const top = viewport.scrollTop
            if (top > lastTop && (scrollbarDragging || performance.now() < downInputUntil)) {
                // 仅在真实用户滚动事件里读底部距离；内容缩短/浏览器锚定不能恢复阅读锁。
                if (viewport.scrollHeight - viewport.clientHeight - top <= 4) {
                    intentRef.current = 'following'
                    setShowScrollToBottom(false)
                    scheduleFollowToEnd()
                    downInputUntil = 0
                } else {
                    // End/PageDown 和触屏惯性会跨多个 scroll 帧，保留整段用户输入的连续性。
                    downInputUntil = performance.now() + 250
                }
            } else if (top < lastTop) {
                if (scrollbarDragging) lockFollowForReader()
                downInputUntil = 0
            }
            lastTop = top
        }
        const handleScrollEnd = () => {
            downInputUntil = 0
        }
        const observer = new ResizeObserver(() => scheduleFollowToEnd())
        observer.observe(viewport)
        viewport.addEventListener('wheel', handleWheel, { passive: true })
        viewport.addEventListener('touchstart', handleTouchStart, { passive: true })
        viewport.addEventListener('touchmove', handleTouchMove, { passive: true })
        viewport.addEventListener('keydown', handleKeyDown)
        viewport.addEventListener('pointerdown', handlePointerDown)
        window.addEventListener('pointerup', handlePointerUp)
        window.addEventListener('pointercancel', handlePointerUp)
        viewport.addEventListener('scroll', handleScroll, { passive: true })
        viewport.addEventListener('scrollend', handleScrollEnd)
        return () => {
            observer.disconnect()
            viewport.removeEventListener('wheel', handleWheel)
            viewport.removeEventListener('touchstart', handleTouchStart)
            viewport.removeEventListener('touchmove', handleTouchMove)
            viewport.removeEventListener('keydown', handleKeyDown)
            viewport.removeEventListener('pointerdown', handlePointerDown)
            window.removeEventListener('pointerup', handlePointerUp)
            window.removeEventListener('pointercancel', handlePointerUp)
            viewport.removeEventListener('scroll', handleScroll)
            viewport.removeEventListener('scrollend', handleScrollEnd)
        }
    }, [lockFollowForReader, scheduleFollowToEnd, scrollViewportElement])

    useEffect(
        () => () => {
            clearFollowWork()
            clearConversationEntryWork()
        },
        [clearConversationEntryWork, clearFollowWork]
    )

    return {
        cancelConversationEntryPositioning,
        composerContainerRef,
        composerOverlayInset,
        onAtBottomChange,
        onItemMounted,
        onItemUnmounted,
        onRangeChange,
        onScrollingChange,
        onTotalHeightChange,
        positionConversationEntryAtBottom,
        resetScrollPolicyForNewTurn: restoreFollowAndScrollToEnd,
        restoreFollowAndScrollToEnd,
        showScrollToBottom,
        lockFollowForReader,
    }
}
