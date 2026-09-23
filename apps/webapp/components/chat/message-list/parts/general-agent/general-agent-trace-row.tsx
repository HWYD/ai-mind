import { Calculator, Clock3, ExternalLink, FileText, Globe2, Sparkles } from 'lucide-react'

import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import { TextPartView } from '../shared/text-part'
import type { GeneralAgentTraceRow as GeneralAgentTraceRowModel } from './general-agent-trace-view'

const rowIconMap = {
    prompt: FileText,
    resource: FileText,
    skill: Sparkles,
    tool: Globe2,
} as const

export function GeneralAgentTraceRow({ row }: { row: GeneralAgentTraceRowModel }) {
    if (row.kind === 'agent-text') {
        return <TextPartView part={row.part} isStreaming={row.part.status === 'streaming'} />
    }

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
        <>
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
            {row.readSources?.length ? (
                <>
                    <Separator className="my-1.5" />
                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <FileText className="size-3.5" strokeWidth={2.1} />
                            已读取来源
                        </div>
                        {row.readSources.map(source => (
                            <a
                                key={source.url}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`${source.title} ${source.hostname}`}
                                className="flex min-w-0 items-center gap-1 text-muted-foreground hover:text-foreground"
                            >
                                <ExternalLink className="size-3 shrink-0" strokeWidth={1.8} />
                                <span className="truncate underline-offset-2 hover:underline">{source.title}</span>
                                <span className="shrink-0 text-muted-foreground/75">{source.hostname}</span>
                            </a>
                        ))}
                    </div>
                </>
            ) : null}
        </>
    )
}
