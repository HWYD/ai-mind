import type { SkillDefinition } from './registry'

/**
 * `reader-skill` 是当前项目里唯一承接 MCP 能力来源的 Skill。
 * 它只负责“补足模型本身没有的外部上下文”，不扩张成搜索或 Agent。
 */
const readerSkillSystemPrompt = `
你当前扮演 reader-skill，负责补足模型本身没有的外部上下文。你的职责只包括：
- 查询指定城市的实时天气、温度、湿度等信息
- 读取项目根目录下的文本文件
- 基于工具结果做简洁说明、总结或提取
- 基于本轮 runtime 已获取的 remote MCP capability 结果或 Prompt 指令做简洁回答

你的职责不包括：
- 通用写作或润色
- 外部搜索
- 网页抓取
- Agent 式多步规划
- 任意文件系统访问

当天气相关问题明确指向某个城市的当前天气、温度、湿度时，优先调用 city-weather。
当用户明确要求读取、查看、总结、提取某个项目根目录文本文件时，优先调用 local-text-read。
当本轮已经获得 remote MCP capability 结果或 Prompt 指令时，直接基于这些内容回答，不要再要求用户提供文件或额外材料，也不要向用户描述内部注入状态。

关于 local-text-read，必须遵守这些边界：
- 只读取项目根目录的直接文本文件
- 输入参数尽量只传文件名，例如 README.md、package.json
- 不要猜测不存在的文件
- 不要生成子目录路径、绝对路径或 ../

如果用户问题既不是明确天气查询，也不是明确文件读取，就不要误用工具，可以直接正常回答。
如果已经调用了工具，请优先依据工具返回结果给出简洁、自然、可直接使用的最终答案。
`.trim()

export const readerSkillDefinition: SkillDefinition = {
    // 机器标识用于请求层与 Runtime 路由；展示名通过 `name` 承载。
    skillId: 'reader-skill',
    name: '阅读技能',
    description: '负责文档读取、文件总结、项目上下文获取与外部信息查询的阅读类 Skill。',
    systemPrompt: readerSkillSystemPrompt,
    allowedTools: ['city-weather', 'local-text-read'],
    outputPolicy: 'context-reader',
    routingHints: ['weather', 'city-weather', 'read-file', 'readme', 'package-json', 'local-file'],
    triggerExamples: ['广州现在天气怎么样', '读取 README.md 并总结重点', '基于 latest-context 整理当前项目状态'],
    sourceKinds: ['mcp'],
    capabilitySelectors: [
        {
            providerKind: 'mcp',
            location: 'local',
            capabilityType: 'tool',
            names: ['city-weather'],
        },
        {
            providerKind: 'mcp',
            location: 'local',
            capabilityType: 'resource',
            names: ['local-text-read'],
        },
        {
            providerKind: 'mcp',
            location: 'local',
            capabilityType: 'prompt',
            names: ['local-file-summary'],
        },
        {
            providerKind: 'mcp',
            location: 'remote',
            serverId: 'project-assistant-service',
            capabilityType: 'resource',
        },
        {
            providerKind: 'mcp',
            location: 'remote',
            serverId: 'project-assistant-service',
            capabilityType: 'prompt',
        },
        {
            providerKind: 'mcp',
            location: 'remote',
            serverId: 'project-assistant-service',
            capabilityType: 'tool',
        },
    ],
    fallbackPolicy: 'direct-answer',
}
