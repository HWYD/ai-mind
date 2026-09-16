'use client'

import { ChevronDown, ChevronRight, ExternalLink, FileText } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import type { AgentRunPart, MindMessagePart } from '@/lib/ai/types/message'

import { useMessageDisclosureState } from '../../message-disclosure-state'
import { GeneralAgentTraceRow } from './general-agent-trace-row'
import { buildGeneralAgentTraceView, type GeneralAgentTraceStatus } from './general-agent-trace-view'

function getTitle(status: GeneralAgentTraceStatus, finalAnswerStarted: boolean) {
    if (status === 'cancelled') {
        return '已停止思考'
    }

    if (status === 'failed') {
        return '处理未完成'
    }

    return finalAnswerStarted ? '已完成思考' : '正在思考'
}

export function GeneralAgentTracePanel({
    disclosureKey,
    finalAnswerStarted,
    parts,
    run,
}: {
    disclosureKey?: string
    finalAnswerStarted: boolean
    parts: MindMessagePart[]
    run?: AgentRunPart
}) {
    const status = run?.status ?? 'running'
    const view = buildGeneralAgentTraceView(parts, status)
    const [open, setOpen] = useMessageDisclosureState(disclosureKey, !finalAnswerStarted)
    const wasFinalAnswerStartedRef = useRef(finalAnswerStarted)

    useLayoutEffect(() => {
        if (finalAnswerStarted && !wasFinalAnswerStartedRef.current) {
            setOpen(false)
        }

        wasFinalAnswerStartedRef.current = finalAnswerStarted
    }, [finalAnswerStarted, setOpen])

    const title = getTitle(status, finalAnswerStarted)
    const hasDetails = view.rows.length > 0 || view.readSources.length > 0

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="mb-3">
            <CollapsibleTrigger asChild>
                <button
                    type="button"
                    aria-expanded={open}
                    aria-label={title}
                    className="flex h-[30px] w-fit items-center gap-1.5 text-left text-[15px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                    {title === '正在思考' ? <span className="shimmer">{title}</span> : <span>{title}</span>}
                    {hasDetails ? (
                        open ? (
                            <ChevronDown className="size-4 shrink-0" strokeWidth={2.2} />
                        ) : (
                            <ChevronRight className="size-4 shrink-0" strokeWidth={2.2} />
                        )
                    ) : null}
                </button>
            </CollapsibleTrigger>
            {hasDetails ? (
                <CollapsibleContent className="overflow-hidden">
                    {open ? (
                        <div className="pt-1">
                            <Separator className="mb-1" />
                            {view.rows.map(row => (
                                <GeneralAgentTraceRow key={row.id} row={row} />
                            ))}
                            {view.readSources.length > 0 ? (
                                <>
                                    <Separator className="my-1.5" />
                                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                                            <FileText className="size-3.5" strokeWidth={2.1} />
                                            已读取来源
                                        </div>
                                        {view.readSources.map(source => (
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
                        </div>
                    ) : null}
                </CollapsibleContent>
            ) : null}
        </Collapsible>
    )
}
