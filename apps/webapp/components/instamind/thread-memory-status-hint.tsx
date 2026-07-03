'use client'

import { CircleAlert, FileText, LoaderCircle } from 'lucide-react'

import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import type { ThreadMemoryStatusHint as ThreadMemoryStatusHintState } from './use-chat-stream'

function getHintIcon(status: ThreadMemoryStatusHintState['status']) {
    switch (status) {
        case 'started':
            return <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.2} />
        case 'failed':
            return <CircleAlert className="size-3.5" strokeWidth={2.2} />
        case 'succeeded':
            return <FileText className="size-3.5" strokeWidth={2.2} />
    }
}

function getHintClassName(status: ThreadMemoryStatusHintState['status']) {
    switch (status) {
        case 'started':
            return 'text-muted-foreground'
        case 'failed':
            return 'text-amber-700'
        case 'succeeded':
            return 'text-muted-foreground'
    }
}

export function ThreadMemoryStatusHint({ hint }: { hint: ThreadMemoryStatusHintState | null }) {
    if (!hint) {
        return null
    }

    return (
        <div role="status" aria-live="polite" className={cn('flex items-center gap-3 px-1 py-2 text-xs', getHintClassName(hint.status))}>
            <Separator className="flex-1 bg-border/60" />
            <span className="inline-flex items-center gap-2 whitespace-nowrap font-medium">
                {getHintIcon(hint.status)}
                <span>{hint.message}</span>
            </span>
            <Separator className="flex-1 bg-border/60" />
        </div>
    )
}
