import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import type { ChatToolDefinition, ToolDisplayConfig } from './registry'
import {
    type TasklistValidationResult,
    tasklistValidationResultSchema,
    validateTasklistStructure,
    validateTasklistStructureInputSchema,
} from './tasklist-structure'

const PREVIEW_LENGTH = 120

/**
 * 压缩草稿预览，避免 Tool 卡片输入区域展示过长 Markdown。
 */
function truncatePreview(text: string) {
    const normalizedText = text.replace(/\s+/g, ' ').trim()

    if (normalizedText.length <= PREVIEW_LENGTH) {
        return normalizedText
    }

    return `${normalizedText.slice(0, PREVIEW_LENGTH)}...`
}

/**
 * 将结构化校验结果转成可读文本，供 ToolMessage 和 tool-end 卡片展示。
 */
function formatValidationSummary(result: TasklistValidationResult) {
    const lines = [
        `状态：${result.status}`,
        `评分：${result.score}`,
        `阻塞问题：${result.blockingIssues.length} 个`,
        `弱项：${result.weakSections.length} 个`,
    ]

    if (result.blockingIssues.length > 0) {
        lines.push('', '阻塞问题：', ...result.blockingIssues.map(issue => `- ${issue.message} 建议：${issue.suggestion}`))
    }

    if (result.weakSections.length > 0) {
        lines.push(
            '',
            '弱项：',
            ...result.weakSections.map(section => `- ${section.section}：${section.issue} 建议：${section.suggestion}`)
        )
    }

    return lines.join('\n')
}

// Tool 本体只做确定性结构校验，不调用模型，也不写入文件。
export const validateTasklistStructureTool = tool(async input => validateTasklistStructure(input), {
    name: 'validate_tasklist_structure',
    description: '对 tasklist Markdown 草稿做确定性结构校验，检查标题、来源方案 URI、Step、Checklist、验证计划、执行纪律和风险等结构项。',
    schema: validateTasklistStructureInputSchema,
})

/**
 * 格式化工具输入摘要，展示 planUri、目标版本和草稿片段，避免泄露完整长文。
 */
export function formatValidateTasklistStructureToolInput(args: unknown): string {
    const parsedArgs = validateTasklistStructureInputSchema.safeParse(args)

    if (!parsedArgs.success) {
        return JSON.stringify(args ?? {}, null, 2)
    }

    return [
        `planUri=${parsedArgs.data.planUri}`,
        `targetVersion=${parsedArgs.data.targetVersion ?? 'unknown'}`,
        `draft=${truncatePreview(parsedArgs.data.draftText)}`,
    ].join(', ')
}

/**
 * 格式化工具输出；如果结果不是预期 schema，就退回 JSON，避免展示层抛错。
 */
export function formatValidateTasklistStructureToolOutput(result: unknown): string {
    const parsedResult = tasklistValidationResultSchema.safeParse(result)

    if (!parsedResult.success) {
        return JSON.stringify(result ?? {}, null, 2)
    }

    return formatValidationSummary(parsedResult.data)
}

/**
 * 生成 tool part 展示元信息，让前端明确这是一次 tasklist 结构校验动作。
 */
function getValidateTasklistStructureDisplayConfig(args: unknown): ToolDisplayConfig {
    const parsedArgs = validateTasklistStructureInputSchema.safeParse(args)

    return {
        title: 'validate_tasklist_structure',
        action: 'validate',
        inputPreview: parsedArgs.success ? parsedArgs.data.planUri : undefined,
    }
}

export const validateTasklistStructureToolDefinition: ChatToolDefinition<z.infer<typeof validateTasklistStructureInputSchema>> = {
    name: 'validate_tasklist_structure',
    tool: validateTasklistStructureTool,
    schema: validateTasklistStructureInputSchema,
    formatInput: formatValidateTasklistStructureToolInput,
    formatOutput: formatValidateTasklistStructureToolOutput,
    getDisplayConfig: getValidateTasklistStructureDisplayConfig,
}
