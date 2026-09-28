import {
    BrainCircuit,
    Calculator,
    CalendarDays,
    Car,
    FileSearch,
    FileText,
    GitBranchPlus,
    Globe,
    ImagePlus,
    ListChecks,
    type LucideIcon,
    MapPin,
    Network,
    Puzzle,
    Search,
    ShieldCheck,
} from 'lucide-react'

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

export const generalReActDemoSuggestion: EmptyStateSuggestion = {
    icon: BrainCircuit,
    tag: 'ReAct Agent',
    label: '搜索并总结最新资料',
    description: 'Agent 先搜索公开网页拿到候选来源，再自主读取一篇正文，最后综合多轮工具反馈提炼结论。',
    text: '帮我搜下广州体育西路附近有哪些必吃的茶餐厅，再查从体育西地铁站步行过去要多久',
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
    id: 'demo:scenario:register-login/requirement.md',
    type: 'resource',
    label: '注册登录系统',
    uri: 'demo://scenarios/register-login/requirement.md',
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

export const tasklistDemoSuggestion: EmptyStateSuggestion = {
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
}

export const deliveryChainDemoSuggestion: EmptyStateSuggestion = {
    composer: {
        plainText: '',
        command: { name: 'delivery-chain', label: '生成交付计划' },
        references: [deliveryChainScenarioReference],
    },
    displaySegments: [
        { type: 'command', command: { name: 'delivery-chain', label: '生成交付计划' } },
        { type: 'text', text: ' ' },
        { type: 'resource', reference: deliveryChainScenarioReference },
    ],
    icon: GitBranchPlus,
    tag: 'Agent',
    label: '注册与登录交付计划',
    description: '快速填入 public demo 的注册与登录交付计划示例。',
    text: '',
}

export const imageGenerationDemoSuggestion: EmptyStateSuggestion = {
    composer: {
        plainText: '阳光正好，一只橘猫在沙滩上睡懒觉。',
        command: { name: 'image', label: '生成图片' },
    },
    displaySegments: [
        { type: 'command', command: { name: 'image', label: '生成图片' } },
        { type: 'text', text: ' 阳光正好，一只橘猫在沙滩上睡懒觉。' },
    ],
    icon: ImagePlus,
    tag: 'Image Agent',
    label: 'AI 图像生成 Demo',
    description: '快速填充图片生成示例，直接进入受控 Image Agent 链路。',
    text: '阳光正好，一只橘猫在沙滩上睡懒觉。',
}

export const emptyStateSuggestions: EmptyStateSuggestion[] = [
    // {
    //     icon: Layers3,
    //     tag: '问答',
    //     label: '理解 Runtime 分层',
    //     description: '解释 AI 应用 Runtime、Skill、MCP、Tool 的边界。',
    //     text: '解释一个 AI 应用里 Runtime、Skill、MCP、Tool 是怎么分层的？',
    // },
    generalReActDemoSuggestion,
    tasklistDemoSuggestion,
    deliveryChainDemoSuggestion,
    imageGenerationDemoSuggestion,
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
    // {
    //     composer: {
    //         plainText: '检查这份边界说明是否清晰',
    //         command: { name: 'check', label: '检查文档一致性' },
    //         references: [deliveryBoundaryReference],
    //     },
    //     displaySegments: [
    //         { type: 'command', command: { name: 'check', label: '检查文档一致性' } },
    //         { type: 'text', text: ' ' },
    //         { type: 'resource', reference: deliveryBoundaryReference },
    //     ],
    //     icon: ShieldCheck,
    //     tag: '检查',
    //     label: '检查资源边界',
    //     description: '基于公开 demo 的边界说明做轻量检查。',
    //     text: '检查这份边界说明是否清晰',
    // },
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

// ---- 空状态精选问题（大卡片展示） ----

export interface FeaturedQuestion {
    icon: LucideIcon
    text: string
}

/**
 * 空状态首屏展示的 3 个精选推荐问题，覆盖三类典型场景：
 * 1. 搜索 + 网页读取（信息检索类）
 * 2. 地图位置查询（高德 MCP 位置类）
 * 3. 路线规划（高德 MCP 出行类）
 */
export const featuredQuestions: FeaturedQuestion[] = [
    {
        icon: Search,
        text: '搜索「AI Agent 的 Tool Calling 与 MCP 区别」并总结最新的几篇资料',
    },
    {
        icon: MapPin,
        text: '帮我搜下广州体育西路附近有哪些必吃的茶餐厅，给出探店攻略',
    },
    {
        icon: Car,
        text: '帮我搜索整理一份北京旅游攻略，再查从广州开车到北京大概需要多久',
    },
]

// ---- 空状态能力标签 ----

export interface CapabilityTag {
    icon: LucideIcon
    label: string
}

/**
 * 空状态标题下方展示的能力标签行，
 * 用极简方式传达 Agent 当前具备的核心能力。
 */
export const capabilityTags: CapabilityTag[] = [
    { icon: BrainCircuit, label: 'ReAct Agent' },
    { icon: Globe, label: 'Web Search' },
    { icon: FileText, label: '网页读取' },
    { icon: Puzzle, label: 'MCP' },
]
