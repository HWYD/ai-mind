import {
    ArrowDown,
    Box,
    Code2,
    ListMinus,
    type LucideIcon,
    MessageCircle,
    Monitor,
    Network,
    PanelsTopLeft,
    Puzzle,
    Radio,
    Server,
    ServerCog,
    Workflow,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import { LandingSectionHeader } from './landing-section-header'

const toneClassNames = {
    page: {
        iconWrap: 'bg-blue-50 text-blue-600',
        label: 'text-blue-600',
        nodeBorder: 'border-l-blue-200',
    },
    service: {
        iconWrap: 'bg-teal-50 text-teal-700',
        label: 'text-teal-700',
        nodeBorder: 'border-l-teal-200',
    },
    runtime: {
        iconWrap: 'bg-indigo-50 text-indigo-600',
        label: 'text-indigo-600',
        nodeBorder: 'border-l-indigo-200',
    },
    protocol: {
        iconWrap: 'bg-cyan-50 text-cyan-600',
        label: 'text-cyan-600',
        nodeBorder: 'border-l-cyan-200',
    },
}

const runtimeFlowNodes = [
    { label: 'Chat Page', icon: PanelsTopLeft, tone: 'page' },
    { label: 'Chat UI / Hooks', icon: MessageCircle, tone: 'page' },
    { label: 'Next.js Route', icon: Network, tone: 'service' },
    { label: 'Chat Service Facade', icon: Server, tone: 'service' },
    { label: 'Chat Runtime', icon: Box, tone: 'runtime' },
    { label: 'Skill / Tool / MCP / Agent', icon: Puzzle, tone: 'runtime' },
    { label: 'Stream Core', icon: ListMinus, tone: 'protocol' },
    { label: 'NDJSON Streaming Response', icon: Code2, tone: 'protocol' },
] satisfies Array<{
    label: string
    icon: LucideIcon
    tone: keyof typeof toneClassNames
}>

const architectureLayers = [
    {
        title: '页面层',
        label: 'Page Layer',
        description: '负责页面组装、输入交互、消息展示、滚动控制与资源面板呈现。',
        icon: Monitor,
        tone: 'page',
    },
    {
        title: '服务层',
        label: 'Service Layer',
        description: '通过 Next.js Route 与 Chat Service Facade 收口请求入口，隔离页面与运行时细节。',
        icon: ServerCog,
        tone: 'service',
    },
    {
        title: '运行时层',
        label: 'Runtime Layer',
        description: '编排会话、Skill、Tool、MCP 与 Agent 流程，承接核心任务执行。',
        icon: Workflow,
        tone: 'runtime',
    },
    {
        title: '协议层',
        label: 'Protocol Layer',
        description: '由 Stream Core 输出结构化 NDJSON 片段，让前端稳定消费文本、工具与资源事件。',
        icon: Radio,
        tone: 'protocol',
    },
] satisfies Array<{
    title: string
    label: string
    description: string
    icon: LucideIcon
    tone: keyof typeof toneClassNames
}>

export function ArchitectureSection() {
    return (
        <section id="architecture" className="scroll-mt-24 bg-background py-16 lg:py-24">
            <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
                <LandingSectionHeader title="工程架构" description="从交互页面到协议响应，拆出清晰可维护的 AI 应用运行链路。" />

                <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
                    <RuntimeFlowCard />
                    <LayerResponsibilitiesCard />
                </div>
            </div>
        </section>
    )
}

function RuntimeFlowCard() {
    return (
        <article className="w-full min-w-0 rounded-3xl border border-border bg-card p-6 shadow-sm lg:p-8">
            <SectionCardHeader title="运行链路" description="Request → Runtime → Stream" />

            <div className="mt-6">
                {runtimeFlowNodes.map((node, index) => (
                    <div key={node.label}>
                        <RuntimeFlowNode node={node} />
                        {index < runtimeFlowNodes.length - 1 ? (
                            <div className="flex h-5 items-center justify-center text-muted-foreground" aria-hidden="true">
                                <ArrowDown className="size-4" strokeWidth={2.1} />
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
        </article>
    )
}

function RuntimeFlowNode({ node }: { node: (typeof runtimeFlowNodes)[number] }) {
    const Icon = node.icon
    const tone = toneClassNames[node.tone]

    return (
        <div
            data-runtime-flow-node
            className={cn(
                'flex min-h-14 min-w-0 items-center gap-4 rounded-2xl border border-l-2 border-border bg-background px-4 py-3',
                tone.nodeBorder
            )}
        >
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tone.iconWrap)}>
                <Icon className="size-5" strokeWidth={2.3} />
            </span>
            <span className="min-w-0 break-words text-base leading-6 font-semibold text-foreground sm:text-lg">{node.label}</span>
        </div>
    )
}

function LayerResponsibilitiesCard() {
    return (
        <article className="flex w-full min-w-0 flex-col rounded-3xl border border-border bg-card p-6 shadow-sm lg:p-8">
            <SectionCardHeader title="分层职责说明" description="Page / Service / Runtime / Protocol" />

            <div className="mt-6 grid flex-1 gap-4 lg:grid-rows-4">
                {architectureLayers.map(layer => (
                    <LayerResponsibilityItem key={layer.title} layer={layer} />
                ))}
            </div>
        </article>
    )
}

function LayerResponsibilityItem({ layer }: { layer: (typeof architectureLayers)[number] }) {
    const Icon = layer.icon
    const tone = toneClassNames[layer.tone]

    return (
        <div
            data-architecture-layer
            className="flex h-full min-w-0 flex-col gap-4 rounded-2xl border border-border bg-background p-5 sm:flex-row sm:items-center sm:gap-5"
        >
            <span className={cn('flex size-16 shrink-0 items-center justify-center rounded-full sm:size-20', tone.iconWrap)}>
                <Icon className="size-8 sm:size-9" strokeWidth={2.2} />
            </span>

            <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-2xl leading-8 font-semibold tracking-tight text-foreground">{layer.title}</h3>
                    <span className={cn('break-words text-sm leading-6 font-semibold sm:text-base', tone.label)}>{layer.label}</span>
                </div>
                <p className="mt-3 break-words text-base leading-7 text-muted-foreground sm:leading-8">{layer.description}</p>
            </div>
        </div>
    )
}

function SectionCardHeader({ title, description }: { title: string; description: string }) {
    return (
        <header>
            <h3 className="text-2xl leading-8 font-semibold tracking-tight text-foreground">{title}</h3>
            <p className="mt-2 break-words text-base leading-7 text-muted-foreground sm:text-lg">{description}</p>
        </header>
    )
}
