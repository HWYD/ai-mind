'use client'

import { FileText, Server } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { cn } from '@/lib/utils'

import type { ComposerResourceOption } from '../composer-types'

export interface ComposerResourceMenuRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export const ComposerResourceMenu = forwardRef<
    ComposerResourceMenuRef,
    {
        command: (item: ComposerResourceOption) => void
        items: ComposerResourceOption[]
    }
>(({ command, items }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const selectedItemRef = useRef<HTMLButtonElement | null>(null)
    const boundedSelectedIndex = Math.min(selectedIndex, Math.max(items.length - 1, 0))

    useEffect(() => {
        selectedItemRef.current?.scrollIntoView({
            block: 'nearest',
        })
    }, [boundedSelectedIndex])

    const selectItem = useCallback(
        (index: number) => {
            const item = items[index]

            if (item) {
                command(item)
            }
        },
        [command, items]
    )

    useImperativeHandle(
        ref,
        () => ({
            onKeyDown: ({ event }) => {
                if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setSelectedIndex(index => (items.length > 0 ? (index + items.length - 1) % items.length : 0))
                    return true
                }

                if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setSelectedIndex(index => (items.length > 0 ? (index + 1) % items.length : 0))
                    return true
                }

                if (event.key === 'Enter') {
                    event.preventDefault()
                    selectItem(boundedSelectedIndex)
                    return true
                }

                return false
            },
        }),
        [boundedSelectedIndex, items, selectItem]
    )

    if (items.length === 0) {
        return (
            <div className="relative w-[min(80vw,400px)] rounded-2xl border border-border/80 bg-popover p-3 text-xs text-muted-foreground shadow-xl sm:w-[400px] sm:text-sm">
                没有匹配的资源
                <div className="absolute bottom-[-6px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b border-border/80 bg-popover" />
            </div>
        )
    }

    return (
        <div className="relative w-[min(80vw,420px)] rounded-2xl border border-border/80 bg-popover p-2 shadow-xl shadow-black/10 sm:w-[420px]">
            <div className="max-h-[340px] space-y-1 overflow-y-auto pr-1 sm:max-h-[420px]">
                {items.map((item, index) => {
                    const isSelected = index === boundedSelectedIndex
                    const Icon = item.source === 'remote' ? Server : FileText

                    return (
                        <button
                            key={item.id}
                            ref={isSelected ? selectedItemRef : null}
                            type="button"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => selectItem(index)}
                            className={cn(
                                'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors sm:gap-3 sm:px-3 sm:py-2.5',
                                isSelected ? 'bg-[var(--composer-focus-soft)]' : 'hover:bg-muted/70'
                            )}
                        >
                            <HoverCard openDelay={600} closeDelay={100}>
                                <HoverCardTrigger asChild>
                                    <span
                                        className={cn(
                                            'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl sm:size-10',
                                            item.source === 'remote' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                                        )}
                                    >
                                        <Icon className="size-4 sm:size-5" strokeWidth={2.2} />
                                    </span>
                                </HoverCardTrigger>
                                <HoverCardContent side="top" sideOffset={8} className="z-[100] w-auto px-3 py-1.5 text-xs font-mono">
                                    {item.fileName}
                                </HoverCardContent>
                            </HoverCard>
                            <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-foreground sm:text-base">{item.label}</span>
                                    <Badge variant="outline" className="shrink-0 rounded-full px-2 py-0 text-[10px] sm:text-[11px]">
                                        {item.source === 'remote' ? '远程' : (item.badgeLabel ?? '示例')}
                                    </Badge>
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground sm:text-sm">
                                    {item.description}
                                </span>
                            </span>
                        </button>
                    )
                })}
            </div>
            <div className="absolute bottom-[-6px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b border-border/80 bg-popover" />
        </div>
    )
})

ComposerResourceMenu.displayName = 'ComposerResourceMenu'
