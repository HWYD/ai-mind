import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { tool, type ToolRuntime } from '@langchain/core/tools'

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
    resolveInvocationInput?: (options: { invocationId: string; subagentId: SubagentToolId }) => SubagentToolInput | null
}

interface SubagentToolExecutionOptions {
    signal?: AbortSignal
}

type ExecuteSubagentTool = (input: SubagentToolInput, options: SubagentToolExecutionOptions) => Promise<SubagentToolJsonResult>

const DELIVERY_CHAIN_SUBAGENT_DEFINITIONS: Record<SubagentToolId, Omit<SubagentToolDefinition, 'id'>> = {
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

async function invokeMarkdown(model: BaseChatModel, messages: Array<SystemMessage | HumanMessage>, signal?: AbortSignal) {
    const response = await model.invoke(messages, {
        signal,
    })

    return getMessageContentText(response.content).trim()
}

function createSafeFailureResult(stageLabel: string, title: string): SubagentToolJsonResult {
    return {
        markdown: stageLabel === 'Review Subagent' ? createReviewStageFallbackText() : createStageFallbackText(title),
        status: 'failed',
        summaryForManager: `${stageLabel} 未完成，已返回安全失败摘要。`,
        warnings: [`${stageLabel} 调用失败，已使用保底文本。`],
    }
}

function createMissingInvocationInputResult(subagentId: SubagentToolId): SubagentToolJsonResult {
    const displayName = DELIVERY_CHAIN_SUBAGENT_DEFINITIONS[subagentId].displayName

    return {
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

function createPlanSubagentExecutor(model: BaseChatModel): ExecuteSubagentTool {
    return async (input, options) => {
        try {
            const markdown =
                (await invokeMarkdown(
                    model,
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
        } catch {
            return createSafeFailureResult('Plan Subagent', '实施方案')
        }
    }
}

function createTaskSubagentExecutor(model: BaseChatModel): ExecuteSubagentTool {
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
                    model,
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
        } catch {
            return createSafeFailureResult('Task Subagent', '任务拆解')
        }
    }
}

function createReviewSubagentExecutor(model: BaseChatModel): ExecuteSubagentTool {
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
                    model,
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
                metadata: isBlocked ? { blocked: true } : undefined,
                status: isBlocked ? 'blocked' : 'completed',
                summaryForManager: isBlocked ? '评审已完成，结论为 blocked。' : '评审已完成。',
                warnings: [],
            }
        } catch {
            return createSafeFailureResult('Review Subagent', '交付评审')
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
    const executors: Record<SubagentToolId, ExecuteSubagentTool> = {
        'plan-subagent': createPlanSubagentExecutor(options.model),
        'review-subagent': createReviewSubagentExecutor(options.model),
        'task-subagent': createTaskSubagentExecutor(options.model),
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
        'plan-subagent': 'Delivery Chain Plan',
        'review-subagent': 'Delivery Chain Review',
        'task-subagent': 'Delivery Chain Tasks',
    }

    return titles[subagentId]
}
