import { Calculator, CalendarDays, FileSearch, Layers3, ListChecks, type LucideIcon, Network } from 'lucide-react'

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

const readmeReference = {
    id: 'docs:README.md',
    type: 'resource',
    label: 'docs/README.md',
    uri: 'docs://README.md',
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

const capabilitySurfaceReference = {
    id: 'docs:architecture/capability-skill-surface.md',
    type: 'resource',
    label: 'docs/architecture/capability-skill-surface.md',
    uri: 'docs://architecture/capability-skill-surface.md',
    source: 'local',
} as const

export const emptyStateSuggestions: EmptyStateSuggestion[] = [
    {
        icon: Layers3,
        tag: '问答',
        label: '理解 Runtime 分层',
        description: '解释 AI 应用 Runtime、Skill、MCP、Tool 的边界。',
        text: '解释一下 AI 应用 Runtime、Skill、MCP、Tool 是怎么分层的',
    },
    // {
    //     icon: Layers3,
    //     tag: '问答',
    //     label: '理解 Runtime 分层',
    //     description: '解释 AI Mind 当前 Runtime、Skill、MCP 的边界。',
    //     text: '解释一下 AI Mind 当前 Runtime 是怎么分层的',
    // },
    {
        icon: Calculator,
        tag: '工具',
        label: '验证计算工具',
        description: '触发 calculator，查看 Tool Calling 展示。',
        text: '357×28+999 等于多少',
    },
    {
        icon: CalendarDays,
        tag: '工具',
        label: '查询日期时间',
        description: '触发 datetime，检查日期类工具链路。',
        text: '今天是星期几',
    },
    {
        composer: {
            plainText: '总结文档',
            command: { name: 'summary', label: '总结文档' },
            references: [readmeReference],
        },
        displaySegments: [
            { type: 'command', command: { name: 'summary', label: '总结文档' } },
            { type: 'text', text: ' ' },
            { type: 'resource', reference: readmeReference },
        ],
        icon: FileSearch,
        tag: '读取',
        label: '总结 README',
        description: '读取 docs/README.md，并注入本地摘要 Prompt。',
        text: '总结文档',
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
    {
        composer: {
            plainText: '检查文档一致性',
            command: { name: 'check', label: '检查文档一致性' },
            references: [capabilitySurfaceReference],
        },
        displaySegments: [
            { type: 'command', command: { name: 'check', label: '检查文档一致性' } },
            { type: 'text', text: ' ' },
            { type: 'resource', reference: capabilitySurfaceReference },
        ],
        icon: ListChecks,
        tag: '检查',
        label: '检查能力文档',
        description: '基于 capability/skill 文档做轻量一致性检查。',
        text: '检查文档一致性',
    },
]
