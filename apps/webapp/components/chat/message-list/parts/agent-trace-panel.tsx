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
import type { AgentStepEntry, AgentStepPart, PromptPart, ResourcePart, SkillPart, ToolPart } from '@/lib/ai/types/message'
import { cn } from '@/lib/utils'

type AgentDetailPart = PromptPart | ResourcePart | SkillPart | ToolPart
type DetailRuntimeStatus = AgentStepEntry['status'] | PromptPart['status'] | ResourcePart['status'] | ToolPart['status']
type AgentTraceTagVariant = 'danger' | 'evidence' | 'meta' | 'revision' | 'score' | 'warning'

interface StepInlineDetail {
    icon: 'resource' | 'tool'
    label: string
    value: string
}

function getAgentStatusLabel(status: AgentStepPart['status']) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        case 'skipped':
            return '已跳过'
        default:
            return '执行中'
    }
}

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

function getStepClassName(step: AgentStepEntry) {
    if (step.status === 'failed' || step.severity === 'error') {
        return 'border-rose-200 bg-rose-50/70'
    }

    if (step.severity === 'warning') {
        return 'border-amber-200/70 bg-amber-50/20'
    }

    return 'border-transparent bg-transparent'
}

function getAgentTraceTagLabel(tag: string) {
    const labelMap: Record<string, string> = {
        missing_checklist: '缺少任务清单',
        missing_engineering_verification: '缺少工程验证',
        missing_pause_points: '缺少暂停点',
        missing_plan_uri: '缺少来源方案',
        missing_steps: '缺少实施步骤',
        missing_test_plan: '缺少验证计划',
        missing_title: '缺少标题',
        missing_verification: '缺少验证内容',
    }

    return labelMap[tag.trim()] ?? tag
}

function getAgentTraceTagVariant(tag: string): AgentTraceTagVariant {
    const normalizedTag = tag.trim().toLowerCase()

    if (normalizedTag.startsWith('score')) {
        return 'score'
    }

    if (
        normalizedTag.includes('blocking') ||
        normalizedTag.includes('fail') ||
        normalizedTag.includes('error') ||
        normalizedTag.includes('严重') ||
        normalizedTag.includes('阻塞') ||
        normalizedTag.includes('失败')
    ) {
        return 'danger'
    }

    if (
        normalizedTag.startsWith('missing_') ||
        normalizedTag.includes('缺少') ||
        normalizedTag.includes('warning') ||
        normalizedTag.includes('warn')
    ) {
        return 'warning'
    }

    if (normalizedTag.includes('revision') || normalizedTag.includes('tasklistdraft v2') || normalizedTag.includes('自动修正')) {
        return 'revision'
    }

    if (/^step\s*\d+/i.test(tag.trim()) || /^第\s*\d+/.test(tag.trim()) || normalizedTag.includes('章节')) {
        return 'evidence'
    }

    if (
        normalizedTag.includes('targetversion') ||
        normalizedTag.startsWith('goals') ||
        normalizedTag.startsWith('non-goals') ||
        normalizedTag.startsWith('version')
    ) {
        return 'meta'
    }

    return 'meta'
}

function getAgentTraceTagClassName(tag: string) {
    const variant = getAgentTraceTagVariant(tag)

    switch (variant) {
        case 'danger':
            return 'border-rose-200/80 bg-rose-50/80 text-rose-700'
        case 'evidence':
            return 'border-violet-200/70 bg-violet-50/60 text-violet-700'
        case 'revision':
            return 'border-blue-200/80 bg-blue-50/70 text-blue-700'
        case 'score':
            return 'border-sky-200/80 bg-sky-50/70 text-sky-700'
        case 'warning':
            return 'border-amber-200/90 bg-amber-50/75 text-amber-700'
        case 'meta':
            return 'border-slate-200 bg-slate-50/80 text-slate-600'
    }
}

function getAttentionTagCount(tags?: string[]) {
    return (tags ?? []).filter(tag => {
        const variant = getAgentTraceTagVariant(tag)

        return variant === 'danger' || variant === 'warning'
    }).length
}

