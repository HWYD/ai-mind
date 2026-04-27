import type { SkillDefinition } from './registry'

/**
 * `utility-skill`：承接“确定性实用任务”的默认能力面。
 * 重点是工具优先（计算、时间、文本转换、单位换算），并保证普通问答仍可直答。
 */
export const utilitySkillDefinition: SkillDefinition = {
    skillId: 'utility-skill',
    name: '实用技能',
    description: '处理日常确定性实用任务的稳定能力层，优先使用可用工具完成精确计算、时间处理、文本转换和单位换算。',
    systemPrompt: `
你当前工作在 utility-skill 模式下。
你的任务是优先处理日常确定性实用任务，同时保持普通开放式问答也能自然回答。

请严格遵守下面规则：
1. 对于精确计算、日期时间、文本转换、单位换算这类任务，优先调用工具，不要为了展示推理过程而绕开工具。
2. 对于普通开放式问题、概念解释、观点表达和一般讨论，直接自然回答，不要因为启用了 Skill 就强行调用工具。
3. 如果工具已经返回确定性结果，优先给最终结果，再补一句必要说明即可，不要重复展开冗长推导。
4. 回答风格保持简洁、直接、实用，优先解决问题，不要堆砌过程性废话。
5. 不要为了显得“聪明”而改写工具返回的关键数值、日期、时间或转换结果。
6. 如果用户在问相对日期或时间偏移，例如“明天”“后天”“几天后”“下周一”“两小时后”，必须优先调用 datetime，不要自己根据上下文脑补结果。
7. 如果用户继续追问上一轮日期或时间结果，例如“那明天呢”“后天是星期几”“再过三天呢”，也必须优先调用 datetime，不要直接口算。
8. 如果用户要求格式化 JSON、提取链接、提取代码块或把 Markdown 转成纯文本，必须优先调用 text-transform，不要手工模拟转换结果。
9. 如果用户要求单位换算，例如长度、重量、温度换算，必须优先调用 unit-convert，不要手工换算。
10. 如果用户要求精确数值计算，必须优先调用 calculator，不要先自己口算再决定是否调工具。
`.trim(),
    allowedTools: ['calculator', 'datetime', 'text-transform', 'unit-convert'],
    outputPolicy: 'concise-utility',
    resultPolicy: 'tool-first',
    routingHints: [
        'math',
        'date',
        'time',
        'weekday',
        'relative-date',
        'convert',
        'markdown-to-text',
        'extract-links',
        'json-format',
        'unit-conversion',
    ],
    triggerExamples: ['357x28+999 等于多少', '明天是星期几', '把 markdown 转成纯文本', '180 cm 等于多少 m'],
    sourceKinds: ['internal'],
    capabilitySelectors: [
        {
            providerKind: 'internal',
            location: 'local',
            capabilityType: 'tool',
            names: ['calculator', 'datetime', 'text-transform', 'unit-convert'],
        },
    ],
    fallbackPolicy: 'direct-answer',
}
