import { extractTasklistStructure } from './extract-tasklist-structure'
import { parseTasklistMarkdown } from './parse-tasklist-markdown'
import { validateTasklistStructureRules } from './tasklist-structure-rules'
import type { TasklistStructure, TasklistValidationResult, ValidateTasklistStructureInput } from './tasklist-structure-types'
import { validateTasklistStructureInputSchema } from './tasklist-structure-types'

export interface ValidateTasklistStructureDetail {
    result: TasklistValidationResult
    structure: TasklistStructure
}

/**
 * 执行完整的 tasklist 结构校验链路，并返回结构提取详情，方便单测或后续 Agent 调试使用。
 */
export function validateTasklistStructureWithDetail(input: ValidateTasklistStructureInput): ValidateTasklistStructureDetail {
    const parsedInput = validateTasklistStructureInputSchema.parse(input)
    const ast = parseTasklistMarkdown(parsedInput.draftText)
    const structure = extractTasklistStructure(ast, {
        planUri: parsedInput.planUri,
    })

    return {
        result: validateTasklistStructureRules(structure),
        structure,
    }
}

/**
 * 对外暴露的确定性校验入口，只返回 Agent / Tool 需要消费的规则结果。
 */
export function validateTasklistStructure(input: ValidateTasklistStructureInput): TasklistValidationResult {
    return validateTasklistStructureWithDetail(input).result
}
