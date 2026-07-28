import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { tool, type ToolRuntime } from '@langchain/core/tools'

import type { NormalizedProviderError } from '@/lib/ai/model-provider'
import { logProviderError } from '@/lib/ai/model-provider'
import { getMessageContentText } from '@/lib/ai/runtime/message-content'
import type { ChatToolDefinition } from '@/lib/ai/tools'

import {
    type SubagentToolCallInput,
    subagentToolCallInputSchema,
    subagentToolIds,
    type SubagentToolInput,
    subagentToolJsonResultSchema,
} from './subagent-tool-schemas'
import type {
    DeliveryChainSubagentToolDefinition,
    RuntimeArtifactKind,
    SubagentToolDefinition,
    SubagentToolId,
    SubagentToolJsonResult,
} from './types'

interface CreateDeliveryChainSubagentToolsOptions {
    model: BaseChatModel
    models?: Partial<Record<SubagentToolId, SubagentModelStage>>
    normalizeError?: (error: unknown) => NormalizedProviderError
    resolveInvocationInput?: (options: { invocationId: string; subagentId: SubagentToolId }) => SubagentToolInput | null
}

interface SubagentModelStage {
    model: BaseChatModel
    normalizeError?: (error: unknown) => NormalizedProviderError
    timeoutMs?: number
}

interface SubagentToolExecutionOptions {
    signal?: AbortSignal
}

type ExecuteSubagentTool = (input: SubagentToolInput, options: SubagentToolExecutionOptions) => Promise<SubagentToolJsonResult>

const DELIVERY_CHAIN_SUBAGENT_DEFINITIONS: Record<SubagentToolId, Omit<SubagentToolDefinition, 'id'>> = {
    'boundary-subagent': {
        allowedContextKinds: ['requirement', 'context', 'governance', 'rubric', 'user-note'],
        allowedTools: [],
        description: '检查 plan/tasks 是否触碰持久化、人工审批、流协议、工具注册等边界约束。',
        displayName: 'Boundary Subagent',
        inputArtifactKinds: ['plan', 'tasks'],
        nonGoals: ['不写代码', '不修改 plan/tasks', '不做源码级 code review', '不调用 Tasklist Agent'],
        outputArtifactKinds: ['review'],
        roleInstruction: '你负责检查方案和任务是否触碰项目边界约束。',
    },
    'plan-subagent': {
        allowedContextKinds: ['requirement', 'context', 'governance', 'rubric', 'user-note'],
        allowedTools: [],
        description: '根据需求、上下文和治理约束生成受控实施方案。',
        displayName: 'Plan Subagent',
        inputArtifactKinds: [],
        nonGoals: ['不写代码', '不做任务拆解', '不做最终用户输出', '不调用 Tasklist Agent'],
        outputArtifactKinds: ['plan'],
        roleInstruction: '你负责把 requirement、上下文、治理边界和 rubric 收口为受控 plan。',
    },
    'review-subagent': {
        allowedContextKinds: ['requirement', 'context', 'governance', 'rubric', 'user-note'],
        allowedTools: [],
        description: '基于 plan 和 tasks artifacts 生成受控交付评审。',
        displayName: 'Review Subagent',
        inputArtifactKinds: ['plan', 'tasks'],
        nonGoals: ['不写代码', '不修改 plan/tasks', '不做源码级 code review', '不调用 Tasklist Agent'],
        outputArtifactKinds: ['review'],
        roleInstruction: '你负责基于 plan 和 tasks 判断覆盖度、一致性和范围漂移。',
    },
    'risk-subagent': {
        allowedContextKinds: ['requirement', 'context', 'governance', 'rubric', 'user-note'],
        allowedTools: [],
        description: '专门做风险评审，检查实现复杂度、测试覆盖、维护成本等风险。',
        displayName: 'Risk Subagent',
        inputArtifactKinds: ['plan', 'tasks'],
        nonGoals: ['不写代码', '不修改 plan/tasks', '不做源码级 code review', '不调用 Tasklist Agent'],
        outputArtifactKinds: ['review'],
        roleInstruction: '你负责评估方案和任务的风险等级并给出缓解建议。',
    },
    'task-subagent': {
        allowedContextKinds: ['requirement', 'context', 'governance', 'rubric', 'user-note'],
        allowedTools: [],
        description: '消费 plan artifact 并生成受控任务拆解。',
        displayName: 'Task Subagent',
        inputArtifactKinds: ['plan'],
        nonGoals: ['不写代码', '不触发 HITL', '不调用 Tasklist Agent', '不输出最终报告'],
        outputArtifactKinds: ['tasks'],
        roleInstruction: '你负责把 plan artifact 落成可执行任务拆解和验收相关任务。',
    },
}

