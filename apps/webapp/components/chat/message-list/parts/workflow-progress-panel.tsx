'use client'

import { CheckCircle2, ChevronRight, LoaderCircle, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { WorkflowProgressPart, WorkflowProgressStep } from '@/lib/ai/types/message'
import { cn } from '@/lib/utils'

function formatWorkflowDuration(durationMs?: number) {
    if (typeof durationMs !== 'number' || durationMs < 0) {
        return null
    }

    const totalSeconds = Math.max(1, Math.round(durationMs / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
        return `${hours}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`
    }

    if (minutes > 0) {
        return `${minutes}m${String(seconds).padStart(2, '0')}s`
    }

    return `${seconds}s`
}

function getWorkflowSummary(part: WorkflowProgressPart) {
    if (part.summary) {
        return part.summary
    }

    const durationLabel = formatWorkflowDuration(part.durationMs)

    if (durationLabel) {
        return `已处理 ${durationLabel}`
    }

    return part.status === 'failed' ? '处理未完成' : '已处理'
}

function getStepStatusIcon(step: WorkflowProgressStep) {
    switch (step.status) {
        case 'completed':
            return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" strokeWidth={2.1} />
        case 'failed':
            return <XCircle className="size-4 shrink-0 text-rose-600" strokeWidth={2.1} />
        default:
            return <LoaderCircle className="size-4 shrink-0 animate-spin text-sky-600" strokeWidth={2.1} />
    }
}

function getRunStatusIcon(part: WorkflowProgressPart) {
    switch (part.status) {
        case 'completed':
            return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" strokeWidth={2.1} />
        case 'failed':
            return <XCircle className="size-4 shrink-0 text-rose-600" strokeWidth={2.1} />
        default:
            return <LoaderCircle className="size-4 shrink-0 animate-spin text-sky-600" strokeWidth={2.1} />
    }
}

function WorkflowProgressStepRow({ step }: { step: WorkflowProgressStep }) {
    const durationLabel = formatWorkflowDuration(step.durationMs)

    return (
        <div className="space-y-1.5 border-t border-border/50 pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                    <div className="pt-0.5">{getStepStatusIcon(step)}</div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{step.title}</p>
                        {step.summary ? <p className="mt-0.5 text-sm text-muted-foreground">{step.summary}</p> : null}
                    </div>
                </div>
                {durationLabel ? <span className="shrink-0 text-xs text-muted-foreground">{durationLabel}</span> : null}
            </div>

            {step.details.length > 0 ? (
                <ul className="space-y-1 pl-6 text-sm text-muted-foreground">
                    {step.details.map(detail => (
                        <li key={`${step.id}:${detail}`} className="list-disc">
                            {detail}
                        </li>
                    ))}
                </ul>
            ) : null}

            {step.failureMessage ? <p className="pl-6 text-sm text-rose-600">{step.failureMessage}</p> : null}
        </div>
    )
}

export function WorkflowProgressPanel({ part }: { part: WorkflowProgressPart }) {
    const [expanded, setExpanded] = useState(part.visibility === 'expanded')

    const summaryLabel = useMemo(() => getWorkflowSummary(part), [part])
    const headerLabel = part.status === 'running' ? part.title : summaryLabel

    return (
        <section className="mb-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 shadow-xs">
            <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded(value => !value)}
                className="flex w-full items-center justify-between gap-3 text-left"
            >
                <div className="flex min-w-0 items-center gap-2">
                    {getRunStatusIcon(part)}
                    <span className="truncate text-sm font-medium text-foreground">{headerLabel}</span>
                </div>
                <ChevronRight
                    className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded ? 'rotate-90' : '')}
                    strokeWidth={2.1}
                />
            </button>

            {expanded ? (
                <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
                    {part.steps.map(step => (
                        <WorkflowProgressStepRow key={step.id} step={step} />
                    ))}

                    {part.status !== 'running' && part.failureMessage ? (
                        <p className="border-t border-border/50 pt-3 text-sm text-rose-600">{part.failureMessage}</p>
                    ) : null}
                </div>
            ) : null}
        </section>
    )
}
