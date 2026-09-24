'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import type { AgentRunPart, MindMessagePart } from '@/lib/ai/types/message'

import { useMessageDisclosureState } from '../../message-disclosure-state'
import { GeneralAgentTraceRow } from './general-agent-trace-row'
import { buildGeneralAgentTraceView, type GeneralAgentTraceStatus } from './general-agent-trace-view'

function getTitle(status: GeneralAgentTraceStatus, finalAnswerStarted: boolean, finalizationMode?: AgentRunPart['finalizationMode']) {
    if (status === 'cancelled') {
        return '已停止思考'
    }

    if (status === 'failed' || finalizationMode === 'constrained') {
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
    const isConstrainedFinalizer = run?.finalizationMode === 'constrained'
    const isRestoredConstrainedFinalizer = isConstrainedFinalizer && run?.restored === true
    const [open, setOpen] = useMessageDisclosureState(
        disclosureKey,
        (isConstrainedFinalizer && !isRestoredConstrainedFinalizer) || !finalAnswerStarted
    )
    const wasFinalAnswerStartedRef = useRef(finalAnswerStarted)

    useLayoutEffect(() => {
        if (finalAnswerStarted && !wasFinalAnswerStartedRef.current && !isConstrainedFinalizer) {
            setOpen(false)
        }

        wasFinalAnswerStartedRef.current = finalAnswerStarted
    }, [finalAnswerStarted, isConstrainedFinalizer, setOpen])

    const title = getTitle(status, finalAnswerStarted, run?.finalizationMode)
    const hasDetails = view.hasFoldableDetails
    const titleClassName =
        'flex h-[30px] w-fit items-center gap-1.5 text-left text-[15px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
    const titleContent = title === '正在思考' ? <span className="shimmer">{title}</span> : <span>{title}</span>

    if (!hasDetails) {
        return (
            <div className="mb-3">
                <div className={titleClassName}>{titleContent}</div>
                {view.rows.length > 0 ? (
                    <div className="mt-1">
                        {view.rows.map(row => (
                            <GeneralAgentTraceRow key={row.id} row={row} />
                        ))}
                    </div>
                ) : null}
            </div>
        )
    }

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="mb-3">
            <CollapsibleTrigger asChild>
                <button type="button" aria-expanded={open} aria-label={title} className={titleClassName}>
                    {titleContent}
                    {open ? (
                        <ChevronDown className="size-4 shrink-0" strokeWidth={2.2} />
                    ) : (
                        <ChevronRight className="size-4 shrink-0" strokeWidth={2.2} />
                    )}
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden">
                {open ? (
                    <div className="pt-1">
                        <Separator className="mb-1" />
                        {view.rows.map(row => (
                            <GeneralAgentTraceRow key={row.id} row={row} />
                        ))}
                    </div>
                ) : null}
            </CollapsibleContent>
        </Collapsible>
    )
}
