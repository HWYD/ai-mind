'use client'

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { ChatMessageListHandle } from '@/components/chat/message-list/chat-message-list'

const STREAM_FOLLOW_INTERVAL_MS = 64
const NEAR_END_ITEM_THRESHOLD = 5

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

interface UseChatScrollPolicyOptions {
    contentSignal: unknown
    isStreamingOutput: boolean
    listRef: RefObject<ChatMessageListHandle | null>
    messageCount: number
    scrollViewportElement: HTMLElement | null
}

interface PendingConversationEntry extends ConversationEntryTarget {
    atBottom: boolean
    isScrolling: boolean
    lastItemMounted: boolean
    lastItemInRange: boolean
    onPositioned: (() => void) | null
    readinessRevision: number
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

function isUpwardNavigationKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
        return false
    }

    return event.key === 'PageUp' || event.key === 'Home' || ((event.key === ' ' || event.key === 'Spacebar') && event.shiftKey)
}

export function useChatScrollPolicy({
    contentSignal,
    isStreamingOutput,
    listRef,
    messageCount,
    scrollViewportElement,
}: UseChatScrollPolicyOptions) {
    const composerContainerRef = useRef<HTMLDivElement>(null)
    const [composerOverlayInset, setComposerOverlayInset] = useState(0)
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)
    const isStreamingOutputRef = useRef(isStreamingOutput)
    const wasStreamingOutputRef = useRef(isStreamingOutput)
    const messageCountRef = useRef(messageCount)
    const atBottomRef = useRef(true)
    const visibleRangeRef = useRef<VisibleRange | null>(null)
    const isListScrollingRef = useRef(false)
    const followLockedForTurnRef = useRef(false)
    const programmaticCommandPendingRef = useRef(false)
    const programmaticResetRafRef = useRef<number | null>(null)
    const followTimeoutRef = useRef<number | null>(null)
    const touchStartYRef = useRef<number | null>(null)
    const entryRevealRafRef = useRef<number | null>(null)
    const entryRetryRafRef = useRef<number | null>(null)
    const entryRetryForceRef = useRef(false)
    const entryObservationsRef = useRef(new Map<string, ConversationEntryObservations>())
    const activeEntryGenerationRef = useRef<ConversationEntryObservationScope | null>(null)
    const pendingEntryRef = useRef<PendingConversationEntry | null>(null)
    const previousComposerInsetRef = useRef<number | null>(null)

    useLayoutEffect(() => {
        isStreamingOutputRef.current = isStreamingOutput
        messageCountRef.current = messageCount
    }, [isStreamingOutput, messageCount])

    const clearFollowTimeout = useCallback(() => {
        if (followTimeoutRef.current === null) {
            return
        }

        window.clearTimeout(followTimeoutRef.current)
        followTimeoutRef.current = null
    }, [])

    const clearProgrammaticReset = useCallback(() => {
        if (programmaticResetRafRef.current === null) {
            return
        }

        window.cancelAnimationFrame(programmaticResetRafRef.current)
        programmaticResetRafRef.current = null
    }, [])

    const issueScrollToEnd = useCallback(
        (behavior: 'auto' | 'smooth') => {
            const list = listRef.current

            if (!list || messageCountRef.current === 0) {
                programmaticCommandPendingRef.current = false
                return
            }

            programmaticCommandPendingRef.current = true
            clearProgrammaticReset()
            list.scrollToEnd(behavior)

            // 这里只清理命令来源标记，不计算或改写像素位置。
            programmaticResetRafRef.current = window.requestAnimationFrame(() => {
                programmaticResetRafRef.current = window.requestAnimationFrame(() => {
                    programmaticCommandPendingRef.current = false
                    programmaticResetRafRef.current = null
                })
            })
        },
        [clearProgrammaticReset, listRef]
    )

    const scheduleFollowToEnd = useCallback(() => {
        if (followTimeoutRef.current !== null) {
            return
        }

        followTimeoutRef.current = window.setTimeout(() => {
            followTimeoutRef.current = null

            if (followLockedForTurnRef.current || !isStreamingOutputRef.current) {
                return
            }

            issueScrollToEnd('auto')
        }, STREAM_FOLLOW_INTERVAL_MS)
    }, [issueScrollToEnd])

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
        clearFollowTimeout()
        clearProgrammaticReset()
        clearConversationEntryWork()
        activeEntryGenerationRef.current = null
        programmaticCommandPendingRef.current = false
        visibleRangeRef.current = null
        isListScrollingRef.current = false
        followLockedForTurnRef.current = false
        touchStartYRef.current = null
        atBottomRef.current = false
        setShowScrollToBottom(false)
    }, [clearConversationEntryWork, clearFollowTimeout, clearProgrammaticReset])

    const onAtBottomChange = useCallback(
        (atBottom: boolean, scope?: ConversationEntryObservationScope) => {
            const entry = pendingEntryRef.current
            const activeGeneration = activeEntryGenerationRef.current

            if (scope) {
                getConversationEntryObservations(entryObservationsRef.current, scope).atBottom = atBottom

                if (
                    (entry && !isSameConversationEntryGeneration(entry, scope)) ||
                    (!entry && activeGeneration && !isSameConversationEntryGeneration(activeGeneration, scope))
                ) {
                    return
                }
            } else if (entry) {
                return
            }

            atBottomRef.current = atBottom
            setShowScrollToBottom(current => (current === !atBottom ? current : !atBottom))

            if (atBottom) {
                programmaticCommandPendingRef.current = false
            } else if (isStreamingOutputRef.current && isListScrollingRef.current && !programmaticCommandPendingRef.current) {
                followLockedForTurnRef.current = true
                clearFollowTimeout()
            }

            if (entry) {
                invalidateConversationEntryReveal()
                entry.atBottom = atBottom

                if (!atBottom) {
                    scheduleConversationEntryRetry()
                }

                tryRevealConversationEntry()
            }
        },
        [clearFollowTimeout, invalidateConversationEntryReveal, scheduleConversationEntryRetry, tryRevealConversationEntry]
    )

    const onRangeChange = useCallback(
        (range: VisibleRange, scope?: ConversationEntryObservationScope) => {
            const entry = pendingEntryRef.current
            const activeGeneration = activeEntryGenerationRef.current

            if (scope) {
                getConversationEntryObservations(entryObservationsRef.current, scope).visibleRange = range

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
            const activeGeneration = activeEntryGenerationRef.current

            if (scope) {
                getConversationEntryObservations(entryObservationsRef.current, scope).isScrolling = isScrolling

                if (
                    (entry && !isSameConversationEntryGeneration(entry, scope)) ||
                    (!entry && activeGeneration && !isSameConversationEntryGeneration(activeGeneration, scope))
                ) {
                    return
                }
            } else if (entry) {
                return
            }

            const wasScrolling = isListScrollingRef.current
            isListScrollingRef.current = isScrolling

            if (entry && wasScrolling !== isScrolling) {
                invalidateConversationEntryReveal()
                entry.isScrolling = isScrolling

                if (!isScrolling) {
                    if (isConversationEntryReady(entry)) {
                        tryRevealConversationEntry()
                    } else {
                        scheduleConversationEntryRetry()
                    }
                }
            }

            if (!isScrolling) {
                programmaticCommandPendingRef.current = false
                return
            }

            if (isStreamingOutputRef.current && !atBottomRef.current && !programmaticCommandPendingRef.current) {
                followLockedForTurnRef.current = true
                clearFollowTimeout()
            }
        },
        [clearFollowTimeout, invalidateConversationEntryReveal, scheduleConversationEntryRetry, tryRevealConversationEntry]
    )

    const onTotalHeightChange = useCallback(
        (_height: number, scope?: ConversationEntryObservationScope) => {
            const entry = pendingEntryRef.current
            const activeGeneration = activeEntryGenerationRef.current

            if (
                (scope && entry && !isSameConversationEntryGeneration(entry, scope)) ||
                (scope && !entry && activeGeneration && !isSameConversationEntryGeneration(activeGeneration, scope)) ||
                (scope && !entry && !activeGeneration) ||
                (!scope && entry)
            ) {
                return
            }

            if (entry) {
                invalidateConversationEntryReveal()
                scheduleConversationEntryRetry(true)
                return
            }

            if (!followLockedForTurnRef.current && isStreamingOutputRef.current) {
                scheduleFollowToEnd()
            }
        },
        [invalidateConversationEntryReveal, scheduleConversationEntryRetry, scheduleFollowToEnd]
    )

    const resetScrollPolicyForNewTurn = useCallback(() => {
        followLockedForTurnRef.current = false
        clearFollowTimeout()
        issueScrollToEnd('auto')
    }, [clearFollowTimeout, issueScrollToEnd])

    const restoreFollowAndScrollToEnd = useCallback(() => {
        followLockedForTurnRef.current = false
        clearFollowTimeout()
        const lastMessageIndex = messageCountRef.current - 1
        const endIndex = visibleRangeRef.current?.endIndex ?? -1
        const isNearEnd = lastMessageIndex >= 0 && lastMessageIndex - endIndex <= NEAR_END_ITEM_THRESHOLD

        issueScrollToEnd(isNearEnd ? 'smooth' : 'auto')
    }, [clearFollowTimeout, issueScrollToEnd])

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
        const previousInset = previousComposerInsetRef.current
        previousComposerInsetRef.current = composerOverlayInset

        if (
            previousInset === null ||
            previousInset === composerOverlayInset ||
            !isStreamingOutputRef.current ||
            followLockedForTurnRef.current ||
            !atBottomRef.current
        ) {
            return
        }

        issueScrollToEnd('auto')
    }, [composerOverlayInset, issueScrollToEnd])

    useEffect(() => {
        if (isStreamingOutput && !followLockedForTurnRef.current) {
            scheduleFollowToEnd()
        }
    }, [contentSignal, isStreamingOutput, scheduleFollowToEnd])

    useEffect(() => {
        const wasStreamingOutput = wasStreamingOutputRef.current
        wasStreamingOutputRef.current = isStreamingOutput

        if (wasStreamingOutput && !isStreamingOutput) {
            clearFollowTimeout()
        }
    }, [clearFollowTimeout, isStreamingOutput])

    useEffect(() => {
        const viewport = scrollViewportElement

        if (!viewport) {
            return
        }

        const lockForUserIntent = () => {
            programmaticCommandPendingRef.current = false
            followLockedForTurnRef.current = true
            clearFollowTimeout()
        }

        const handleWheel = (event: WheelEvent) => {
            if (event.deltaY < 0 && !isEditableTarget(event.target)) {
                lockForUserIntent()
            }
        }

        const handleTouchStart = (event: TouchEvent) => {
            touchStartYRef.current = event.touches[0]?.clientY ?? null
        }

        const handleTouchMove = (event: TouchEvent) => {
            const startY = touchStartYRef.current
            const currentY = event.touches[0]?.clientY

            if (startY !== null && currentY !== undefined && currentY > startY && !isEditableTarget(event.target)) {
                lockForUserIntent()
            }
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isUpwardNavigationKey(event)) {
                lockForUserIntent()
            }
        }

        viewport.addEventListener('wheel', handleWheel, { passive: true })
        viewport.addEventListener('touchstart', handleTouchStart, { passive: true })
        viewport.addEventListener('touchmove', handleTouchMove, { passive: true })
        viewport.addEventListener('keydown', handleKeyDown)

        return () => {
            viewport.removeEventListener('wheel', handleWheel)
            viewport.removeEventListener('touchstart', handleTouchStart)
            viewport.removeEventListener('touchmove', handleTouchMove)
            viewport.removeEventListener('keydown', handleKeyDown)
        }
    }, [clearFollowTimeout, scrollViewportElement])

    useEffect(() => {
        return () => {
            clearFollowTimeout()
            clearProgrammaticReset()
            clearConversationEntryWork()
        }
    }, [clearConversationEntryWork, clearFollowTimeout, clearProgrammaticReset])

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
        resetScrollPolicyForNewTurn,
        restoreFollowAndScrollToEnd,
        showScrollToBottom,
    }
}