function formatContextBlocks(contextBlocks: SubagentToolInput['contextBlocks']) {
    return contextBlocks.map(block => `### ${block.title}\n\n${block.markdown}`).join('\n\n')
}

function formatInputArtifacts(inputArtifacts: SubagentToolInput['inputArtifacts']) {
    if (inputArtifacts.length === 0) {
        return '无'
    }

    return inputArtifacts
        .map(artifact => [`### ${artifact.title}`, `- kind: ${artifact.kind}`, '', artifact.markdown].join('\n'))
        .join('\n\n')
}

function createStageFallbackText(title: string) {
    return `## ${title}\n\n- 当前阶段未返回有效内容，请人工补充。`
}

function createReviewStageFallbackText() {
    return ['结论: needs_changes', '', createStageFallbackText('交付评审')].join('\n')
}

async function runWithStageTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, parentSignal?: AbortSignal, timeoutMs?: number) {
    if (!timeoutMs) {
        return operation(parentSignal ?? new AbortController().signal)
    }

    if (parentSignal?.aborted) {
        throw parentSignal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
    }

    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let rejectAbort: ((reason?: unknown) => void) | undefined
    const abortPromise = new Promise<never>((_, reject) => {
        rejectAbort = reject
    })
    const onAbort = () => {
        const reason = parentSignal?.reason ?? new DOMException('The operation was aborted.', 'AbortError')
        controller.abort(reason)
        rejectAbort?.(reason)
    }
    const timeoutError = Object.assign(new Error(`Delivery Chain stage timed out after ${timeoutMs}ms.`), {
        code: 'MODEL_PROVIDER_TIMEOUT',
    })
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort(timeoutError)
            reject(timeoutError)
        }, timeoutMs)
    })

    parentSignal?.addEventListener('abort', onAbort, { once: true })

    try {
        return await Promise.race([operation(controller.signal), abortPromise, timeoutPromise])
    } finally {
        if (timeoutId) clearTimeout(timeoutId)
        parentSignal?.removeEventListener('abort', onAbort)
    }
}

async function invokeMarkdown(stage: SubagentModelStage, messages: Array<SystemMessage | HumanMessage>, signal?: AbortSignal) {
    const response = await runWithStageTimeout(
        invokeSignal => stage.model.invoke(messages, { signal: invokeSignal }),
        signal,
        stage.timeoutMs
    )

    return getMessageContentText(response.content).trim()
}

function createSafeFailureResult(stageLabel: string, title: string, failureCode = 'MODEL_STREAM_FAILED'): SubagentToolJsonResult {
    const failureDetail = failureCode === 'MODEL_STREAM_FAILED' ? '' : `（${failureCode}）`

    return {
        failureCode,
        markdown: stageLabel === 'Review Subagent' ? createReviewStageFallbackText() : createStageFallbackText(title),
        status: 'failed',
        summaryForManager: `${stageLabel} 未完成${failureDetail}，已返回安全失败摘要。`,
        warnings: [`${stageLabel} 调用失败${failureDetail}，已使用保底文本。`],
    }
}

function createMissingInvocationInputResult(subagentId: SubagentToolId): SubagentToolJsonResult {
    const displayName = DELIVERY_CHAIN_SUBAGENT_DEFINITIONS[subagentId].displayName

    return {
        failureCode: 'SUBAGENT_INVOCATION_MISSING',
        markdown: createStageFallbackText(displayName),
        status: 'failed',
        summaryForManager: `${displayName} 缺少受控 invocation 输入，已安全失败。`,
        warnings: [`${displayName} 缺少受控 invocation 输入。`],
    }
}

function formatSubagentToolInput(args: SubagentToolCallInput) {
    return `invocationId=${args.invocationId}`
}

function formatSubagentToolOutput(result: unknown) {
    const parsedResult = subagentToolJsonResultSchema.safeParse(result)

    if (!parsedResult.success) {
        return JSON.stringify(result ?? {}, null, 2)
    }

    return parsedResult.data.summaryForManager
}

