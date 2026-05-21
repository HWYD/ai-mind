'use client'

import { FileText, Server } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
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
            <div className="relative w-[400px] rounded-2xl border border-border/80 bg-popover p-3 text-sm text-muted-foreground shadow-xl">
                没有匹配的资源
                <div className="absolute bottom-[-6px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b border-border/80 bg-popover" />
            </div>
        )
    }

    return (
        <div className="relative w-[420px] rounded-2xl border border-border/80 bg-popover p-2 shadow-xl shadow-black/10">
            <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
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
                                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                                isSelected ? 'bg-[var(--composer-focus-soft)]' : 'hover:bg-muted/70'
                            )}
                        >
                            <span
                                className={cn(
                                    'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
                                    item.source === 'remote' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                                )}
                            >
                                <Icon className="size-5" strokeWidth={2.2} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-base font-semibold text-foreground">{item.label}</span>
                                    <Badge variant="outline" className="shrink-0 rounded-full px-2 py-0 text-[11px]">
                                        {item.source === 'remote' ? '远程' : '本地'}
                                    </Badge>
                                </span>
                                <span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.description}</span>
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
