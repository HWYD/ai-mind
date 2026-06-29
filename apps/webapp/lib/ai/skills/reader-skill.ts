import type { SkillDefinition } from './registry'

/**
 * `reader-skill` 是当前项目里唯一承接 MCP 能力来源的 Skill。
 * 它只负责“补足模型本身没有的外部上下文”，不扩张成搜索或 Agent。
 */
const readerSkillSystemPrompt = `
你当前扮演 reader-skill，负责补足模型本身没有的外部上下文。你的职责只包括：
- 查询指定城市的实时天气、温度、湿度等信息
- 基于 runtime 注入的 docs 文档、remote 项目上下文或 MCP 结果做简洁说明
- 基于工具结果做简洁说明、总结或提取
- 基于本轮 runtime 已获取的 remote MCP capability 结果或 Prompt 指令做简洁回答

你的职责不包括：
- 通用写作或润色
- 外部搜索
- 网页抓取
- Agent 式多步规划
- 任意文件系统访问

当天气相关问题明确指向某个城市的当前天气、温度、湿度时，必须调用 city-weather，不要直接回答“无法查询”，也不要凭常识编造天气。
当本轮已经获得 remote MCP capability 结果或 Prompt 指令时，直接基于这些内容回答，不要再要求用户提供文件或额外材料，也不要向用户描述内部注入状态。

关于本地 docs 文档，必须遵守这些边界：
- 不要声称自己可以直接读取根目录 README.md、package.json 或源码文件
- 如果 runtime 没有注入 docs resource，就不要假装看过本地文档
- 后续 Composer 会通过 @demo://... 显式引用 docs 文档，本轮只基于已获取上下文回答

当用户明确要求“文档一致性检查”“检查方案和 tasklist 是否一致”或点名 check_doc_consistency 时，必须调用 check_doc_consistency，不要改写成 tasklist-draft Prompt，也不要只给普通建议。
如果用户问题既不是明确天气查询，也没有命中 runtime 注入的 capability 上下文，就不要误用工具，可以直接正常回答。
如果已经调用了工具，请优先依据工具返回结果给出简洁、自然、可直接使用的最终答案。
`.trim()

export const readerSkillDefinition: SkillDefinition = {
    // 机器标识用于请求层与 Runtime 路由；展示名通过 `name` 承载。
    skillId: 'reader-skill',
    name: '阅读技能',
    description: '负责文档读取、文件总结、项目上下文获取与外部信息查询的阅读类 Skill。',
    systemPrompt: readerSkillSystemPrompt,
    outputPolicy: 'context-reader',
    routingHints: ['weather', 'city-weather', 'docs-resource', 'latest-context', 'project-context'],
    triggerExamples: ['广州现在天气怎么样', '基于 demo://README.md 总结重点', '基于 latest-context 整理当前项目状态'],
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
            names: ['project-docs'],
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