function createSubagentChatToolDefinition(
    id: SubagentToolId,
    description: string,
    executeSubagentTool: ExecuteSubagentTool,
    resolveInvocationInput: NonNullable<CreateDeliveryChainSubagentToolsOptions['resolveInvocationInput']>
): ChatToolDefinition<SubagentToolCallInput> {
    const structuredTool = tool(
        async (input: SubagentToolCallInput, runtime: ToolRuntime) => {
            const invocationInput = resolveInvocationInput({
                invocationId: input.invocationId,
                subagentId: id,
            })

            if (!invocationInput) {
                return subagentToolJsonResultSchema.parse(createMissingInvocationInputResult(id))
            }

            const result = await executeSubagentTool(invocationInput, {
                signal: runtime.config?.signal ?? runtime.signal,
            })

            return subagentToolJsonResultSchema.parse(result)
        },
        {
            description,
            name: id,
            schema: subagentToolCallInputSchema,
        }
    )

    return {
        formatInput: formatSubagentToolInput,
        formatOutput: formatSubagentToolOutput,
        getDisplayConfig: () => ({
            action: 'delegate',
            title: id,
        }),
        name: id,
        outputPartType: 'tool',
        runtimeScopes: ['delivery-chain-manager'],
        schema: subagentToolCallInputSchema,
        source: 'internal',
        tool: structuredTool,
    }
}

function createPlanSubagentExecutor(stage: SubagentModelStage): ExecuteSubagentTool {
    return async (input, options) => {
        try {
            const markdown =
                (await invokeMarkdown(
                    stage,
                    [
                        new SystemMessage(
                            '你是一个方案规划专家，负责基于用户需求产出详细的实现方案。你的职责是分析需求、设计技术方案、识别风险和制定验收标准。你只需要输出方案内容，不需要编写代码或直接回答用户问题。'
                        ),
                        new HumanMessage(
                            [
                                input.instruction,
                                '上下文信息：',
                                formatContextBlocks(input.contextBlocks),
                                '约束条件：',
                                input.constraints.map(constraint => `- ${constraint}`).join('\n'),
                                '请按照以下结构输出详细的 Markdown 方案：',
                                '',
                                '## 需求理解',
                                '- 清晰理解用户的核心需求和目标',
                                '- 识别关键功能点和业务场景',
                                '- 明确需求的边界和范围',
                                '',
                                '## 实现方案',
                                '- 提供完整的技术实现思路',
                                '- 描述架构设计和模块划分',
                                '- 说明关键技术选型和理由',
                                '- 给出具体的实现步骤',
                                '',
                                '## 涉及模块',
                                '- 列出需要修改或新增的模块',
                                '- 说明各模块之间的依赖关系',
                                '- 标注核心模块和辅助模块',
                                '',
                                '## 非目标',
                                '- 明确本次任务不包含的内容',
                                '- 解释为什么这些内容不在范围内',
                                '',
                                '## 风险',
                                '- 识别技术风险和业务风险',
                                '- 评估风险等级（高/中/低）',
                                '- 提出风险缓解措施',
                                '',
                                '## 验收标准建议',
                                '- 制定可量化的验收标准',
                                '- 提供验证方法和测试要点',
                                '- 明确成功的判定条件',
                            ].join('\n')
                        ),
                    ],
                    options.signal
                )) || createStageFallbackText('实施方案')

            return {
                artifactTitle: 'Delivery Chain Plan',
                markdown,
                status: 'completed',
                summaryForManager: '方案规划已完成。',
                warnings: [],
            }
        } catch (error) {
            logProviderError(error)
            return createSafeFailureResult('Plan Subagent', '实施方案', stage.normalizeError?.(error)?.code)
        }
    }
}

