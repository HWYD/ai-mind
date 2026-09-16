import { Calculator, Clock3, FileText, Globe2, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { GeneralAgentTraceRow as GeneralAgentTraceRowModel } from './general-agent-trace-view'

const rowIconMap = {
    prompt: FileText,
    resource: FileText,
    skill: Sparkles,
    tool: Globe2,
} as const

export function GeneralAgentTraceRow({ row }: { row: GeneralAgentTraceRowModel }) {
    let RowIcon = rowIconMap[row.kind]

    if (row.toolName === 'calculator') {
        RowIcon = Calculator
    } else if (row.toolName === 'datetime') {
        RowIcon = Clock3
    } else if (row.toolName === 'read-url') {
        RowIcon = FileText
    } else if (row.toolName === 'web-search') {
        RowIcon = Globe2
    }

    return (
        <div
            data-testid="general-agent-trace-row"
            className={cn(
                'flex h-[30px] min-w-0 items-center gap-[11px] text-sm text-muted-foreground',
                row.status === 'failed' && 'text-destructive'
            )}
        >
            <RowIcon className="size-[17px] shrink-0" strokeWidth={1.8} />
            <span className="min-w-0 truncate">{row.label}</span>
        </div>
    )
}
