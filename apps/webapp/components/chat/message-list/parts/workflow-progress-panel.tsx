'use client'

import { CheckCircle2, ChevronRight, CircleSlash2, LoaderCircle, XCircle } from 'lucide-react'
import { useMemo } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import type { WorkflowProgressPart, WorkflowProgressStep } from '@/lib/ai/types/message'
import { cn } from '@/lib/utils'

import { useMessageDisclosureState } from '../message-disclosure-state'
import styles from './workflow-progress-panel.module.css'

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

    if (part.status === 'failed') {
        return '处理未完成'
    }

    return part.status === 'cancelled' ? '已取消' : '已处理'
}

function getStepStatusIcon(step: WorkflowProgressStep) {
    switch (step.status) {
        case 'completed':
            return <CheckCircle2 className="text-muted-foreground" strokeWidth={2.1} />
        case 'failed':
            return <XCircle className="text-destructive" strokeWidth={2.1} />
        case 'cancelled':
            return <CircleSlash2 className="text-muted-foreground" strokeWidth={2.1} />
        default:
            return <LoaderCircle className="animate-spin text-primary" strokeWidth={2.1} />
    }
}

function WorkflowProgressStepRow({ step }: { step: WorkflowProgressStep }) {
    const durationLabel = formatWorkflowDuration(step.durationMs)
    const isRunning = step.status === 'running'

    return (
        <Marker variant="border" role={isRunning ? 'status' : undefined} className="items-start">
            <MarkerIcon className="mt-0.5">{getStepStatusIcon(step)}</MarkerIcon>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 items-start justify-between gap-3">
                    <MarkerContent className={cn('font-medium text-foreground', isRunning && 'text-primary')}>{step.title}</MarkerContent>
                    {durationLabel ? <span className="shrink-0 text-xs text-muted-foreground">{durationLabel}</span> : null}
                </div>

                {step.summary ? <MarkerContent>{step.summary}</MarkerContent> : null}

                {step.details.length > 0 ? (
                    <ul className="list-disc pl-4 text-sm text-muted-foreground">
                        {step.details.map(detail => (
                            <li key={`${step.id}:${detail}`} className="mb-1 last:mb-0">
                                {detail}
                            </li>
                        ))}
                    </ul>
                ) : null}

                {step.failureMessage ? <MarkerContent className="text-destructive">{step.failureMessage}</MarkerContent> : null}
            </div>
        </Marker>
    )
}

export function WorkflowProgressPanel({ disclosureKey, part }: { disclosureKey?: string; part: WorkflowProgressPart }) {
    const [expanded, setExpanded] = useMessageDisclosureState(disclosureKey, part.visibility === 'expanded')

    const summaryLabel = useMemo(() => getWorkflowSummary(part), [part])
    const headerLabel =
        part.status === 'running' ? (part.workflowKind === 'image_generation' ? `正在${part.title}` : part.title) : summaryLabel
    const hasDetails = part.steps.length > 0 || (part.status !== 'running' && Boolean(part.failureMessage))

    return (
        <section className="mb-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 shadow-xs">
            <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded(value => !value)}
                className="flex w-full items-center justify-between gap-3 text-left"
            >
                <div className="flex min-w-0 items-center">
                    {part.status === 'running' ? (
                        <span className={cn(styles.headerShimmer, 'truncate text-sm font-medium')}>{headerLabel}</span>
                    ) : (
                        <span className="truncate text-sm font-medium text-foreground">{headerLabel}</span>
                    )}
                </div>
                <ChevronRight
                    className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded ? 'rotate-90' : '')}
                    strokeWidth={2.1}
                />
            </button>

            {expanded && hasDetails ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-border/50 pt-3">
                    {part.steps.map(step => (
                        <WorkflowProgressStepRow key={step.id} step={step} />
                    ))}

                    {part.status !== 'running' && part.failureMessage ? (
                        <Alert variant="destructive">
                            <XCircle />
                            <AlertTitle>{part.status === 'cancelled' ? '流程已取消' : '处理失败'}</AlertTitle>
                            <AlertDescription>{part.failureMessage}</AlertDescription>
                        </Alert>
                    ) : null}
                </div>
            ) : null}
        </section>
    )
}
