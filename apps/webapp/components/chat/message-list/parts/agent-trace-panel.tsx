'use client'

import {
    Bot,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    CircleDashed,
    FileText,
    GitBranch,
    LoaderCircle,
    PauseCircle,
    TriangleAlert,
    Wrench,
    XCircle,
} from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AgentGraphNodeEntry, AgentGraphRouteEntry, AgentGraphTrace, AgentStepPart, SkillPart } from '@/lib/ai/types/message'
import { cn } from '@/lib/utils'

import { useMessageDisclosureState } from '../message-disclosure-state'
import {
    formatDuration,
    getAgentStatusLabel,
    getAgentTraceStatusValueLabel,
    getAgentTraceTagClassName,
    getAgentTraceTagLabel,
    localizeAgentTraceText,
} from './agent-trace-formatters'
import { type AgentDetailPart, buildGraphNodeInlineDetails, type StepInlineDetail } from './agent-trace-inline-details'

function getGraphNodeStatusIcon(node: AgentGraphNodeEntry) {
    switch (node.status) {
        case 'failed':
            return <XCircle className="size-4 text-rose-500" strokeWidth={2.2} />
        case 'running':
            return <LoaderCircle className="size-4 animate-spin text-sky-500" strokeWidth={2.2} />
        case 'paused':
            return <PauseCircle className="size-4 text-sky-500" strokeWidth={2.2} />
        case 'skipped':
            return <CircleDashed className="size-4 text-muted-foreground" strokeWidth={2.2} />
        case 'completed':
            if (node.severity === 'error') {
                return <XCircle className="size-4 text-rose-500" strokeWidth={2.2} />
            }

            return node.severity === 'warning' ? (
                <TriangleAlert className="size-4 text-amber-500" strokeWidth={2.2} />
            ) : (
                <CheckCircle2 className="size-4 text-emerald-500" strokeWidth={2.2} />
            )
    }
}

function getGraphNodeClassName(node: AgentGraphNodeEntry) {
    switch (node.status) {
        case 'failed':
            return 'border-rose-200 bg-rose-50/70'
        case 'paused':
            return 'border-sky-200 bg-sky-50/60'
        case 'completed':
        case 'running':
        case 'skipped':
            switch (node.severity) {
                case 'error':
                    return 'border-rose-200 bg-rose-50/70'
                case 'warning':
                    return 'border-amber-200/70 bg-amber-50/20'
                case 'info':
                case undefined:
                    return 'border-transparent bg-transparent'
            }
    }
}

const graphRouteLabels: Record<string, string> = {
    ask_clarification: '需要澄清',
    controlled_output_failed: '受控输出失败',
    fix_now: '进入自动修正',
    fix_now_review_required: '需要人工授权修订',
    no_auto_revision: '无需自动修正',
    proceed_to_tasklist_strategy: '继续拆分策略',
    proceed_with_manual_review_items: '带人工复核继续',
    read_failed: '读取失败',
    read_optional_context: '读取补充上下文',
    read_succeeded: '读取成功',
    strategy_failed: '策略失败',
    strategy_approved: '确认策略',
    strategy_edited: '修改策略后继续',
    strategy_feedback_received: '补充策略要求',
    strategy_rejected: '拒绝策略',
    strategy_ready: '策略就绪',
    stop_with_boundary_message: '边界停止',
    tasklist_revision_approved: '同意修订',
    tasklist_revision_edited: '直接编辑后校验',
    tasklist_revision_feedback_received: '补充修订要求',
    tasklist_revision_rejected: '拒绝修订',
}

function getGraphRouteLabel(routeLabel: string) {
    return graphRouteLabels[routeLabel] ?? routeLabel
}

function getGraphNodeRoutes(graph: AgentGraphTrace, nodeId: string) {
    return graph.routes.filter(route => route.fromNodeId === nodeId)
}

function getGraphRevisionCount(graph?: AgentGraphTrace) {
    return graph?.nodes.filter(node => node.nodeId === 'reviseTasklistV2').length ?? 0
}

function getGraphRouteKey(route: AgentGraphRouteEntry) {
    return `${route.fromNodeId}:${route.routeLabel}:${route.toNodeId}:${route.reason ?? ''}`
}