function createTaskSubagentExecutor(stage: SubagentModelStage): ExecuteSubagentTool {
    return async (input, options) => {
        if (!input.inputArtifacts.some(artifact => artifact.kind === 'plan')) {
            return {
                markdown: createStageFallbackText('任务拆解'),
                status: 'failed',
                summaryForManager: '任务拆解缺少方案输入。',
                warnings: ['缺少方案输入，已拒绝完成。'],
            }
        }

        try {
            const markdown =
                (await invokeMarkdown(
                    stage,
                    [
                        new SystemMessage(
                            '你是一个任务拆解专家，负责将方案转化为可执行的任务清单。你的职责是将复杂方案分解为具体、可追踪、可验收的任务。你只需要输出任务拆解内容，不需要调用其他代理或工作流。'
                        ),
                        new HumanMessage(
                            [
                                input.instruction,
                                '上下文信息：',
                                formatContextBlocks(input.contextBlocks),
                                '输入产物：',
                                formatInputArtifacts(input.inputArtifacts),
                                '约束条件：',
                                input.constraints.map(constraint => `- ${constraint}`).join('\n'),
                                '请按照以下结构输出详细的 Markdown 任务拆解：',
                                '',
                                '## 任务拆解',
                                '- 将方案分解为具体、独立的任务',
                                '- 每个任务应该有明确的目标和交付物',
                                '- 任务粒度适中，便于跟踪和管理',
                                '',
                                '## 推荐顺序',
                                '- 按照任务之间的依赖关系排序',
                                '- 标注任务之间的先后顺序',
                                '- 说明为什么这样安排顺序',
                                '',
                                '## 风险任务',
                                '- 识别高风险或关键路径任务',
                                '- 评估风险等级和影响',
                                '- 提出应对措施',
                                '',
                                '## 验收相关任务',
                                '- 列出需要进行验收测试的任务',
                                '- 明确每个任务的验收标准',
                                '- 提供测试方法和验证要点',
                                '',
                                '## 非目标保护任务',
                                '- 列出需要保护的边界任务',
                                '- 说明为什么这些任务不在本次范围内',
                                '- 提醒注意不要超出范围',
                            ].join('\n')
                        ),
                    ],
                    options.signal
                )) || createStageFallbackText('任务拆解')

            return {
                artifactTitle: 'Delivery Chain Tasks',
                markdown,
                status: 'completed',
                summaryForManager: '任务拆解已完成。',
                warnings: [],
            }
        } catch (error) {
            logProviderError(error)
            return createSafeFailureResult('Task Subagent', '任务拆解', stage.normalizeError?.(error)?.code)
        }
    }
}

function createReviewSubagentExecutor(stage: SubagentModelStage): ExecuteSubagentTool {
    return async (input, options) => {
        const hasPlanArtifact = input.inputArtifacts.some(artifact => artifact.kind === 'plan')
        const hasTasksArtifact = input.inputArtifacts.some(artifact => artifact.kind === 'tasks')

        if (!hasPlanArtifact || !hasTasksArtifact) {
            return {
                markdown: createReviewStageFallbackText(),
                status: 'failed',
                summaryForManager: '评审缺少方案或任务输入。',
                warnings: ['缺少必要输入，已拒绝完成。'],
            }
        }

        try {
            const markdown =
                (await invokeMarkdown(
                    stage,
                    [
                        new SystemMessage(
                            '你是一个交付评审专家，负责对方案和任务拆解进行全面评审。你的职责是检查方案的完整性、任务的合理性、以及整体的可行性。你只需要输出评审结论，不需要进行代码审查或修改输入内容。'
                        ),
                        new HumanMessage(
                            [
                                input.instruction,
                                '上下文信息：',
                                formatContextBlocks(input.contextBlocks),
                                '输入产物：',
                                formatInputArtifacts(input.inputArtifacts),
                                '约束条件：',
                                input.constraints.map(constraint => `- ${constraint}`).join('\n'),
                                '请按照以下格式输出评审结果：',
                                '',
                                '结论: pass|needs_changes|blocked',
                                '（pass=方案和任务完整可行；needs_changes=需要修改完善；blocked=存在阻塞问题）',
                                '',
                                '## 覆盖检查',
                                '- 检查方案是否完整覆盖所有需求',
                                '- 评估任务是否覆盖方案的所有要点',
                                '- 识别遗漏的内容和潜在问题',
                                '',
                                '## 一致性检查',
                                '- 检查方案与需求的一致性',
                                '- 检查任务与方案的一致性',
                                '- 识别前后矛盾或冲突的地方',
                                '',
                                '## 范围漂移检查',
                                '- 判断方案和任务是否超出原始需求范围',
                                '- 识别不必要的功能或过度设计',
                                '- 评估范围控制的合理性',
                                '',
                                '## 风险与下一步建议',
                                '- 评估整体风险水平',
                                '- 提出改进建议和优化方向',
                                '- 给出下一步行动建议',
                            ].join('\n')
                        ),
                    ],
                    options.signal
                )) || createReviewStageFallbackText()

            const isBlocked = /结论:\s*blocked/i.test(markdown)

            return {
                artifactTitle: 'Delivery Chain Review',
                markdown,
                metadata: isBlocked ? { blocked: true, reviewType: 'general' } : { reviewType: 'general' },
                status: isBlocked ? 'blocked' : 'completed',
                summaryForManager: isBlocked ? '评审已完成，结论为 blocked。' : '评审已完成。',
                warnings: [],
            }
        } catch (error) {
            logProviderError(error)
            return createSafeFailureResult('Review Subagent', '交付评审', stage.normalizeError?.(error)?.code)
        }
    }
}

