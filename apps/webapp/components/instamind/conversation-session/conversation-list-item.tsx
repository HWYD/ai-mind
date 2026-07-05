'use client'

import { MessageSquareText } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { ConversationListItem as ConversationListItemValue } from './types'

interface ConversationListItemProps {
    conversation: ConversationListItemValue
    disabled?: boolean
    onSelect: (conversationId: string) => void
    compact?: boolean
}

export function ConversationListItem({ conversation, disabled = false, onSelect, compact = false }: ConversationListItemProps) {
    return (
        <button
            type="button"
            aria-current={conversation.selected ? 'page' : undefined}
            aria-label={conversation.title}
            disabled={disabled}
            onClick={() => onSelect(conversation.id)}
            className={cn(
                'group flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                conversation.selected
                    ? 'border-border bg-card text-foreground shadow-sm shadow-black/[0.03]'
                    : 'border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-card/70 hover:text-foreground',
                disabled && 'cursor-not-allowed opacity-60',
                compact && 'justify-center px-2'
            )}
        >
            <span
                className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background text-muted-foreground',
                    conversation.selected && 'bg-foreground text-background'
                )}
            >
                <MessageSquareText className="size-4" />
            </span>
            <span className={cn('min-w-0 flex-1', compact && 'hidden')}>
                <span className="block truncate text-sm font-medium" title={conversation.title}>
                    {conversation.title}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {conversation.hasMessages ? '最近对话' : '空白会话'}
                </span>
            </span>
        </button>
    )
}
