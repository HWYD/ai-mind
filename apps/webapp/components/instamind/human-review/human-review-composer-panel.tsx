'use client'

import { CircleAlert, Info, LoaderCircle, Pencil, RotateCcw, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type {
    StrategyReviewDecision,
    TasklistRevisionReviewDecision,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/hitl-review-schema'
import type {
    TasklistStrategy,
    TasklistStrategyGranularity,
    TasklistStrategyGrouping,
    TasklistStrategyPriorityFocus,
    TasklistStrategyStepCountRange,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/tasklist-strategy-schema'
import { cn } from '@/lib/utils'

import type { PendingAgentInterrupt } from '../use-chat-stream'

type ReviewDecision = StrategyReviewDecision | TasklistRevisionReviewDecision
type ReviewDecisionType = ReviewDecision['type']

const granularityOptions: TasklistStrategyGranularity[] = ['coarse', 'medium', 'detailed']
const stepCountRangeOptions: TasklistStrategyStepCountRange[] = ['3-5', '5-8', '8-12']
const groupingOptions: TasklistStrategyGrouping[] = ['by_phase', 'by_module', 'by_risk', 'by_test_flow']
const priorityFocusOptions: TasklistStrategyPriorityFocus[] = [
    'core_runtime',
    'state_model',
    'frontend_ui',
    'tests',
    'docs',
    'deployment',
    'compatibility',
]

const granularityLabels: Record<TasklistStrategyGranularity, string> = {
    coarse: '更粗',
    detailed: '更细',
    medium: '中等',
}

const stepCountRangeLabels: Record<TasklistStrategyStepCountRange, string> = {
    '3-5': '3-5',
    '5-8': '5-8',
    '8-12': '8-12',
}

const groupingLabels: Record<TasklistStrategyGrouping, string> = {
    by_module: '按模块',
    by_phase: '按阶段',
    by_risk: '按风险',
    by_test_flow: '按测试流程',
}

const priorityFocusLabels: Record<TasklistStrategyPriorityFocus, string> = {
    compatibility: '兼容性',
    core_runtime: '核心运行时',
    deployment: '部署',
    docs: '文档',
    frontend_ui: '前端 UI',
    state_model: '状态模型',
    tests: '测试',
}

const validationStatusLabels = {
    fail: 'fail',
    pass: 'pass',
    warning: 'warning',
} as const

const primaryReviewActionClass = 'bg-[var(--composer-focus)] text-white hover:bg-[color-mix(in_oklch,var(--composer-focus)_88%,black)]'

function normalizeStrategy(strategy: TasklistStrategy): TasklistStrategy {
    const notes = strategy.notes?.trim()

    return {
        ...strategy,
        notes: notes || undefined,
        priorityFocus: [...strategy.priorityFocus],
    }
}

function areStrategiesEqual(left: TasklistStrategy, right: TasklistStrategy) {
    const normalizedLeft = normalizeStrategy(left)
    const normalizedRight = normalizeStrategy(right)

    return (
        normalizedLeft.granularity === normalizedRight.granularity &&
        normalizedLeft.stepCountRange === normalizedRight.stepCountRange &&
        normalizedLeft.grouping === normalizedRight.grouping &&
        normalizedLeft.notes === normalizedRight.notes &&
        normalizedLeft.priorityFocus.length === normalizedRight.priorityFocus.length &&
        normalizedLeft.priorityFocus.every((item, index) => item === normalizedRight.priorityFocus[index])
    )
}

function ChoiceChip({
    children,
    disabled,
    onClick,
    selected,
}: {
    children: ReactNode
    disabled?: boolean
    onClick: () => void
    selected: boolean
}) {
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={selected}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'h-8 rounded-full border px-3 text-[13px] shadow-none transition-[border-color,background-color,color]',
                selected
                    ? 'border-[color-mix(in_oklch,var(--composer-focus-border)_72%,var(--border))] bg-[color-mix(in_oklch,var(--composer-focus-soft)_62%,white)] text-[color-mix(in_oklch,var(--composer-focus)_58%,black)] hover:bg-[color-mix(in_oklch,var(--composer-focus-soft)_78%,white)]'
                    : 'border-border/70 bg-background text-foreground hover:border-[var(--composer-focus-border)] hover:bg-[var(--composer-mode-bg)]'
            )}
        >
            {children}
        </Button>
    )
}