function createRiskSubagentExecutor(stage: SubagentModelStage): ExecuteSubagentTool {
    return async (input, options) => {
        const hasPlanArtifact = input.inputArtifacts.some(artifact => artifact.kind === 'plan')
        const hasTasksArtifact = input.inputArtifacts.some(artifact => artifact.kind === 'tasks')

        if (!hasPlanArtifact || !hasTasksArtifact) {
            return {
                markdown: createStageFallbackText('风险评审'),
                status: 'failed',
                summaryForManager: '风险评审缺少方案或任务输入。',
                warnings: ['缺少必要输入，已拒绝完成。'],
            }
        }

        try {
            const markdown =
                (await invokeMarkdown(
                    stage,
                    [
                        new SystemMessage(
                            '你是一个风险评审专家，负责评估方案和任务的风险等级。你的职责是基于治理规则和约束条件，识别实现复杂度、可验证性、外部依赖、回滚难度、影响范围、时效性等通用风险维度，并给出缓解建议。你只需要输出风险评估内容，不需要进行代码审查或修改输入内容。'
                        ),
                        new HumanMessage(
                            [
                                input.instruction,
                                '上下文信息：',
                                formatContextBlocks(input.contextBlocks),
                                '输入产物：',
                                formatInputArtifacts(input.inputArtifacts),
                                '约束条件：',
                                input.constraints.map(constraint => `- ${constraint}`).join('\n'),
                                '请按照以下格式输出风险评估：',
                                '',
                                'severity: blocker|high|medium|low|info',
                                '（blocker=存在阻塞性风险；high=高风险需优先处理；medium=中等风险；low=低风险；info=提示信息）',
                                '',
                                '## 风险识别',
                                '- 基于约束条件和治理规则，识别方案在各维度的风险',
                                '- 分析实现复杂度和技术可行性',
                                '- 评估可验证性和测试覆盖程度',
                                '- 识别外部依赖和潜在故障点',
                                '- 评估回滚难度和影响范围',
                                '- 分析时效性和进度风险',
                                '',
                                '## 风险等级',
                                '- 对每个风险标注等级（blocker/high/medium/low/info）',
                                '- 说明判定依据',
                                '',
                                '## 缓解建议',
                                '- 针对每项风险给出具体缓解措施',
                                '- 标注优先处理顺序',
                            ].join('\n')
                        ),
                    ],
                    options.signal
                )) || createStageFallbackText('风险评审')

            const severityMatch = markdown.match(/severity:\s*(blocker|high|medium|low|info)/i)
            const severity = (severityMatch?.[1]?.toLowerCase() as string | undefined) ?? 'medium'

            return {
                artifactTitle: 'Delivery Chain Risk Review',
                markdown,
                metadata: { reviewType: 'risk', severity },
                status: 'completed',
                summaryForManager: `风险评估已完成，severity=${severity}。`,
                warnings: [],
            }
        } catch (error) {
            logProviderError(error)
            return createSafeFailureResult('Risk Subagent', '风险评审', stage.normalizeError?.(error)?.code)
        }
    }
}

