import { Calculator, CalendarDays, FileSearch, GitBranchPlus, ListChecks, type LucideIcon, Network, ShieldCheck } from 'lucide-react'

import type { ChatComposerDisplaySegment, ChatComposerPayload } from '@/lib/ai/types/chat'

export interface EmptyStateSuggestion {
    composer?: ChatComposerPayload
    description: string
    displaySegments?: ChatComposerDisplaySegment[]
    icon: LucideIcon
    label: string
    tag: string
    text: string
}

const demoReadmeReference = {
    id: 'demo:README.md',
    type: 'resource',
    label: 'README.md',
    uri: 'demo://README.md',
    source: 'local',
} as const

const tasklistDemoReference = {
    id: 'demo:version-plans:v034-langsmith-observability.md',
    type: 'resource',
    label: 'v034-langsmith-observability.md',
    uri: 'demo://version-plans/v034-langsmith-observability.md',
    source: 'local',
} as const

const deliveryChainScenarioReference = {
    id: 'demo:scenario:request-limit-banner/requirement.md',
    type: 'resource',
    label: 'request-limit-banner/requirement.md',
    uri: 'demo://scenarios/request-limit-banner/requirement.md',
    source: 'local',
} as const

const deliveryBoundaryReference = {
    id: 'demo:governance:delivery-boundaries.md',
    type: 'resource',
    label: 'governance/delivery-boundaries.md',
    uri: 'demo://governance/delivery-boundaries.md',
    source: 'local',
} as const

const latestContextReference = {
    id: 'remote:project-assistant-service:latest-context',
    type: 'resource',
    label: 'latest-context',
    uri: 'project://latest-context',
    source: 'remote',
    serverId: 'project-assistant-service',
} as const

export const emptyStateSuggestions: EmptyStateSuggestion[] = [
    // {
    //     icon: Layers3,
    //     tag: '问答',
    //     label: '理解 Runtime 分层',
    //     description: '解释 AI 应用 Runtime、Skill、MCP、Tool 的边界。',
    //     text: '解释一个 AI 应用里 Runtime、Skill、MCP、Tool 是怎么分层的？',
    // },
    {
        composer: {
            plainText: '基于这个 demo 版本方案生成 tasklist 草稿',
            command: { name: 'tasklist', label: '生成任务清单' },
            references: [tasklistDemoReference],
        },
        displaySegments: [
            { type: 'command', command: { name: 'tasklist', label: '生成任务清单' } },
            { type: 'text', text: ' ' },
            { type: 'resource', reference: tasklistDemoReference },
            { type: 'text', text: ' 基于这个 demo 版本方案生成 tasklist 草稿' },
        ],
        icon: ListChecks,
        tag: 'Agent',
        label: 'Tasklist Agent Demo',
        description: '快速填入 public demo 的 Tasklist Agent 示例入口。',
        text: '基于这个 demo 版本方案生成 tasklist 草稿',
    },
    {
        composer: {
            plainText: '基于这个 demo scenario 生成交付计划报告',
            command: { name: 'delivery-chain', label: '生成交付计划' },
            references: [deliveryChainScenarioReference],
        },
        displaySegments: [
            { type: 'command', command: { name: 'delivery-chain', label: '生成交付计划' } },
            { type: 'text', text: ' ' },
            { type: 'resource', reference: deliveryChainScenarioReference },
            { type: 'text', text: ' 基于这个 demo scenario 生成交付计划报告' },
        ],
        icon: GitBranchPlus,
        tag: 'Agent',
        label: 'Delivery Chain Demo',
        description: '快速填入 public demo 的交付计划示例入口。',
        text: '基于这个 demo scenario 生成交付计划报告',
    },
    {
        composer: {
            plainText: '总结这份 demo 说明',
            command: { name: 'summary', label: '总结文档' },
            references: [demoReadmeReference],
        },
        displaySegments: [
            { type: 'command', command: { name: 'summary', label: '总结文档' } },
            { type: 'text', text: ' ' },
            { type: 'resource', reference: demoReadmeReference },
        ],
        icon: FileSearch,
        tag: 'MCP',
        label: '总结 Demo README',
        description: '读取 local MCP 的说明，并注入本地摘要 Prompt。',
        text: '总结这份 demo 说明',
    },
    {
        icon: Calculator,
        tag: '工具',
        label: '验证计算工具',
        description: '触发 calculator，查看 Tool Calling 展示。',
        text: '357×28+999 等于多少？',
    },
    {
        icon: CalendarDays,
        tag: '工具',
        label: '查询日期时间',
        description: '触发 datetime，检查日期类工具链路。',
        text: '今天是星期几？',
    },
    {
        composer: {
            plainText: '检查这份边界说明是否清晰',
            command: { name: 'check', label: '检查文档一致性' },
            references: [deliveryBoundaryReference],
        },
        displaySegments: [
            { type: 'command', command: { name: 'check', label: '检查文档一致性' } },
            { type: 'text', text: ' ' },
            { type: 'resource', reference: deliveryBoundaryReference },
        ],
        icon: ShieldCheck,
        tag: '检查',
        label: '检查资源边界',
        description: '基于公开 demo 的边界说明做轻量检查。',
        text: '检查这份边界说明是否清晰',
    },
    {
        composer: {
            plainText: '总结当前项目状态',
            command: { name: 'summary', label: '总结文档' },
            references: [latestContextReference],
        },
        displaySegments: [
            { type: 'command', command: { name: 'summary', label: '总结文档' } },
            { type: 'text', text: ' 总结当前项目状态 ' },
            { type: 'resource', reference: latestContextReference },
        ],
        icon: Network,
        tag: 'MCP',
        label: '读取项目上下文',
        description: '读取 remote MCP 的项目上下文 mock。',
        text: '总结当前项目状态',
    },
]