function ChoiceRow<TValue extends string>({
    disabled,
    label,
    labels,
    onChange,
    options,
    value,
}: {
    disabled?: boolean
    label: string
    labels: Record<TValue, string>
    onChange: (value: TValue) => void
    options: TValue[]
    value: TValue
}) {
    return (
        <div className="grid gap-2 sm:grid-cols-[5rem_1fr] sm:items-center">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="flex flex-wrap gap-2">
                {options.map(option => (
                    <ChoiceChip key={option} selected={value === option} disabled={disabled} onClick={() => onChange(option)}>
                        {labels[option]}
                    </ChoiceChip>
                ))}
            </div>
        </div>
    )
}

function ReviewInfoPopover({ ariaLabel, children, title }: { ariaLabel: string; children: ReactNode; title: string }) {
    const [open, setOpen] = useState(false)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={ariaLabel}
                    onBlur={() => setOpen(false)}
                    onFocus={() => setOpen(true)}
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                    className="rounded-full text-slate-400 hover:bg-[var(--composer-mode-bg)] hover:text-slate-600 focus-visible:text-[var(--composer-focus)]"
                >
                    <Info className="size-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 text-sm" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
                <div className="space-y-1">
                    <div className="font-medium">{title}</div>
                    <div className="leading-5 text-muted-foreground">{children}</div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

function RejectReviewButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onClick}
            className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
            <X className="size-4" />
            终止本轮
        </Button>
    )
}

