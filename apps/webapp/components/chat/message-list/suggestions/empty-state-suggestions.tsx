'use client'

import { ArrowRight, ChevronDown, Database, FileText, ListChecks, Network, ShieldCheck, UserCheck, Users } from 'lucide-react'
import { type ReactNode, useId, useState, useSyncExternalStore } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Separator } from '@/components/ui/separator'

import { deliveryChainDemoSuggestion, type EmptyStateSuggestion, tasklistDemoSuggestion } from './empty-state-suggestion-options'
import { FollowUpSuggestions } from './follow-up-suggestions'

const tasklistSteps = [
    { icon: FileText, label: '读取方案' },
    { icon: UserCheck, label: '人工确认' },
    { icon: ListChecks, label: '生成草稿' },
    { icon: ShieldCheck, label: '结构校验' },
] as const

const memorySteps = ['发送“记住我喜欢吃桃子。”', '新建或切换对话。', '发送“给我推荐几种水果。”']
const finePointerQuery = '(hover: hover) and (pointer: fine)'
const desktopRecommendationQuery = '(min-width: 768px)'
const desktopRecommendationSeed = `empty-state-desktop-${Math.random().toString(36).slice(2)}`

function subscribeToMediaQuery(mediaQueryText: string, onStoreChange: () => void) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined
    }

    const mediaQuery = window.matchMedia(mediaQueryText)
    mediaQuery.addEventListener('change', onStoreChange)

    return () => mediaQuery.removeEventListener('change', onStoreChange)
}

function getMediaQueryPreference(mediaQueryText: string) {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(mediaQueryText).matches
}

function useMediaQueryPreference(mediaQueryText: string) {
    return useSyncExternalStore(
        onStoreChange => subscribeToMediaQuery(mediaQueryText, onStoreChange),
        () => getMediaQueryPreference(mediaQueryText),
        () => false
    )
}

function useSupportsFinePointer() {
    return useMediaQueryPreference(finePointerQuery)
}

function useSupportsDesktopRecommendations() {
    return useMediaQueryPreference(desktopRecommendationQuery)
}

function CaseIcon({ children, tone = 'agent' }: { children: ReactNode; tone?: 'agent' | 'memory' }) {
    return (
        <span
            className={
                tone === 'memory'
                    ? 'hidden size-12 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600 ring-1 ring-violet-200/80 md:inline-flex'
                    : 'hidden size-12 shrink-0 items-center justify-center rounded-full bg-[var(--composer-focus-soft)] text-[var(--composer-focus)] ring-1 ring-[var(--composer-focus-border)] md:inline-flex'
            }
        >
            {children}
        </span>
    )
}

function MemoryExperienceSteps({ withTitle = false, withHint = false }: { withTitle?: boolean; withHint?: boolean }) {
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-violet-200/80 bg-violet-50/55 p-3">
            {withTitle ? <h4 className="text-sm font-medium text-foreground">体验跨对话偏好记忆</h4> : null}
            <ol className="flex flex-col gap-2 text-sm leading-5 text-foreground">
                {memorySteps.map((step, index) => (
                    <li key={step} className="flex min-w-0 items-start gap-2">
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-medium text-violet-700">
                            {index + 1}
                        </span>
                        <span className="min-w-0 break-words">{step}</span>
                    </li>
                ))}
            </ol>
            {withHint ? <p className="text-xs leading-5 text-muted-foreground">请在同一浏览器不同会话内完成体验。</p> : null}
        </div>
    )
}

function ExecutableCardOverlay({ ariaLabel, disabled, onClick }: { ariaLabel: string; disabled?: boolean; onClick: () => void }) {
    return (
        <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={ariaLabel}
            onClick={onClick}
            className="absolute inset-0 h-auto w-auto cursor-pointer rounded-2xl border-0 bg-transparent p-0 hover:bg-transparent active:translate-y-0"
        />
    )
}

