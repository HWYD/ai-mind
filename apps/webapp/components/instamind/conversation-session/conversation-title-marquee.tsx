'use client'

import { useEffect, useRef, useState } from 'react'

interface ConversationTitleMarqueeProps {
    active: boolean
    title: string
}

export function ConversationTitleMarquee({ active, title }: ConversationTitleMarqueeProps) {
    const viewportRef = useRef<HTMLSpanElement>(null)
    const titleRef = useRef<HTMLSpanElement>(null)
    const animationRef = useRef<Animation | null>(null)
    const [scrollDistance, setScrollDistance] = useState(0)

    useEffect(() => {
        const viewport = viewportRef.current

        if (!viewport) {
            return
        }

        function updateScrollDistance() {
            const nextDistance = Math.max(0, Math.ceil(viewport.scrollWidth - viewport.clientWidth))

            setScrollDistance(currentDistance => (currentDistance === nextDistance ? currentDistance : nextDistance))
        }

        updateScrollDistance()

        if (typeof ResizeObserver === 'undefined') {
            return
        }

        const observer = new ResizeObserver(updateScrollDistance)

        observer.observe(viewport)

        return () => {
            observer.disconnect()
        }
    }, [title])

    useEffect(() => {
        const titleElement = titleRef.current

        animationRef.current?.cancel()
        animationRef.current = null

        if (
            !active ||
            scrollDistance === 0 ||
            !titleElement ||
            typeof titleElement.animate !== 'function' ||
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ) {
            return
        }

        const timeoutId = window.setTimeout(() => {
            animationRef.current = titleElement.animate(
                [{ transform: 'translateX(0)' }, { transform: `translateX(-${scrollDistance}px)` }],
                {
                    duration: Math.min(4000, Math.max(1200, (scrollDistance / 48) * 1000)),
                    easing: 'linear',
                    fill: 'forwards',
                }
            )
        }, 400)

        return () => {
            window.clearTimeout(timeoutId)
            animationRef.current?.cancel()
            animationRef.current = null
        }
    }, [active, scrollDistance])

    return (
        <span
            ref={viewportRef}
            data-overflowing={scrollDistance > 0 || undefined}
            className="conversation-title-marquee block min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left"
        >
            <span ref={titleRef} className="conversation-title-marquee__content inline-block whitespace-nowrap">
                {title}
            </span>
        </span>
    )
}
