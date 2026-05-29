'use client'

import {
    Bot,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    CircleDashed,
    FileText,
    LoaderCircle,
    TriangleAlert,
    Wrench,
    XCircle,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AgentStepEntry, AgentStepPart, SkillPart } from '@/lib/ai/types/message'
import { cn } from '@/lib/utils'

import {
    formatDuration,
    getAgentStatusLabel,
    getAgentTraceTagClassName,
    getAgentTraceTagLabel,
    getStepClassName,
    getStepDisplaySummary,
    localizeAgentTraceText,
} from './agent-trace-formatters'
import { type AgentDetailPart, buildStepInlineDetails } from './agent-trace-inline-details'

function getStepStatusIcon(step: AgentStepEntry) {
    if (step.status === 'failed') {
        return <XCircle className="size-4 text-rose-500" strokeWidth={2.2} />
    }

    if (step.status === 'running') {
        return <LoaderCircle className="size-4 animate-spin text-sky-500" strokeWidth={2.2} />
    }

    if (step.status === 'skipped') {
        return <CircleDashed className="size-4 text-muted-foreground" strokeWidth={2.2} />
    }

    if (step.severity === 'warning') {
        return <TriangleAlert className="size-4 text-amber-500" strokeWidth={2.2} />
    }

    return <CheckCircle2 className="size-4 text-emerald-500" strokeWidth={2.2} />
}

export function AgentTracePanel({ detailParts = [], part }: { detailParts?: AgentDetailPart[]; part: AgentStepPart }) {
    const [isExpanded, setIsExpanded] = useState(true)
    const revisionCount = part.steps.filter(step => step.actionType === 'revise_tasklist').length
    const skillBadge = detailParts.find((detailPart): detailPart is SkillPart => detailPart.type === 'skill')?.skillId
    const stepInlineDetails = buildStepInlineDetails(part.steps, detailParts)

    return (
        <Card size="sm" className="mb-3 overflow-hidden border-border/60 shadow-sm">
            <CardHeader className="border-b border-border/60 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                            <Bot className="size-[18px]" strokeWidth={2.2} />
                        </span>
                        <div className="min-w-0">
                            <CardTitle className="text-base">Agent 执行过程</CardTitle>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>版本方案转任务清单</span>
                                {skillBadge ? (
                                    <>
                                        <span>·</span>
                                        <Badge variant="outline" className="h-5 rounded-full bg-background/70 px-2 text-[0.68rem]">
                                            {skillBadge}
                                        </Badge>
                                    </>
                                ) : null}
                                <span>·</span>
                                <span>{getAgentStatusLabel(part.status)}</span>
                                <span>·</span>
                                <span>{part.steps.length} 步</span>
                                <span>·</span>
                                <span>修正 {revisionCount} 次</span>
                            </div>
                        </div>
                    </div>

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-sky-700 hover:bg-sky-50 hover:text-sky-800"
                        onClick={() => setIsExpanded(current => !current)}
                    >
                        <span>{isExpanded ? '收起详情' : '展开详情'}</span>
                        {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </Button>
                </div>
            </CardHeader>

            {isExpanded ? (
                <CardContent className="pt-4">
                    <div className="relative space-y-1.5 before:absolute before:top-4 before:bottom-4 before:left-4 before:w-px before:bg-border">
                        {part.steps.map(step => {
                            const duration = formatDuration(step.durationMs)
                            const displayError = localizeAgentTraceText(step.error)
                            const displaySummary = getStepDisplaySummary(step)
                            const displayTitle = localizeAgentTraceText(step.title) ?? step.title
                            const visibleTags = step.tags?.slice(0, 3) ?? []
                            const inlineDetails = stepInlineDetails.get(step.stepIndex) ?? []

                            return (
                                <div
                                    key={step.partId}
                                    className={cn('relative grid grid-cols-[2rem_1fr] gap-3 rounded-xl border p-3', getStepClassName(step))}
                                >
                                    <div className="relative z-10 mt-0.5 grid size-8 place-items-center rounded-full bg-background shadow-xs ring-1 ring-border">
                                        {getStepStatusIcon(step)}
                                    </div>

                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <Badge variant="secondary" className="size-6 rounded-full px-0 text-xs">
                                                    {step.stepIndex}
                                                </Badge>
                                                <h4 className="truncate text-sm font-semibold text-foreground">{displayTitle}</h4>
                                            </div>
                                            {duration ? <span className="text-xs text-muted-foreground">{duration}</span> : null}
                                        </div>

                                        {displaySummary ? (
                                            <p className="mt-1 text-sm leading-6 text-muted-foreground">{displaySummary}</p>
                                        ) : null}
                                        {displayError ? <p className="mt-1 text-sm leading-6 text-rose-600">{displayError}</p> : null}

                                        {visibleTags.length > 0 ? (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {visibleTags.map(tag => (
                                                    <Badge
                                                        key={`${step.partId}:${tag}`}
                                                        variant="outline"
                                                        className={getAgentTraceTagClassName(tag)}
                                                    >
                                                        {getAgentTraceTagLabel(tag)}
                                                    </Badge>
                                                ))}
                                            </div>
                                        ) : null}

                                        {inlineDetails.length > 0 ? (
                                            <div className="mt-2 space-y-1.5 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs leading-5">
                                                {inlineDetails.map(detail => {
                                                    const DetailIcon = detail.icon === 'resource' ? FileText : Wrench

                                                    return (
                                                        <div
                                                            key={`${step.partId}:${detail.label}`}
                                                            className="flex min-w-0 items-start gap-2"
                                                        >
                                                            <DetailIcon
                                                                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                                                                strokeWidth={2.1}
                                                            />
                                                            <div className="min-w-0">
                                                                <span className="font-medium text-muted-foreground">{detail.label}：</span>
                                                                <span className="break-words text-foreground">{detail.value}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            ) : null}
        </Card>
    )
}
