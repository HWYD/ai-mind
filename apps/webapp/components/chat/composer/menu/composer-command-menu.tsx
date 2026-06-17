'use client'

import { FileText, ListChecks, ShieldCheck } from 'lucide-react'
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react'

import { cn } from '@/lib/utils'

import type { ComposerCommandName } from '../composer-types'
import type { ComposerCommandOption } from './composer-command-options'

export interface ComposerCommandMenuRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const commandIconByName: Record<ComposerCommandName, typeof FileText> = {
    check: ShieldCheck,
    summary: FileText,
    tasklist: ListChecks,
}

export const ComposerCommandMenu = forwardRef<
    ComposerCommandMenuRef,
    {
        command: (item: ComposerCommandOption) => void
        items: ComposerCommandOption[]
    }
>(({ command, items }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const boundedSelectedIndex = Math.min(selectedIndex, Math.max(items.length - 1, 0))

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
            <div className="relative w-[min(80vw,360px)] rounded-2xl border border-border/80 bg-popover p-3 text-sm text-muted-foreground shadow-xl sm:w-[360px]">
                没有匹配的命令
                <div className="absolute bottom-[-6px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b border-border/80 bg-popover" />
            </div>
        )
    }

    return (
        <div className="relative w-[min(80vw,380px)] rounded-2xl border border-border/80 bg-popover p-2 shadow-xl shadow-black/10 sm:w-[380px]">
            <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
                {items.map((item, index) => {
                    const Icon = commandIconByName[item.name]
                    const isSelected = index === boundedSelectedIndex

                    return (
                        <button
                            key={item.name}
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
                                    item.name === 'summary' && 'bg-violet-50 text-violet-600',
                                    item.name === 'tasklist' && 'bg-blue-50 text-blue-600',
                                    item.name === 'check' && 'bg-emerald-50 text-emerald-600'
                                )}
                            >
                                <Icon className="size-5" strokeWidth={2.2} />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-base font-semibold text-foreground">{item.label}</span>
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

ComposerCommandMenu.displayName = 'ComposerCommandMenu'