function getStepDisplaySummary(step: AgentStepEntry) {
    const attentionTagCount = getAttentionTagCount(step.tags)
    const isSecondValidationStep = step.actionType === 'call_tool' && step.title.includes('再次校验')

    if (isSecondValidationStep && attentionTagCount > 0) {
        return `再次校验完成，仍有 ${attentionTagCount} 个需人工确认的问题。`
    }

    return step.summary
}

function formatDuration(durationMs?: number) {
    if (typeof durationMs !== 'number') {
        return null
    }

    if (durationMs < 1000) {
        return `${durationMs}ms`
    }

    return `${(durationMs / 1000).toFixed(1)}s`
}

function getDetailStatusLabel(status: DetailRuntimeStatus) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        case 'loading':
            return '读取中'
        default:
            return '执行中'
    }
}

function tryParseJson(value?: string) {
    if (!value) {
        return null
    }

    try {
        return JSON.parse(value) as unknown
    } catch {
        return null
    }
}

function getValidationToolSummary(part: ToolPart, validateIndex: number) {
    const output = tryParseJson(part.output)

    if (!output || typeof output !== 'object' || Array.isArray(output)) {
        return {
            label: `工具调用 v${validateIndex}`,
            value: `validate_tasklist_structure：${getDetailStatusLabel(part.status)}`,
        }
    }

    const status = 'status' in output && typeof output.status === 'string' ? output.status : getDetailStatusLabel(part.status)
    const score = 'score' in output && typeof output.score === 'number' ? `，score ${output.score}` : ''

    return {
        label: `工具调用 v${validateIndex}`,
        value: `validate_tasklist_structure：${status}${score}`,
    }
}

function buildStepInlineDetails(steps: AgentStepEntry[], detailParts: AgentDetailPart[]) {
    const detailsByStepIndex = new Map<number, StepInlineDetail[]>()
    const resourceDetails = detailParts.filter((detailPart): detailPart is ResourcePart => detailPart.type === 'resource')
    const validationToolDetails = detailParts.filter(
        (detailPart): detailPart is ToolPart => detailPart.type === 'tool' && detailPart.toolName === 'validate_tasklist_structure'
    )
    let resourceIndex = 0
    let validationToolIndex = 0

    // 受控 Agent 路径按固定顺序执行：读资源 -> 生成 -> 校验 -> 修正 -> 再校验。
    // 展示层按这个顺序把底层 Resource/Tool 事实贴回对应 step，避免在消息流里重复铺开调试卡片。
    for (const step of steps) {
        const details: StepInlineDetail[] = []

        if (step.actionType === 'read_resource') {
            const resource = resourceDetails[resourceIndex]

            if (resource) {
                resourceIndex += 1
                details.push({
                    icon: 'resource',
                    label: '资源读取',
                    value: `${resource.uri}：${getDetailStatusLabel(resource.status)}`,
                })
            }
        }

        if (step.actionType === 'call_tool') {
            const tool = validationToolDetails[validationToolIndex]

            if (tool) {
                validationToolIndex += 1
                details.push({
                    icon: 'tool',
                    ...getValidationToolSummary(tool, validationToolIndex),
                })
            }
        }

        if (details.length > 0) {
            detailsByStepIndex.set(step.stepIndex, details)
        }
    }

    return detailsByStepIndex
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
                                <span>Version Plan to Tasklist</span>
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
                            const displaySummary = getStepDisplaySummary(step)
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
                                                <h4 className="truncate text-sm font-semibold text-foreground">{step.title}</h4>
                                            </div>
                                            {duration ? <span className="text-xs text-muted-foreground">{duration}</span> : null}
                                        </div>

                                        {displaySummary ? (
                                            <p className="mt-1 text-sm leading-6 text-muted-foreground">{displaySummary}</p>
                                        ) : null}
                                        {step.error ? <p className="mt-1 text-sm leading-6 text-rose-600">{step.error}</p> : null}

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
