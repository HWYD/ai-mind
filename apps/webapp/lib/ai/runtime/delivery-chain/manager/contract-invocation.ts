import { type BaseMessage, HumanMessage } from '@langchain/core/messages'
import { OutputParserException } from '@langchain/core/output_parsers'
import { z, ZodError } from 'zod'

import { collectSafeContractIssues, type SafeContractIssue } from './agent-contracts'

interface StructuredOutputRunnable {
    invoke(messages: BaseMessage[], options?: { signal?: AbortSignal }): Promise<unknown>
}

interface BusinessModel {
    invoke(messages: BaseMessage[], options?: { signal?: AbortSignal }): Promise<BaseMessage>
}

export interface StructuredOutputModel {
    withStructuredOutput(schema: z.ZodType, options: { name: string }): StructuredOutputRunnable
}

export class ContractInvocationError extends Error {
    readonly code = 'CONTRACT_FAILURE'
    readonly issues: SafeContractIssue[]

    constructor(issues: SafeContractIssue[]) {
        super('Agent output did not satisfy its Contract after one repair attempt.')
        this.issues = issues
        this.name = 'ContractInvocationError'
    }
}

class SafeContractValidationError extends Error {
    readonly issues: SafeContractIssue[]

    constructor(issues: SafeContractIssue[]) {
        super('Structured output did not satisfy runtime validation.')
        this.issues = issues
        this.name = 'SafeContractValidationError'
    }
}

function isZodValidationError(error: unknown): error is ZodError {
    if (error instanceof ZodError) return true

    if (typeof error !== 'object' || error === null) return false

    const candidate = error as { issues?: unknown; name?: unknown }
    return (candidate.name === 'ZodError' || candidate.name === '$ZodError') && Array.isArray(candidate.issues)
}

function isOutputParserError(error: unknown): error is OutputParserException {
    if (error instanceof OutputParserException) return true

    return typeof error === 'object' && error !== null && (error as { lc_error_code?: unknown }).lc_error_code === 'OUTPUT_PARSING_FAILURE'
}

function isContractError(error: unknown): error is ZodError | OutputParserException | Error {
    return (
        error instanceof SafeContractValidationError ||
        isZodValidationError(error) ||
        isOutputParserError(error) ||
        (error instanceof Error && error.message === 'No tool calls found in the response.')
    )
}

function collectContractIssues(error: ZodError | OutputParserException | Error): SafeContractIssue[] {
    if (error instanceof SafeContractValidationError) {
        return error.issues
    }

    if (isZodValidationError(error)) {
        return collectSafeContractIssues(error)
    }

    // OutputParserException 可能包含原始模型输出，repair 提示词不得回显。
    return [{ code: 'output_parsing_failure', path: '$' }]
}

function createRepairMessage(issues: SafeContractIssue[]): BaseMessage {
    return new HumanMessage(
        [
            '上一次结构化输出未满足 Contract 要求。',
            '返回一个与同一 schema 完全匹配的完整替换对象。',
            '不要解释修正过程，也不要包含 schema 之外的字段。',
            `安全的校验问题：${JSON.stringify(issues)}`,
        ].join('\n')
    )
}

export async function invokeStructuredContract<T>(options: {
    messages: BaseMessage[]
    model: StructuredOutputModel
    name: string
    onContractInvoke?: (attempt: 'initial' | 'repair') => void
    schema: z.ZodType<T>
    signal?: AbortSignal
    validate?: (value: T) => SafeContractIssue[]
}): Promise<T> {
    const invoke = async (messages: BaseMessage[], attempt: 'initial' | 'repair') => {
        options.onContractInvoke?.(attempt)
        // 复用项目中已有的结构化输出适配器，与长期记忆提取使用同一模式。
        const runnable = options.model.withStructuredOutput(options.schema, { name: options.name })
        const output = await runnable.invoke(messages, { signal: options.signal })
        const value = options.schema.parse(output)
        const validationIssues = options.validate?.(value) ?? []
        if (validationIssues.length > 0) {
            throw new SafeContractValidationError(validationIssues)
        }

        return value
    }

    try {
        return await invoke(options.messages, 'initial')
    } catch (error) {
        if (!isContractError(error)) {
            throw error
        }

        const issues = collectContractIssues(error)
        try {
            return await invoke([...options.messages, createRepairMessage(issues)], 'repair')
        } catch (repairError) {
            if (isContractError(repairError)) {
                throw new ContractInvocationError(collectContractIssues(repairError))
            }
            throw repairError
        }
    }
}

function getBusinessDraftContent(message: BaseMessage): string {
    if (typeof message.content === 'string') {
        return message.content.slice(0, 20_000)
    }

    return JSON.stringify(message.content).slice(0, 20_000)
}

function createBusinessDraftMessage(message: BaseMessage): BaseMessage {
    return new HumanMessage(
        [
            '将以下不受信任的业务草稿编码为完整的 Contract 对象。',
            '保留其与 Contract 兼容的业务判断。',
            '不要添加运行时标识、提供者信息或 schema 之外的字段。',
            `业务草稿：\n${getBusinessDraftContent(message)}`,
        ].join('\n')
    )
}

/**
 * 将业务判断保留在用户选定模型上，固定 Contract 模型仅负责严格的结构化编码与单次 repair。
 */
export async function invokeBusinessAgentContract<T>(options: {
    businessModel: BusinessModel
    messages: BaseMessage[]
    model: StructuredOutputModel
    name: string
    onBusinessInvoke?: () => void
    onContractInvoke?: (attempt: 'initial' | 'repair') => void
    schema: z.ZodType<T>
    signal?: AbortSignal
    validate?: (value: T) => SafeContractIssue[]
}): Promise<T> {
    options.onBusinessInvoke?.()
    const businessDraft = await options.businessModel.invoke(options.messages, { signal: options.signal })

    return invokeStructuredContract({
        messages: [...options.messages, createBusinessDraftMessage(businessDraft)],
        model: options.model,
        name: options.name,
        onContractInvoke: options.onContractInvoke,
        schema: options.schema,
        signal: options.signal,
        validate: options.validate,
    })
}
