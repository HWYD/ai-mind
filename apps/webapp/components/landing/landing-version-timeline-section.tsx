import { Bot, Box, Globe, Lightbulb, type LucideIcon, MessageCircle, Network, Wrench } from 'lucide-react'

import { cn } from '@/lib/utils'

import { LandingSectionHeader } from './landing-section-header'

const toneClassNames = {
    brand: {
        badge: 'bg-[var(--landing-brand-soft)] text-[var(--landing-brand)]',
        iconWrap: 'bg-[var(--landing-brand-soft)] text-[var(--landing-brand)]',
        dot: 'bg-slate-300 ring-slate-100',
        card: 'border-border',
    },
    violet: {
        badge: 'bg-[var(--landing-brand-soft)] text-[var(--landing-brand)]',
        iconWrap: 'bg-slate-50 text-slate-500',
        dot: 'bg-slate-300 ring-slate-100',
        card: 'border-border',
    },
    resource: {
        badge: 'bg-[var(--landing-brand-soft)] text-[var(--landing-brand)]',
        iconWrap: 'bg-teal-50 text-teal-600',
        dot: 'bg-slate-300 ring-slate-100',
        card: 'border-border',
    },
    runtime: {
        badge: 'bg-[var(--landing-brand-soft)] text-[var(--landing-brand)]',
        iconWrap: 'bg-amber-50 text-amber-600',
        dot: 'bg-slate-300 ring-slate-100',
        card: 'border-border',
    },
    current: {
        badge: 'bg-[var(--landing-brand-soft)] text-[var(--landing-brand)] ring-1 ring-[var(--landing-brand-border)]',
        iconWrap: 'bg-[var(--landing-brand-soft)] text-[var(--landing-brand)]',
        dot: 'bg-[var(--landing-brand)] ring-[var(--landing-brand-soft)]',
        card: 'border-[var(--landing-brand-border)]',
    },
    online: {
        badge: 'bg-cyan-50 text-cyan-700',
        iconWrap: 'bg-cyan-50 text-cyan-600',
        dot: 'bg-cyan-500 ring-cyan-50',
        card: 'border-border',
    },
}

const versionTagClassName = 'rounded-lg bg-muted/60 px-3 py-1 text-xs leading-5 font-medium break-words text-muted-foreground sm:text-sm'

const versionMilestones = [
    {
        version: 'v0.0.5',
        title: '基础 AI Chat',
        description: '完成基础对话链路，打通页面输入、服务端请求与模型响应展示。',
        tags: ['Chat', 'Streaming', 'Baseline'],
        icon: MessageCircle,
        tone: 'brand',
    },
    {
        version: 'v0.0.8',
        title: 'Skill / Tool 能力',
        description: '开始将对话能力拆成更明确的任务入口，让 AI 可以触发受控能力。',
        tags: ['Skill', 'Tool', 'Runtime'],
        icon: Wrench,
        tone: 'violet',
    },
    {
        version: 'v0.0.9',
        title: 'MCP Host MVP',
        description: '接入 MCP Server，支持受控工具调用和资源读取，并处理边界、超时与适配层。',
        tags: ['MCP', 'Resource', 'Adapter'],
        icon: Network,
        tone: 'resource',
    },
    {
        version: 'v0.0.10',
        title: 'Chat Runtime + Stream Core',
        description: '收口聊天运行时，将稳定的流式协议能力沉淀为内部 workspace 包。',
        tags: ['Runtime', 'Stream Core', 'NDJSON'],
        icon: Box,
        tone: 'runtime',
    },
    {
        version: 'v0.1.1',
        title: 'Controlled Planner Lite',
        description: '在固定入口和有限动作内引入受控规划，让 Agent 执行过程可解释、可降级。',
        tags: ['Agent', 'Planner', 'Review'],
        icon: Bot,
        tone: 'current',
    },
    {
        version: 'Online',
        title: '官网与体验页',
        description: '通过官网、体验页、GitHub 和技术文章集中展示项目能力与演进过程。',
        tags: ['Landing', 'Experience', 'Articles'],
        icon: Globe,
        tone: 'online',
    },
] satisfies Array<{
    version: string
    title: string
    description: string
    tags: [string, string, string]
    icon: LucideIcon
    tone: keyof typeof toneClassNames
}>