function StrategyReviewCard({
    disabled,
    interrupt,
    onSubmit,
    submittingDecisionType,
}: {
    disabled?: boolean
    interrupt: PendingAgentInterrupt
    onSubmit: (decision: StrategyReviewDecision) => void
    submittingDecisionType?: ReviewDecisionType | null
}) {
    const payload = interrupt.part.payload
    const [mode, setMode] = useState<'idle' | 'respond'>('idle')
    const [feedback, setFeedback] = useState('')
    const [draftStrategy, setDraftStrategy] = useState<TasklistStrategy | null>(
        payload.kind === 'strategy_review' ? payload.data.strategy : null
    )

    if (payload.kind !== 'strategy_review' || !draftStrategy) {
        return null
    }

    const strategy = payload.data.strategy
    const canRespond = payload.allowedDecisions.includes('respond')
    const isDirty = !areStrategiesEqual(draftStrategy, strategy)
    const isSubmittingStrategy = disabled && (submittingDecisionType === 'approve' || submittingDecisionType === 'edit')

    function togglePriorityFocus(option: TasklistStrategyPriorityFocus) {
        setDraftStrategy(current => {
            if (!current) {
                return current
            }

            const exists = current.priorityFocus.includes(option)

            if (exists && current.priorityFocus.length === 1) {
                return current
            }

            return {
                ...current,
                priorityFocus: exists
                    ? current.priorityFocus.filter(item => item !== option)
                    : [...current.priorityFocus, option].slice(0, priorityFocusOptions.length),
            }
        })
    }

    function submitStrategy() {
        if (isDirty) {
            onSubmit({ type: 'edit', strategy: normalizeStrategy(draftStrategy) })
            return
        }

        onSubmit({ type: 'approve' })
    }

    if (mode === 'respond') {
        return (
            <div className="space-y-3">
                <div className="space-y-1">
                    <div className="text-sm font-medium">补充策略要求</div>
                    <p className="text-xs text-muted-foreground">Agent 会基于你的反馈重新生成一次策略。</p>
                </div>
                <Textarea
                    value={feedback}
                    maxLength={2000}
                    disabled={disabled}
                    placeholder="例如，更关注前端交互和错误恢复..."
                    onChange={event => setFeedback(event.target.value)}
                    className="max-h-32 min-h-20 text-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        disabled={disabled || feedback.trim().length === 0}
                        onClick={() => onSubmit({ type: 'respond', feedback: feedback.trim() })}
                        className={primaryReviewActionClass}
                    >
                        <RotateCcw className="size-4" />
                        提交并重新生成策略
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setMode('idle')}>
                        取消
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <div className="text-sm font-medium">确认任务清单生成策略</div>
                {strategy.notes ? (
                    <ReviewInfoPopover ariaLabel="查看策略说明" title="策略说明">
                        {strategy.notes}
                    </ReviewInfoPopover>
                ) : null}
            </div>

            <div className="space-y-3">
                <ChoiceRow
                    label="拆分粒度"
                    value={draftStrategy.granularity}
                    options={granularityOptions}
                    labels={granularityLabels}
                    disabled={disabled}
                    onChange={granularity => setDraftStrategy(current => (current ? { ...current, granularity } : current))}
                />
                <ChoiceRow
                    label="步骤数量"
                    value={draftStrategy.stepCountRange}
                    options={stepCountRangeOptions}
                    labels={stepCountRangeLabels}
                    disabled={disabled}
                    onChange={stepCountRange => setDraftStrategy(current => (current ? { ...current, stepCountRange } : current))}
                />
                <ChoiceRow
                    label="组织方式"
                    value={draftStrategy.grouping}
                    options={groupingOptions}
                    labels={groupingLabels}
                    disabled={disabled}
                    onChange={grouping => setDraftStrategy(current => (current ? { ...current, grouping } : current))}
                />
                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">重点方向</div>
                    <div className="flex flex-wrap gap-2">
                        {priorityFocusOptions.map(option => (
                            <ChoiceChip
                                key={option}
                                selected={draftStrategy.priorityFocus.includes(option)}
                                disabled={disabled}
                                onClick={() => togglePriorityFocus(option)}
                            >
                                {priorityFocusLabels[option]}
                            </ChoiceChip>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    size="sm"
                    disabled={disabled || draftStrategy.priorityFocus.length === 0}
                    aria-busy={isSubmittingStrategy}
                    onClick={submitStrategy}
                    className={primaryReviewActionClass}
                >
                    {isSubmittingStrategy ? <LoaderCircle data-icon="inline-start" className="animate-spin" strokeWidth={2.2} /> : null}
                    按当前策略继续
                </Button>
                {canRespond ? (
                    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setMode('respond')}>
                        <RotateCcw className="size-4" />
                        补充要求
                    </Button>
                ) : null}
                <RejectReviewButton disabled={disabled} onClick={() => onSubmit({ type: 'reject' })} />
            </div>
        </div>
    )
}

function TasklistRevisionReviewCard({
    disabled,
    interrupt,
    onSubmit,
}: {
    disabled?: boolean
    interrupt: PendingAgentInterrupt
    onSubmit: (decision: TasklistRevisionReviewDecision) => void
}) {
    const payload = interrupt.part.payload
    const [mode, setMode] = useState<'agent' | 'edit' | 'respond'>('agent')
    const [markdown, setMarkdown] = useState(payload.kind === 'tasklist_revision_review' ? payload.data.markdown : '')
    const [feedback, setFeedback] = useState('')

    if (payload.kind !== 'tasklist_revision_review') {
        return null
    }

    const validation = payload.data.validation

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <div className="text-sm font-medium">确认 tasklist 修订</div>
                <ReviewInfoPopover ariaLabel="查看修订说明" title="修订说明">
                    最多两轮受控修订。本次确认后会占用第一轮修订预算；如果仍有需要处理的问题，第二轮会自动执行。
                </ReviewInfoPopover>
            </div>

            <div className="space-y-1">
                <p className="text-sm">检测到 {payload.data.fixNow.length} 个需要立即处理的问题。</p>
                <p className="text-xs text-muted-foreground">
                    Validation：{validationStatusLabels[validation.status]} / Score：{validation.score} / 当前版本：v{payload.data.revision}
                </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-[5rem_1fr] sm:items-center">
                <div className="text-xs font-medium text-muted-foreground">修订方式</div>
                <div className="flex flex-wrap gap-2">
                    <ChoiceChip selected={mode === 'agent'} disabled={disabled} onClick={() => setMode('agent')}>
                        让 Agent 修
                    </ChoiceChip>
                    <ChoiceChip selected={mode === 'edit'} disabled={disabled} onClick={() => setMode('edit')}>
                        <Pencil className="size-3.5" />
                        我直接编辑
                    </ChoiceChip>
                    <ChoiceChip selected={mode === 'respond'} disabled={disabled} onClick={() => setMode('respond')}>
                        <RotateCcw className="size-3.5" />
                        补充要求
                    </ChoiceChip>
                </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">需要处理</div>
                <ScrollArea className="max-h-28">
                    <ol className="list-decimal space-y-1 pl-5 pr-4 text-sm">
                        {payload.data.fixNow.map(item => (
                            <li key={item}>{item}</li>
                        ))}
                    </ol>
                </ScrollArea>
            </div>

            {mode === 'edit' ? (
                <div className="space-y-2">
                    <Textarea
                        value={markdown}
                        maxLength={100000}
                        disabled={disabled}
                        onChange={event => setMarkdown(event.target.value)}
                        className="max-h-[40vh] min-h-40 text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            disabled={disabled || markdown.trim().length === 0}
                            onClick={() => onSubmit({ type: 'edit', markdown })}
                            className={primaryReviewActionClass}
                        >
                            提交 Markdown 修订
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setMode('agent')}>
                            取消
                        </Button>
                        <RejectReviewButton disabled={disabled} onClick={() => onSubmit({ type: 'reject' })} />
                    </div>
                </div>
            ) : null}

            {mode === 'respond' ? (
                <div className="space-y-2">
                    <Textarea
                        value={feedback}
                        maxLength={2000}
                        disabled={disabled}
                        placeholder="补充你希望本次修订额外考虑的要求。"
                        onChange={event => setFeedback(event.target.value)}
                        className="max-h-32 min-h-20 text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            disabled={disabled || feedback.trim().length === 0}
                            onClick={() => onSubmit({ type: 'respond', feedback: feedback.trim() })}
                            className={primaryReviewActionClass}
                        >
                            提交修订要求
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setMode('agent')}>
                            取消
                        </Button>
                        <RejectReviewButton disabled={disabled} onClick={() => onSubmit({ type: 'reject' })} />
                    </div>
                </div>
            ) : null}

            {mode === 'agent' ? (
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        disabled={disabled}
                        onClick={() => onSubmit({ type: 'approve' })}
                        className={primaryReviewActionClass}
                    >
                        同意修订并继续
                    </Button>
                    <RejectReviewButton disabled={disabled} onClick={() => onSubmit({ type: 'reject' })} />
                </div>
            ) : null}
        </div>
    )
}