function getVisibleGraphPatchSummaries(node: AgentGraphNodeEntry, displaySummary?: string) {
    const visibleSummaries = new Set<string>()

    return node.patchSummaries
        .map(summary => localizeAgentTraceText(summary) ?? summary)
        .filter(summary => {
            const normalizedSummary = summary.trim()

            if (!normalizedSummary || normalizedSummary === displaySummary?.trim() || visibleSummaries.has(normalizedSummary)) {
                return false
            }

            visibleSummaries.add(normalizedSummary)

            return true
        })
}

function renderInlineDetails(anchorId: string, inlineDetails: StepInlineDetail[]) {
    if (inlineDetails.length === 0) {
        return null
    }

    return (
        <div className="mt-2 space-y-1.5 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs leading-5">
            {inlineDetails.map(detail => {
                const DetailIcon = detail.icon === 'resource' ? FileText : Wrench

                return (
                    <div key={`${anchorId}:${detail.label}`} className="flex min-w-0 items-start gap-2">
                        <DetailIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={2.1} />
                        <div className="min-w-0">
                            <span className="font-medium text-muted-foreground">{detail.label}：</span>
                            <span className="break-words text-foreground">{detail.value}</span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

type GraphDebugSummary = NonNullable<AgentGraphTrace['debugSummary']>

interface GraphDebugSummaryField {
    label: string
    value: string
}

interface GraphDebugSummaryGroup {
    fields: GraphDebugSummaryField[]
    title: string
}

function formatDebugValue(value?: number | string) {
    if (value === undefined || value === '') {
        return '未记录'
    }

    return typeof value === 'number' ? String(value) : (localizeAgentTraceText(value) ?? value)
}

function formatDebugStatus(value?: string) {
    return value ? getAgentTraceStatusValueLabel(value) : '未记录'
}

function formatDebugRoute(route?: GraphDebugSummary['lastRoute']) {
    if (!route) {
        return '未记录'
    }

    return `${route.fromNodeId} → ${getGraphRouteLabel(route.label)} → ${route.toNodeId}`
}

function formatDebugRange(range?: [number, number]) {
    return range ? `${range[0]}-${range[1]}` : '未记录'
}

function formatDebugVisitedNodes(nodes: string[]) {
    return nodes.length > 0 ? nodes.join(' → ') : '未记录'
}

function buildGraphDebugSummaryGroups(summary: GraphDebugSummary): GraphDebugSummaryGroup[] {
    return [
        {
            title: 'Run',
            fields: [
                { label: 'runId', value: summary.runId },
                { label: 'threadId', value: summary.threadId },
                { label: 'runtimeMode', value: summary.runtimeMode },
            ],
        },
        {
            title: 'Route',
            fields: [
                { label: 'currentNode', value: formatDebugValue(summary.currentNode) },
                { label: 'visitedNodes', value: formatDebugVisitedNodes(summary.visitedNodes) },
                { label: 'lastRoute', value: formatDebugRoute(summary.lastRoute) },
            ],
        },
        {
            title: 'Planning',
            fields: [
                { label: 'readiness.status', value: formatDebugStatus(summary.readiness?.status) },
                { label: 'decision.type', value: formatDebugValue(summary.decision?.type) },
                { label: 'strategy.granularity', value: formatDebugValue(summary.strategy?.granularity) },
                { label: 'strategy.expectedStepRange', value: formatDebugRange(summary.strategy?.expectedStepRange) },
                { label: 'optionalContext.status', value: formatDebugStatus(summary.optionalContext?.status) },
                { label: 'manualReviewItems.length', value: String(summary.manualReviewItemCount) },
            ],
        },
        {
            title: 'Validation',
            fields: [
                { label: 'validationV1.status', value: formatDebugStatus(summary.validationV1?.status) },
                { label: 'validationV1.score', value: formatDebugValue(summary.validationV1?.score) },
                { label: 'warningDisposition.fixNow.length', value: formatDebugValue(summary.warningDisposition?.fixNowCount) },
                {
                    label: 'warningDisposition.manualReviewItems.length',
                    value: formatDebugValue(summary.warningDisposition?.manualReviewItemCount),
                },
                { label: 'validationV2.status', value: formatDebugStatus(summary.validationV2?.status) },
                { label: 'validationV2.score', value: formatDebugValue(summary.validationV2?.score) },
                { label: 'validationV3.status', value: formatDebugStatus(summary.validationV3?.status) },
                { label: 'validationV3.score', value: formatDebugValue(summary.validationV3?.score) },
                { label: 'revisionEffect.finalDecision', value: formatDebugValue(summary.revisionEffect?.finalDecision) },
            ],
        },
        {
            title: 'Limits',
            fields: [
                { label: 'stepCount / maxSteps', value: `${summary.stepCount} / ${summary.maxSteps}` },
                {
                    label: 'optionalContextReads / maxOptionalContextReads',
                    value: `${summary.optionalContextReads} / ${summary.maxOptionalContextReads}`,
                },
                { label: 'draftRevisions / maxDraftRevisions', value: `${summary.draftRevisions} / ${summary.maxDraftRevisions}` },
                {
                    label: 'strategyRegenerations / maxStrategyRegenerations',
                    value: `${summary.strategyRegenerations ?? 0} / ${summary.maxStrategyRegenerations ?? 1}`,
                },
            ],
        },
        {
            title: 'Checkpoint',
            fields: [{ label: 'checkpointMode', value: summary.checkpointMode }],
        },
    ]
}

function renderGraphDebugSummary(summary: GraphDebugSummary) {
    return (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
            {buildGraphDebugSummaryGroups(summary).map(group => (
                <section key={group.title} className="min-w-0 rounded-lg bg-muted/30 px-3 py-2.5">
                    <h4 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{group.title}</h4>
                    <dl className="mt-2 space-y-1.5 text-xs leading-5">
                        {group.fields.map(field => (
                            <div key={`${group.title}:${field.label}`} className="grid grid-cols-[minmax(7.5rem,0.48fr)_1fr] gap-2">
                                <dt className="min-w-0 break-words font-medium text-muted-foreground">{field.label}</dt>
                                <dd className="min-w-0 break-words text-foreground">{field.value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ))}
        </div>
    )
}

export function AgentTracePanel({
    collapseWhenFinalAnswerStarts = false,
    debugDisclosureKey,
    detailParts = [],
    mainDisclosureKey,
    part,
}: {
    collapseWhenFinalAnswerStarts?: boolean
    debugDisclosureKey?: string
    detailParts?: AgentDetailPart[]
    mainDisclosureKey?: string
    part: AgentStepPart
}) {
    const [isExpanded, setIsExpanded] = useMessageDisclosureState(mainDisclosureKey, true)
    const [isDebugExpanded, setIsDebugExpanded] = useMessageDisclosureState(debugDisclosureKey, false)
    const previousCollapseRequestRef = useRef(collapseWhenFinalAnswerStarts)
    const graphDebugSummary = part.graph.debugSummary
    const hasGraphTimeline = part.graph.nodes.length > 0 || part.graph.routes.length > 0
    const hasGraph = hasGraphTimeline || Boolean(graphDebugSummary)
    const revisionCount = getGraphRevisionCount(part.graph)
    const skillBadge = detailParts.find((detailPart): detailPart is SkillPart => detailPart.type === 'skill')?.skillId
    const graphNodeInlineDetails = buildGraphNodeInlineDetails(part.graph.nodes, detailParts)

    useEffect(() => {
        if (collapseWhenFinalAnswerStarts && !previousCollapseRequestRef.current) {
            const collapseTimer = window.setTimeout(() => {
                setIsExpanded(false)
            }, 0)

            previousCollapseRequestRef.current = true

            return () => window.clearTimeout(collapseTimer)
        }

        previousCollapseRequestRef.current = collapseWhenFinalAnswerStarts
    }, [collapseWhenFinalAnswerStarts, setIsExpanded])

    if (!hasGraph) {
        return null
    }

    return (
        <Card size="sm" className="mb-3 overflow-hidden border-border/60 shadow-sm">
            <CardHeader className="border-b border-border/60 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                            <Bot className="size-[18px]" strokeWidth={2.2} />
                        </span>
                        <div className="min-w-0">
                            <CardTitle className="text-base">Agent Graph 执行过程</CardTitle>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>版本方案转任务清单</span>
                                <span>·</span>
                                <Badge variant="outline" className="h-5 rounded-full bg-sky-50 px-2 text-[0.68rem] text-sky-700">
                                    LangGraph
                                </Badge>
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
                                <span>{`${part.graph?.nodes.length ?? 0} 个节点`}</span>
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
                    {hasGraphTimeline ? (
                        <div className="space-y-3">
                            <div className="relative space-y-1.5 before:absolute before:top-4 before:bottom-4 before:left-4 before:w-px before:bg-border">
                                {part.graph.nodes.map(node => {
                                    const duration = formatDuration(node.durationMs)
                                    const displayError = localizeAgentTraceText(node.error)
                                    const displaySummary = localizeAgentTraceText(node.summary)
                                    const visibleTags = node.tags?.slice(0, 3) ?? []
                                    const visiblePatchSummaries = getVisibleGraphPatchSummaries(node, displaySummary)
                                    const inlineDetails = graphNodeInlineDetails.get(node.nodeId) ?? []
                                    const nodeRoutes = getGraphNodeRoutes(part.graph, node.nodeId)

                                    return (
                                        <div
                                            key={node.nodeId}
                                            className={cn(
                                                'relative grid grid-cols-[2rem_1fr] gap-3 rounded-xl border p-3',
                                                getGraphNodeClassName(node)
                                            )}
                                        >
                                            <div className="relative z-10 mt-0.5 grid size-8 place-items-center rounded-full bg-background shadow-xs ring-1 ring-border">
                                                {getGraphNodeStatusIcon(node)}
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                        <Badge variant="secondary" className="size-6 rounded-full px-0 text-xs">
                                                            {node.stepIndex}
                                                        </Badge>
                                                        <h4 className="min-w-0 truncate text-sm font-semibold text-foreground">
                                                            {localizeAgentTraceText(node.title)}
                                                        </h4>
                                                        <Badge
                                                            variant="outline"
                                                            className="h-5 rounded-full bg-background/70 px-2 text-[0.68rem]"
                                                        >
                                                            {node.nodeId}
                                                        </Badge>
                                                    </div>
                                                    {duration ? <span className="text-xs text-muted-foreground">{duration}</span> : null}
                                                </div>

                                                {displaySummary ? (
                                                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{displaySummary}</p>
                                                ) : null}
                                                {displayError ? (
                                                    <p className="mt-1 text-sm leading-6 text-rose-600">{displayError}</p>
                                                ) : null}

                                                {nodeRoutes.length > 0 ? (
                                                    <div className="mt-2 space-y-1.5">
                                                        {nodeRoutes.map(route => (
                                                            <div
                                                                key={getGraphRouteKey(route)}
                                                                className="flex min-w-0 items-start gap-2 text-xs"
                                                            >
                                                                <GitBranch
                                                                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                                                                    strokeWidth={2.1}
                                                                />
                                                                <div className="min-w-0 leading-5">
                                                                    <span className="font-medium text-muted-foreground">路由：</span>
                                                                    <span className="text-foreground">
                                                                        {getGraphRouteLabel(route.routeLabel)}
                                                                    </span>
                                                                    <span className="text-muted-foreground"> → </span>
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="h-5 rounded-full bg-background/70 px-2 text-[0.68rem]"
                                                                    >
                                                                        {route.toNodeId}
                                                                    </Badge>
                                                                    {route.reason ? (
                                                                        <span className="break-words text-muted-foreground">
                                                                            {' '}
                                                                            {localizeAgentTraceText(route.reason)}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}

                                                {visibleTags.length > 0 ? (
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {visibleTags.map(tag => (
                                                            <Badge
                                                                key={`${node.nodeId}:${tag}`}
                                                                variant="outline"
                                                                className={getAgentTraceTagClassName(tag)}
                                                            >
                                                                {getAgentTraceTagLabel(tag)}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : null}

                                                {renderInlineDetails(node.nodeId, inlineDetails)}

                                                {visiblePatchSummaries.length > 0 ? (
                                                    <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs leading-5">
                                                        {visiblePatchSummaries.map(summary => (
                                                            <p
                                                                key={`${node.nodeId}:${summary}`}
                                                                className="break-words text-muted-foreground"
                                                            >
                                                                {summary}
                                                            </p>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ) : null}

                    {graphDebugSummary ? (
                        <div className="mt-4 border-t border-border/60 pt-3">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                                aria-expanded={isDebugExpanded}
                                onClick={() => setIsDebugExpanded(current => !current)}
                            >
                                <span>Debug</span>
                                {isDebugExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                            </Button>

                            {isDebugExpanded ? renderGraphDebugSummary(graphDebugSummary) : null}
                        </div>
                    ) : null}
                </CardContent>
            ) : null}
        </Card>
    )
}