export function VersionTimelineSection() {
    return (
        <section id="versions" className="scroll-mt-24 bg-background py-16 lg:py-24">
            <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
                <LandingSectionHeader title="版本演进" description="从基础对话到 MCP 与 Agent，AI Mind 沿着关键版本持续沉淀工程能力。" />

                <div className="relative mx-auto mt-12 max-w-6xl">
                    <div className="absolute top-6 bottom-6 left-4 w-px bg-border sm:left-5" aria-hidden="true" />
                    <div className="space-y-4">
                        {versionMilestones.map(milestone => (
                            <VersionTimelineItem key={milestone.version} milestone={milestone} />
                        ))}
                    </div>
                </div>

                <p className="mx-auto mt-8 flex max-w-3xl items-start justify-center gap-2 text-center text-sm leading-6 text-muted-foreground sm:items-center sm:text-base">
                    <Lightbulb className="mt-0.5 size-5 shrink-0 text-[var(--landing-brand)] sm:mt-0" strokeWidth={2.2} />
                    <span className="min-w-0 break-words">以上为关键演进节点，更多实现细节可在 GitHub 源码与技术文章中查看。</span>
                </p>
            </div>
        </section>
    )
}

function VersionTimelineItem({ milestone }: { milestone: (typeof versionMilestones)[number] }) {
    const Icon = milestone.icon
    const tone = toneClassNames[milestone.tone]

    return (
        <div data-version-milestone className="relative flex min-w-0 gap-3 sm:gap-5">
            <div className="relative z-10 flex w-8 shrink-0 justify-center pt-6 sm:w-10">
                <span
                    className={cn(
                        'size-4 rounded-full border-4 border-background shadow-sm ring-4 ring-muted',
                        tone.dot,
                        milestone.tone === 'current' ? 'size-5 ring-blue-100' : ''
                    )}
                />
            </div>

            <article className={cn('min-w-0 flex-1 rounded-2xl border bg-card p-5 shadow-sm', tone.card)}>
                <div className="min-w-0 lg:flex lg:items-center lg:gap-6">
                    <div className="flex min-w-0 items-center gap-3 lg:shrink-0">
                        <span
                            className={cn(
                                'flex size-10 shrink-0 items-center justify-center rounded-xl border border-border sm:size-11 lg:order-2 lg:size-12',
                                tone.iconWrap
                            )}
                        >
                            <Icon className="size-5 lg:size-6" strokeWidth={2.2} />
                        </span>
                        <span
                            className={cn(
                                'inline-flex h-7 w-fit max-w-full shrink-0 items-center rounded-lg px-3 font-mono text-xs font-semibold break-words lg:order-1 lg:h-auto lg:py-1.5 lg:text-sm',
                                tone.badge
                            )}
                        >
                            {milestone.version}
                        </span>
                    </div>

                    <div className="min-w-0 flex-1">
                        <h3 className="mt-5 break-words text-xl leading-7 font-semibold tracking-tight text-foreground lg:mt-0 lg:text-2xl">
                            {milestone.title}
                        </h3>
                        <p className="mt-3 break-words text-base leading-7 text-muted-foreground lg:mt-2">{milestone.description}</p>
                    </div>

                    <div className="mt-4 flex min-w-0 flex-wrap gap-2 lg:mt-0 lg:w-[320px] lg:shrink-0 lg:justify-end xl:w-[340px]">
                        {milestone.tags.map(tag => (
                            <span key={tag} data-version-tag className={versionTagClassName}>
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </article>
        </div>
    )
}
