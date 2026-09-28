'use client'

import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

import { capabilityTags, type EmptyStateSuggestion, featuredQuestions } from './empty-state-suggestion-options'

/**
 * 精选问题卡片——空状态首屏的核心视觉元素。
 * 左侧大图标 + 问题文字 + 右侧箭头，整卡可点击。
 */
function FeaturedQuestionCard({
    icon: Icon,
    text,
    disabled,
    onClick,
}: {
    icon: (props: { className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }) => ReactNode
    text: string
    disabled?: boolean
    onClick: () => void
}) {
    return (
        <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={onClick}
            aria-label={text}
            className="group/card relative h-auto w-full cursor-pointer items-center gap-4 rounded-2xl border border-border/40 bg-muted/30 p-4 text-left text-foreground shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--composer-focus-border)] hover:bg-[var(--composer-focus-soft)]/40 hover:shadow-sm active:translate-y-0 sm:p-5"
        >
            {/* 左侧图标块 */}
            <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--composer-focus-soft)] text-[var(--composer-focus)] ring-1 ring-[var(--composer-focus-border)] sm:size-12"
                aria-hidden="true"
            >
                <Icon className="size-5 sm:size-6" strokeWidth={1.9} />
            </span>

            {/* 中间问题文字 */}
            <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-medium leading-snug sm:text-base">{text}</span>
            </span>

            {/* 右侧箭头 */}
            <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover/card:translate-x-0.5 group-hover/card:text-[var(--composer-focus)] sm:size-5"
                strokeWidth={2}
                aria-hidden="true"
            />
        </Button>
    )
}

/**
 * 能力标签胶囊——标题下方展示 Agent 具备的核心能力。
 */
function CapabilityPill({
    icon: Icon,
    label,
}: {
    icon: (props: { className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }) => ReactNode
    label: string
}) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1.5 text-xs font-medium text-foreground/80 sm:text-sm">
            <Icon className="size-3.5 text-[var(--composer-focus)] sm:size-4" strokeWidth={2} aria-hidden={true} />
            {label}
        </span>
    )
}

export function EmptyStateSuggestions({
    disabled,
    onSelectQuestion,
    onSelectSuggestion: _onSelectSuggestion,
}: {
    disabled?: boolean
    onSelectQuestion: (question: string) => void
    onSelectSuggestion?: (suggestion: EmptyStateSuggestion) => void
}) {
    return (
        <section className="flex flex-1 min-h-[60vh] w-full flex-col items-center justify-center text-center" aria-label="推荐问题">
            {/* 标题区 */}
            <div className="max-w-2xl">
                <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">你可以这样开始</h2>
                <p className="mt-3 md:mt-5 text-sm leading-6 text-muted-foreground sm:text-base">
                    选择一个问题，体验 Agent 如何搜索资料、读取网页并调用工具完成任务。
                </p>
            </div>

            {/* 能力标签行 */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2" role="list" aria-label="Agent 能力标签">
                {capabilityTags.map((tag, index) => (
                    <div key={tag.label} className="flex items-center gap-3" role="listitem">
                        <CapabilityPill icon={tag.icon} label={tag.label} />
                        {index < capabilityTags.length - 1 ? (
                            <span className="hidden text-muted-foreground/40 sm:inline" aria-hidden="true">
                                ·
                            </span>
                        ) : null}
                    </div>
                ))}
            </div>

            {/* 精选问题卡片列表 */}
            <div className="mt-8 flex w-full flex-col gap-3 text-left sm:gap-4">
                {featuredQuestions.map(question => (
                    <FeaturedQuestionCard
                        key={question.text}
                        icon={question.icon}
                        text={question.text}
                        disabled={disabled}
                        onClick={() => onSelectQuestion(question.text)}
                    />
                ))}
            </div>
        </section>
    )
}