function createBoundarySubagentExecutor(stage: SubagentModelStage): ExecuteSubagentTool {
    return async (input, options) => {
        const hasPlanArtifact = input.inputArtifacts.some(artifact => artifact.kind === 'plan')
        const hasTasksArtifact = input.inputArtifacts.some(artifact => artifact.kind === 'tasks')

        if (!hasPlanArtifact || !hasTasksArtifact) {
            return {
                markdown: createStageFallbackText('边界检查'),
                status: 'failed',
                summaryForManager: '边界检查缺少方案或任务输入。',
                warnings: ['缺少必要输入，已拒绝完成。'],
            }
        }

        try {
            const markdown =
                (await invokeMarkdown(
                    stage,
                    [
                        new SystemMessage(
                            '你是一个边界检查专家，负责根据传入的治理规则和约束条件，逐条检查方案和任务是否触碰任何声明的边界约束。你需要认真阅读治理规则中的每一条边界定义，判断方案是否符合这些约束。你只需要输出边界检查结论，不需要修改输入内容。'
                        ),
                        new HumanMessage(
                            [
                                input.instruction,
                                '上下文信息：',
                                formatContextBlocks(input.contextBlocks),
                                '输入产物：',
                                formatInputArtifacts(input.inputArtifacts),
                                '约束条件：',
                                input.constraints.map(constraint => `- ${constraint}`).join('\n'),
                                '请按照以下格式输出边界检查结果：',
                                '',
                                'boundaryStatus: passed|needs_review|blocked',
                                '（passed=未触碰任何边界；needs_review=需要人工确认；blocked=存在边界违规）',
                                '',
                                '## 边界触碰识别',
                                '- 基于治理规则和约束条件，识别方案中可能触碰的边界点',
                                '- 列出每个触碰点及其对应的约束规则',
                                '- 分析触碰的严重程度和影响范围',
                                '',
                                '## 边界分类',
                                '- 根据治理规则的分类，对触碰点进行归类',
                                '- 说明每类边界的约束要求',
                                '',
                                '## 边界状态说明',
                                '- 对每个触碰点标注状态（passed/needs_review/blocked）',
                                '- 说明判定依据和理由',
                            ].join('\n')
                        ),
                    ],
                    options.signal
                )) || createStageFallbackText('边界检查')

            const boundaryStatusMatch = markdown.match(/boundaryStatus:\s*(passed|needs_review|blocked)/i)
            const boundaryStatus = (boundaryStatusMatch?.[1]?.toLowerCase() as string | undefined) ?? 'needs_review'
            const isBlocked = boundaryStatus === 'blocked'

            return {
                artifactTitle: 'Delivery Chain Boundary Review',
                markdown,
                metadata: isBlocked
                    ? { blocked: true, boundaryStatus, reviewType: 'boundary' }
                    : { boundaryStatus, reviewType: 'boundary' },
                status: isBlocked ? 'blocked' : 'completed',
                summaryForManager: isBlocked ? '边界检查完成，存在边界违规。' : `边界检查完成，boundaryStatus=${boundaryStatus}。`,
                warnings: [],
            }
        } catch (error) {
            logProviderError(error)
            return createSafeFailureResult('Boundary Subagent', '边界检查', stage.normalizeError?.(error)?.code)
        }
    }
}

export function getDeliveryChainSubagentDefinition(id: SubagentToolId): SubagentToolDefinition {
    return {
        id,
        ...DELIVERY_CHAIN_SUBAGENT_DEFINITIONS[id],
    }
}

export function getDeliveryChainSubagentDefinitions() {
    return subagentToolIds.map(id => getDeliveryChainSubagentDefinition(id))
}

export function createDeliveryChainSubagentTools(options: CreateDeliveryChainSubagentToolsOptions): DeliveryChainSubagentToolDefinition[] {
    const resolveInvocationInput = options.resolveInvocationInput ?? (() => null)
    const resolveStage = (id: SubagentToolId): SubagentModelStage =>
        options.models?.[id] ?? {
            model: options.model,
            normalizeError: options.normalizeError,
        }
    const executors: Record<SubagentToolId, ExecuteSubagentTool> = {
        'boundary-subagent': createBoundarySubagentExecutor(resolveStage('boundary-subagent')),
        'plan-subagent': createPlanSubagentExecutor(resolveStage('plan-subagent')),
        'review-subagent': createReviewSubagentExecutor(resolveStage('review-subagent')),
        'risk-subagent': createRiskSubagentExecutor(resolveStage('risk-subagent')),
        'task-subagent': createTaskSubagentExecutor(resolveStage('task-subagent')),
    }

    return subagentToolIds.map(id => {
        const definition = getDeliveryChainSubagentDefinition(id)

        return {
            ...definition,
            chatToolDefinition: createSubagentChatToolDefinition(id, definition.description, executors[id], resolveInvocationInput),
        }
    })
}

export function getDefaultArtifactTitle(subagentId: SubagentToolId) {
    const titles: Record<SubagentToolId, string> = {
        'boundary-subagent': 'Delivery Chain Boundary Review',
        'plan-subagent': 'Delivery Chain Plan',
        'review-subagent': 'Delivery Chain Review',
        'risk-subagent': 'Delivery Chain Risk Review',
        'task-subagent': 'Delivery Chain Tasks',
    }

    return titles[subagentId]
}
