import { CircleCheck, FileText, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { ComposerCommand, ComposerReference } from '../composer-types'

export function ComposerChip({
    children,
    className,
    onRemove,
    title,
    variant = 'command',
}: {
    children: ReactNode
    className?: string
    onRemove?: () => void
    title?: string
    variant?: 'command' | 'resource'
}) {
    const Icon = variant === 'command' ? CircleCheck : FileText

    return (
        <span
            title={title}
            className={cn(
                'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium shadow-xs',
                variant === 'command'
                    ? 'border-[var(--composer-chip-border)] bg-[var(--composer-chip-bg)] text-[var(--composer-chip-foreground)]'
                    : 'border-[var(--composer-resource-border)] bg-[var(--composer-resource-bg)] text-[var(--composer-resource-foreground)]',
                className
            )}
        >
            <Icon className="size-3.5 shrink-0" strokeWidth={2.2} />
            <span className="truncate">{children}</span>
            {onRemove ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="删除标签"
                    onClick={onRemove}
                    className="-mr-1 size-5 rounded-full hover:bg-black/5"
                >
                    <X className="size-3" strokeWidth={2.2} />
                </Button>
            ) : null}
        </span>
    )
}

export function ComposerChipRow({
    command,
    onCommandRemove,
    onReferenceRemove,
    references = [],
}: {
    command?: ComposerCommand
    onCommandRemove?: () => void
    onReferenceRemove?: (reference: ComposerReference) => void
    references?: ComposerReference[]
}) {
    if (!command && references.length === 0) {
        return null
    }

    return (
        <div className="flex flex-wrap gap-2">
            {command ? <ComposerChip onRemove={onCommandRemove}>{command.label}</ComposerChip> : null}
            {references.map(reference => (
                <ComposerChip key={reference.id} title={reference.uri} variant="resource" onRemove={() => onReferenceRemove?.(reference)}>
                    {reference.label}
                </ComposerChip>
            ))}
        </div>
    )
}
