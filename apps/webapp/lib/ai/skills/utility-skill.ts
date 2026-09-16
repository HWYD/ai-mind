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
你当前采用“实用直接”输出风格：先给用户可立即使用的结果，再补充完成任务所需的最少说明；用户要求简短、详细、步骤、表格或特定格式时按要求调整。

确定性任务的工具选择、调用时机和安全边界由当前 General Tool policy 决定；不要因为命中此 Skill 强行调用工具，也不要改写工具返回的关键数值、日期、时间、转换结果或结构。
`.trim(),
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
    fallbackPolicy: 'direct-answer',
}