export function EmptyStateSuggestions({
    disabled,
    onSelectQuestion,
    onSelectSuggestion,
}: {
    disabled?: boolean
    onSelectQuestion: (question: string) => void
    onSelectSuggestion: (suggestion: EmptyStateSuggestion) => void
}) {
    const [memoryStepsOpen, setMemoryStepsOpen] = useState(false)
    const [memoryHoverCardOpen, setMemoryHoverCardOpen] = useState(false)
    const memoryStepsId = `memory-experience-steps-${useId().replace(/:/g, '')}`
    const supportsFinePointer = useSupportsFinePointer()
    const supportsDesktopRecommendations = useSupportsDesktopRecommendations()

    return (
        <section className="mx-auto flex w-full max-w-[var(--chat-content-column-width)] flex-col items-center text-center md:pt-8">
            <div className="max-w-3xl">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">试试这些能力</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                    选择一个场景，查看执行过程、控制边界与最终产物。
                </p>
            </div>

            <div className="mt-7 grid w-full gap-4 text-left">
                <article aria-labelledby="tasklist-case-title" className="min-w-0">
                    <Card
                        data-disabled={disabled || undefined}
                        className="group/executable relative cursor-pointer gap-0 rounded-2xl border border-[var(--composer-focus-border)] bg-[var(--composer-focus-soft)]/45 py-0 shadow-xs ring-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--composer-focus)] hover:shadow-sm active:translate-y-0 has-[button:focus-visible]:border-[var(--composer-focus)] has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:translate-y-0 data-[disabled]:hover:shadow-xs"
                    >
                        <CardHeader className="p-4 sm:p-5">
                            <div className="flex min-w-0 items-start gap-3">
                                <CaseIcon>
                                    <Network className="size-6" strokeWidth={1.9} aria-hidden="true" />
                                </CaseIcon>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-start md:gap-0">
                                        <Badge
                                            variant="outline"
                                            className="rounded-full border-[var(--composer-chip-border)] bg-[var(--composer-chip-bg)] text-[color-mix(in_oklch,var(--composer-focus)_68%,black)]"
                                        >
                                            Agent
                                        </Badge>
                                        <CardTitle className="text-sm font-semibold leading-tight md:mt-2 md:text-base">
                                            <h3 id="tasklist-case-title">受控任务规划</h3>
                                        </CardTitle>
                                    </div>
                                    <p className="mt-2 text-xs leading-5 text-muted-foreground md:text-[13px]">
                                        读取显式引用的版本方案，人工确认策略后生成 Tasklist 草稿，并完成结构校验。
                                    </p>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
                            <div className="hidden" aria-label="受控任务规划流程">
                                {tasklistSteps.map(({ label }, index) => (
                                    <span key={label} className="inline-flex items-center gap-1">
                                        {label}
                                        {index < tasklistSteps.length - 1 ? (
                                            <span aria-hidden="true" className="text-muted-foreground">
                                                →
                                            </span>
                                        ) : null}
                                    </span>
                                ))}
                            </div>

                            <div
                                className="hidden min-w-0 grid-cols-2 gap-2 md:grid lg:grid-cols-4 lg:gap-x-7"
                                aria-label="受控任务规划流程"
                            >
                                {tasklistSteps.map(({ icon: Icon, label }, index) => (
                                    <div key={label} className="relative min-w-0">
                                        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-background/80 px-2.5 py-2.5">
                                            <Icon
                                                className="size-4 shrink-0 text-[var(--composer-focus)]"
                                                strokeWidth={2}
                                                aria-hidden="true"
                                            />
                                            <span className="min-w-0 break-words text-xs leading-4 text-foreground">{label}</span>
                                        </div>
                                        {index < tasklistSteps.length - 1 ? (
                                            <ArrowRight
                                                className="absolute top-1/2 -right-[19px] hidden size-4 -translate-y-1/2 text-muted-foreground lg:block"
                                                strokeWidth={1.8}
                                                aria-hidden="true"
                                            />
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                        <Separator className="hidden bg-border/60 md:block" />
                        <CardFooter className="flex w-full flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                            <p className="hidden min-w-0 break-words text-xs leading-5 text-muted-foreground md:block md:text-[13px] md:text-foreground/80">
                                LangGraph · HITL Checkpoint · 最多两轮修订
                            </p>
                            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--composer-focus)]">
                                运行示例
                                <ArrowRight
                                    className="size-4 transition-transform group-hover/executable:translate-x-0.5"
                                    aria-hidden="true"
                                />
                            </span>
                        </CardFooter>
                        <ExecutableCardOverlay
                            ariaLabel="运行受控任务规划示例"
                            disabled={disabled}
                            onClick={() => onSelectSuggestion(tasklistDemoSuggestion)}
                        />
                    </Card>
                </article>

                <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                    <article aria-labelledby="delivery-case-title" className="min-w-0">
                        <Card
                            data-disabled={disabled || undefined}
                            className="group/executable relative cursor-pointer gap-0 rounded-2xl border border-border/70 bg-card py-0 shadow-xs ring-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--composer-focus-border)] hover:shadow-sm active:translate-y-0 has-[button:focus-visible]:border-[var(--composer-focus)] has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:translate-y-0 data-[disabled]:hover:shadow-xs md:min-h-[236px]"
                        >
                            <CardHeader className="flex min-w-0 flex-row items-start gap-3 p-4 sm:p-5">
                                <CaseIcon>
                                    <Users className="size-6" strokeWidth={1.9} aria-hidden="true" />
                                </CaseIcon>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-start md:gap-0">
                                        <Badge
                                            variant="outline"
                                            className="rounded-full border-[var(--composer-chip-border)] bg-[var(--composer-chip-bg)] text-[color-mix(in_oklch,var(--composer-focus)_68%,black)]"
                                        >
                                            Multi-Agent
                                        </Badge>
                                        <CardTitle className="text-sm font-semibold leading-tight md:mt-2 md:text-base">
                                            <h3 id="delivery-case-title">设计注册登录系统</h3>
                                        </CardTitle>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-0 sm:p-5 sm:pt-0">
                                <p className="break-words text-xs leading-5 text-muted-foreground md:text-[13px]">
                                    从用户流程到接口、安全和测试，生成注册登录系统的实施方案与任务拆解。
                                </p>
                            </CardContent>
                            <Separator className="hidden bg-border/60 md:block" />
                            <CardFooter className="flex w-full flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                                <p className="hidden min-w-0 break-words text-xs leading-5 text-muted-foreground md:block md:text-[13px] md:text-foreground/80">
                                    Agent-as-Tool · 3 个评审 subAgent · 结构化
                                </p>
                                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--composer-focus)]">
                                    运行示例
                                    <ArrowRight
                                        className="size-4 transition-transform group-hover/executable:translate-x-0.5"
                                        aria-hidden="true"
                                    />
                                </span>
                            </CardFooter>
                            <ExecutableCardOverlay
                                ariaLabel="运行注册登录系统示例"
                                disabled={disabled}
                                onClick={() => onSelectSuggestion(deliveryChainDemoSuggestion)}
                            />
                        </Card>
                    </article>

                    <article aria-labelledby="memory-case-title" className="min-w-0">
                        <Card className="group/memory cursor-pointer gap-0 rounded-2xl border border-border/70 bg-card py-0 shadow-xs ring-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-sm active:translate-y-0 md:min-h-[236px]">
                            <CardHeader className="flex min-w-0 flex-row items-start gap-3 p-4 sm:p-5">
                                <CaseIcon tone="memory">
                                    <Database className="size-6" strokeWidth={1.9} aria-hidden="true" />
                                </CaseIcon>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-start md:gap-0">
                                        <Badge variant="outline" className="rounded-full border-violet-200 bg-violet-50 text-violet-700">
                                            Memory
                                        </Badge>
                                        <CardTitle className="text-sm font-semibold leading-tight md:mt-2 md:text-base">
                                            <h3 id="memory-case-title">跨对话偏好记忆</h3>
                                        </CardTitle>
                                    </div>
                                </div>
                            </CardHeader>
                            <Collapsible open={memoryStepsOpen} onOpenChange={setMemoryStepsOpen} className="flex flex-1 flex-col">
                                <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-0 sm:p-5 sm:pt-0">
                                    <p className="break-words text-xs leading-5 text-muted-foreground md:text-[13px]">
                                        在同一浏览器会话保存稳定偏好；切换对话后，用不同措辞验证向量语义召回。
                                    </p>
                                </CardContent>
                                <Separator className="hidden bg-border/60 md:block" />
                                <CardFooter className="flex w-full flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                                    <p className="hidden min-w-0 break-words text-xs leading-5 text-muted-foreground md:block md:text-[13px] md:text-foreground/80">
                                        UserMemory · PostgresStore · 向量检索
                                    </p>
                                    {supportsFinePointer ? (
                                        <HoverCard
                                            open={memoryHoverCardOpen}
                                            onOpenChange={setMemoryHoverCardOpen}
                                            openDelay={200}
                                            closeDelay={200}
                                        >
                                            <HoverCardTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={disabled}
                                                    aria-label="查看跨对话偏好记忆体验步骤"
                                                    onClick={() => setMemoryHoverCardOpen(current => !current)}
                                                    className="w-fit shrink-0 justify-start text-[var(--composer-focus)] hover:bg-[var(--composer-focus-soft)] hover:text-[var(--composer-focus)]"
                                                >
                                                    查看步骤
                                                    <ArrowRight
                                                        data-icon="inline-end"
                                                        aria-hidden="true"
                                                        className="transition-transform group-hover/memory:translate-x-0.5"
                                                    />
                                                </Button>
                                            </HoverCardTrigger>
                                            <HoverCardContent
                                                side="top"
                                                align="end"
                                                sideOffset={8}
                                                className="w-[min(21rem,calc(100vw-2rem))] border border-border p-3"
                                            >
                                                <MemoryExperienceSteps withTitle withHint />
                                            </HoverCardContent>
                                        </HoverCard>
                                    ) : (
                                        <CollapsibleTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                disabled={disabled}
                                                aria-controls={memoryStepsId}
                                                className="w-fit shrink-0 justify-start text-[var(--composer-focus)] hover:bg-[var(--composer-focus-soft)] hover:text-[var(--composer-focus)]"
                                            >
                                                查看体验步骤
                                                <ChevronDown
                                                    data-icon="inline-end"
                                                    aria-hidden="true"
                                                    className={memoryStepsOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
                                                />
                                            </Button>
                                        </CollapsibleTrigger>
                                    )}
                                </CardFooter>
                                {!supportsFinePointer ? (
                                    <CollapsibleContent
                                        id={memoryStepsId}
                                        aria-label="跨对话偏好记忆体验步骤"
                                        className="px-4 pb-4 sm:px-5 sm:pb-5"
                                    >
                                        <MemoryExperienceSteps />
                                    </CollapsibleContent>
                                ) : null}
                            </Collapsible>
                        </Card>
                    </article>

                    {supportsDesktopRecommendations ? (
                        <div role="group" aria-label="推荐问题" className="hidden min-w-0 md:block">
                            <FollowUpSuggestions seed={desktopRecommendationSeed} className="mt-0" onSelectQuestion={onSelectQuestion} />
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    )
}