export function HumanReviewComposerPanel({
    pendingInterrupt,
    onResumeDecision,
}: {
    pendingInterrupt: PendingAgentInterrupt | null
    onResumeDecision: (decision: ReviewDecision) => Promise<boolean>
}) {
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [submittingDecisionType, setSubmittingDecisionType] = useState<ReviewDecisionType | null>(null)

    useEffect(() => {
        setError(null)
        setSubmitting(false)
        setSubmittingDecisionType(null)
    }, [pendingInterrupt?.part.interruptId])

    if (!pendingInterrupt) {
        return null
    }

    async function submitDecision(decision: ReviewDecision) {
        setSubmitting(true)
        setSubmittingDecisionType(decision.type)
        setError(null)

        try {
            await onResumeDecision(decision)
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : '提交审核决策失败。')
        } finally {
            setSubmitting(false)
            setSubmittingDecisionType(null)
        }
    }

    return (
        <Card className="mb-3 overflow-hidden rounded-2xl border-border/70 bg-background/95 py-0 shadow-xl shadow-black/[0.06]">
            <ScrollArea className="max-h-[50vh]">
                <CardContent className="space-y-4 px-5 py-5">
                    {pendingInterrupt.part.interruptKind === 'strategy_review' ? (
                        <StrategyReviewCard
                            key={pendingInterrupt.part.interruptId}
                            interrupt={pendingInterrupt}
                            disabled={submitting}
                            onSubmit={submitDecision}
                            submittingDecisionType={submittingDecisionType}
                        />
                    ) : (
                        <TasklistRevisionReviewCard
                            key={pendingInterrupt.part.interruptId}
                            interrupt={pendingInterrupt}
                            disabled={submitting}
                            onSubmit={submitDecision}
                        />
                    )}

                    {error ? (
                        <Alert variant="destructive" className="rounded-xl border-destructive/15 bg-destructive/5">
                            <CircleAlert className="size-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : null}
                </CardContent>
            </ScrollArea>
        </Card>
    )
}
