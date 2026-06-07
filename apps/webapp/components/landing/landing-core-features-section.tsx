import { Activity, Bot, GitBranch, Layers3, type LucideIcon, Network, Wrench } from 'lucide-react'

import { cn } from '@/lib/utils'

import { LandingSectionHeader } from './landing-section-header'

const toneClassNames = {
    brand: {
        iconWrap: 'bg-[var(--landing-brand-soft)] text-[var(--landing-brand)]',
    },
    resource: {
        iconWrap: 'bg-[var(--landing-resource-soft)] text-[var(--landing-resource)]',
    },
    brandViolet: {
        iconWrap: 'bg-indigo-50 text-indigo-600',
    },
    orange: {
        iconWrap: 'bg-orange-50 text-orange-600',
    },
    violet: {
        iconWrap: 'bg-violet-50 text-violet-600',
    },
    cyan: {
        iconWrap: 'bg-cyan-50 text-cyan-600',
    },
}

const coreFeatures = [
    {
        title: '流式协议',
        description: '基于结构化 streaming parts 承载文本、推理、工具与资源事件，让前端稳定消费 AI 输出过程。',
        tags: ['Streaming', 'NDJSON', 'Events'],
        icon: Activity,
        tone: 'brand',
    },
    {
        title: '资源与上下文管理',
        description: '通过 Resource 引用、MCP 资源读取和上下文边界控制，让模型获取资料时更可控。',
        tags: ['Resource', 'MCP', 'Context'],
        icon: Network,
        tone: 'resource',
    },
    {
        title: 'Skill / Tool 体系',
        description: '将任务能力拆成 Skill 与 Tool，让对话不只停留在问答，而是可以触发受控能力。',
        tags: ['Skill', 'Tool Calling', 'Runtime'],
        icon: Wrench,
        tone: 'brandViolet',
    },
    {
        title: 'Agent 运行时',
        description: '围绕受控规划、任务生成、结构校验和人工复核，构建可解释的 Agent 执行流程。',
        tags: ['Agent', 'Planner', 'Review'],
        icon: Bot,
        tone: 'orange',
    },
    {
        title: '可观测性与追踪',
        description: '通过 Agent Trace、Tool Trace 和状态标签，记录关键步骤、耗时、结果与异常分支。',
        tags: ['Trace', 'Status', 'Logs'],
        icon: GitBranch,
        tone: 'violet',
    },
    {
        title: '可扩展架构',
        description: '将页面、运行时、工具、MCP 和流式协议分层拆分，为后续能力扩展留下边界。',
        tags: ['Runtime', 'MCP', 'Extensible'],
        icon: Layers3,
        tone: 'cyan',
    },
] satisfies Array<{
    title: string
    description: string
    tags: [string, string, string]
    icon: LucideIcon
    tone: keyof typeof toneClassNames
}>

export function CoreFeaturesSection() {
    return (
        <section id="features" className="scroll-mt-24 bg-background py-16 lg:py-24">
            <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
                <LandingSectionHeader title="核心能力" description="围绕 AI 应用运行时，拆解出可复用、可观测、可扩展的工程能力。" />

                <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {coreFeatures.map(feature => (
                        <FeatureCard key={feature.title} feature={feature} />
                    ))}
                </div>
            </div>
        </section>
    )
}

function FeatureCard({ feature }: { feature: (typeof coreFeatures)[number] }) {
    const Icon = feature.icon

    return (
        <article className="min-w-0 rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-[var(--landing-brand-border)] hover:bg-muted/20 lg:p-7">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
                <div className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl', toneClassNames[feature.tone].iconWrap)}>
                    <Icon className="size-7" strokeWidth={2.3} />
                </div>

                <div className="min-w-0">
                    <h3 className="text-xl leading-7 font-semibold tracking-tight text-foreground lg:text-2xl">{feature.title}</h3>
                    <p className="mt-5 break-words text-base leading-8 text-muted-foreground lg:text-lg">{feature.description}</p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        {feature.tags.map(tag => (
                            <span
                                key={tag}
                                className="rounded-lg border border-border bg-muted/50 px-3 py-1 text-sm font-medium break-words text-foreground/80"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </article>
    )
}
