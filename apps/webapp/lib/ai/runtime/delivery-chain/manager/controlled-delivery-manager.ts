import { isDeepStrictEqual } from 'node:util'

import type { BaseMessage } from '@langchain/core/messages'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { Runnable } from '@langchain/core/runnables'

import { createId } from '@/lib/ai/create-id'
import type { AiMindChatModelHandle, ResolvedModelSelection } from '@/lib/ai/model-provider'
import { executeToolCall, normalizeAndValidateToolCalls } from '@/lib/ai/runtime/tool-runtime'
import { createChatToolRegistry } from '@/lib/ai/tools'

import type { DeliveryChainInput, DeliveryChainResourceBundle } from '../graph-state'
import type { DeliveryPhase } from './delegation-policy'
import {
    deliveryChainDelegationPolicy,
    deliveryChainReviewGroupPolicy,
    validateDelegationToolCall,
    validateReviewGroupToolCall,
    validateToolCallBatch,
    validateToolCallBatchForPhase,
} from './delegation-policy'
import { createDeliveryChainModelSet } from './delivery-chain-model-set'
import { buildDeliveryManagerFailureReport, synthesizeReviewBundle, toSubagentReportSummary } from './report-synthesis'
import { createRuntimeArtifact, createSubagentResultArtifacts, findRuntimeArtifact } from './runtime-artifacts'
import {
    type RuntimeArtifact,
    type SubagentToolCallInput,
    type SubagentToolId,
    subagentToolInputSchema,
    subagentToolJsonResultSchema,
} from './subagent-tool-schemas'
import { createDeliveryChainSubagentTools, getDefaultArtifactTitle } from './subagent-tools'
import type {
    DeliveryChainSubagentToolDefinition,
    ReviewBundle,
    SubagentToolInvocation,
    SubagentToolInvocationTrace,
    SubagentToolResult,
} from './types'
import type { DeliveryManagerProgressEvent } from './workflow-progress'

interface ControlledDeliveryManagerOptions {
    input: DeliveryChainInput
    modelHandle: AiMindChatModelHandle
    onProgress?: (event: DeliveryManagerProgressEvent) => void
    resolvedModelSelection: ResolvedModelSelection
    resources: DeliveryChainResourceBundle
    signal?: AbortSignal
    subagentTools?: DeliveryChainSubagentToolDefinition[]
    workflowId: string
}

export interface ControlledDeliveryManagerResult {
    artifacts: RuntimeArtifact[]
    deliveryReportArtifact: RuntimeArtifact
    failureMessage?: string
    planResult?: SubagentToolResult
    reportMarkdown: string
    reviewResult?: SubagentToolResult
    status: 'blocked' | 'completed' | 'failed'
    taskResult?: SubagentToolResult
    trace: SubagentToolInvocationTrace
    warnings: string[]
}

// v0.4.1: phase 结构。Plan/Task 串行，Review Group 并行。
const SERIAL_SUBAGENT_ORDER: SubagentToolId[] = ['plan-subagent', 'task-subagent']
const REVIEW_GROUP_TOOLS: SubagentToolId[] = ['review-subagent', 'risk-subagent', 'boundary-subagent']

function buildRuntimeFailureMessage(prefix: string, error: unknown, normalizeError?: (error: unknown) => { code: string }) {
    const failureCode = normalizeError?.(error)?.code

    return failureCode ? `${prefix}（${failureCode}）。` : `${prefix}。`
}

function createManagerToolFailureResult(options: {
    artifacts: RuntimeArtifact[]
    failureMessage: string
    input: DeliveryChainInput
    resources: DeliveryChainResourceBundle
    trace: SubagentToolInvocationTrace
    warnings: string[]
}): ControlledDeliveryManagerResult {
    const reportMarkdown = buildDeliveryManagerFailureReport({
        failureMessage: options.failureMessage,
        input: options.input,
        resources: options.resources,
        warnings: options.warnings,
    })
    const deliveryReportArtifact = createRuntimeArtifact({
        kind: 'delivery_report',
        markdown: reportMarkdown,
        metadata: {
            failed: true,
        },
        source: {
            stage: 'manager-synthesis',
        },
        title: 'Delivery Chain Report',
    })

    return {
        artifacts: [...options.artifacts, deliveryReportArtifact],
        deliveryReportArtifact,
        failureMessage: options.failureMessage,
        reportMarkdown,
        status: 'failed',
        trace: options.trace,
        warnings: options.warnings,
    }
}

function createManagerMessages(options: {
    artifacts: RuntimeArtifact[]
    expectedToolId: SubagentToolId
    toolCallInput: SubagentToolCallInput
    resources: DeliveryChainResourceBundle
}) {
    const artifactSummary =
        options.artifacts.length === 0
            ? '当前还没有任何产物。'
            : options.artifacts.map(artifact => `- ${artifact.kind}: ${artifact.title}`).join('\n')
    const sourceSummary = options.resources.sourceRefs.length > 0 ? options.resources.sourceRefs.join('、') : '仅使用用户输入文本'
    const stepOrder = SERIAL_SUBAGENT_ORDER
    const currentStep = stepOrder.indexOf(options.expectedToolId) + 1

    return [
        new SystemMessage(
            [
                '你是一个任务委派管理器，负责协调多个子代理完成交付任务。',
                '你的职责是按照固定顺序依次调用子代理工具，协调它们完成工作。',
                `本轮你只能够且必须调用一个工具：${options.expectedToolId}。`,
                '你必须严格按照以下规则执行：',
                '1. 必须调用工具，不能直接回答问题或输出普通文本',
                '2. 每次只能调用一个工具，不能同时调用多个工具',
                '3. 只能调用已注册的工具，不能调用未注册的工具',
                '4. 必须按顺序调用，不能跳过任何步骤',
                '5. 不能发起嵌套委派或并行委派',
                '6. 只需要传递工具调用的基本参数，不需要传递完整的输入数据，runtime 会自动注入必要的上下文信息',
            ].join('\n')
        ),
        new HumanMessage(
            [
                `任务进度：第 ${currentStep} 步 / 共 ${stepOrder.length} 步`,
                `输入来源：${sourceSummary}`,
                `当前可用产物：\n${artifactSummary}`,
                `下一步必须调用工具：${options.expectedToolId}`,
                `当前会话标识：${options.toolCallInput.invocationId}`,
                '请直接发起工具调用，使用以下参数：',
                JSON.stringify(options.toolCallInput, null, 2),
                '',
                '注意：',
                '- 你只需要发起工具调用，不需要输出任何解释性文本',
                '- 工具调用会自动获取所需的上下文和输入数据',
            ].join('\n')
        ),
    ] satisfies BaseMessage[]
}

// v0.4.1: Review phase 的 manager messages，指示模型同时调用 3 个 review-class tools。
function createReviewGroupManagerMessages(options: {
    artifacts: RuntimeArtifact[]
    reviewToolCalls: Array<{ invocationId: string; toolId: SubagentToolId }>
    resources: DeliveryChainResourceBundle
}) {
    const artifactSummary = options.artifacts.map(artifact => `- ${artifact.kind}: ${artifact.title}`).join('\n')
    const sourceSummary = options.resources.sourceRefs.length > 0 ? options.resources.sourceRefs.join('、') : '仅使用用户输入文本'
    const toolList = options.reviewToolCalls.map(({ toolId, invocationId }) => `- ${toolId}: ${invocationId}`).join('\n')
    const toolCallInputs = options.reviewToolCalls.map(({ invocationId }) => ({ invocationId }))

    return [
        new SystemMessage(
            [
                '你是一个任务委派管理器，负责协调多个子代理完成交付任务。',
                '现在进入评审阶段，你需要同时调用 3 个评审工具：review-subagent、risk-subagent、boundary-subagent。',
                '你必须严格按照以下规则执行：',
                '1. 必须同时调用以上 3 个工具，不能只调用其中一部分',
                '2. 不能调用评审以外的工具（如 plan-subagent、task-subagent）',
                '3. 不能发起嵌套委派',
                '4. 只需要传递工具调用的基本参数，不需要传递完整的输入数据，runtime 会自动注入必要的上下文信息',
            ].join('\n')
        ),
        new HumanMessage(
            [
                `输入来源：${sourceSummary}`,
                `当前可用产物：\n${artifactSummary}`,
                '本轮需要同时调用以下 3 个评审工具：',
                toolList,
                '',
                '请直接发起 3 个工具调用，使用以下参数：',
                JSON.stringify(toolCallInputs, null, 2),
                '',
                '注意：',
                '- 你需要同时发起 3 个工具调用，不需要输出任何解释性文本',
                '- 每个工具调用会自动获取所需的上下文和输入数据',
            ].join('\n')
        ),
    ] satisfies BaseMessage[]
}

function buildContextBlocks(subagentId: SubagentToolId, resources: DeliveryChainResourceBundle) {
    const rubricByTool: Record<SubagentToolId, { kind: string; markdown: string; title: string }> = {
        'boundary-subagent': {
            kind: 'rubric',
            markdown: resources.reviewRubricText,
            title: 'Boundary Rubric',
        },
        'plan-subagent': {
            kind: 'rubric',
            markdown: resources.planRubricText,
            title: 'Plan Rubric',
        },
        'review-subagent': {
            kind: 'rubric',
            markdown: resources.reviewRubricText,
            title: 'Review Rubric',
        },
        'risk-subagent': {
            kind: 'rubric',
            markdown: resources.reviewRubricText,
            title: 'Risk Rubric',
        },
        'task-subagent': {
            kind: 'rubric',
            markdown: resources.taskRubricText,
            title: 'Task Rubric',
        },
    }

    const contextBlocks = [
        {
            kind: 'requirement',
            markdown: resources.requirementText,
            title: 'Requirement',
        },
        {
            kind: 'governance',
            markdown: resources.governanceText,
            title: 'Governance',
        },
        rubricByTool[subagentId],
    ]

    if (resources.contextText) {
        contextBlocks.splice(1, 0, {
            kind: 'context',
            markdown: resources.contextText,
            title: 'Scenario Context',
        })
    }

    if (resources.inlineRequirementText) {
        contextBlocks.push({
            kind: 'user-note',
            markdown: resources.inlineRequirementText,
            title: 'Inline Requirement Note',
        })
    }

    return contextBlocks
}

function buildSubagentInstruction(subagentId: SubagentToolId) {
    switch (subagentId) {
        case 'boundary-subagent':
            return '请检查方案和任务是否触碰项目边界约束，包括持久化、人工审批、流协议、工具注册等边界。'
        case 'plan-subagent':
            return '请仔细分析需求、上下文、治理规则和评估标准，产出一份完整的实现方案。方案应包含需求理解、技术方案、模块划分、风险评估和验收标准。'
        case 'review-subagent':
            return '请对方案和任务拆解进行全面评审，检查覆盖度、一致性和范围漂移，给出明确的评审结论和改进建议。'
        case 'risk-subagent':
            return '请评估方案和任务的风险等级，识别实现复杂度、测试覆盖、维护成本等风险，并给出缓解建议。'
        case 'task-subagent':
            return '请基于输入的方案，将其拆解为具体、可执行的任务清单。每个任务应有明确的目标、交付物和验收标准。'
    }
}

function buildSubagentConstraints(subagentId: SubagentToolId) {
    const sharedConstraints = [
        '只能使用提供给你的上下文信息和输入数据，不得访问外部资源或未授权的信息。',
        '不得写入文件，不得触发人工审批流程，不得调用其他代理或工作流。',
        '你的输出是内部产物，不是直接给最终用户的回答。',
    ]

    if (subagentId === 'plan-subagent') {
        return [...sharedConstraints, '不做任务拆解，不做评审结论。']
    }

    if (subagentId === 'task-subagent') {
        return [...sharedConstraints, '必须使用 plan 产物作为输入。']
    }

    return [...sharedConstraints, '必须使用 plan 和 tasks 产物作为输入。']
}

function buildInputArtifacts(subagentId: SubagentToolId, artifacts: RuntimeArtifact[]) {
    if (subagentId === 'task-subagent') {
        return artifacts.filter(artifact => artifact.kind === 'plan')
    }

    // v0.4.1: review/risk/boundary 三个 review-class tool 都消费 plan + tasks artifacts。
    if (subagentId === 'review-subagent' || subagentId === 'risk-subagent' || subagentId === 'boundary-subagent') {
        return artifacts.filter(artifact => artifact.kind === 'plan' || artifact.kind === 'tasks')
    }

    return []
}

function buildSubagentInvocation(
    subagentId: SubagentToolId,
    invocationId: string,
    startedAt: string,
    resources: DeliveryChainResourceBundle,
    artifacts: RuntimeArtifact[]
): SubagentToolInvocation {
    const input = subagentToolInputSchema.parse(
        JSON.parse(
            JSON.stringify({
                constraints: buildSubagentConstraints(subagentId),
                contextBlocks: buildContextBlocks(subagentId, resources),
                inputArtifacts: buildInputArtifacts(subagentId, artifacts),
                instruction: buildSubagentInstruction(subagentId),
            })
        )
    )

    return {
        ...input,
        invocationId,
        startedAt,
        subagentId,
    }
}

function buildSubagentToolCallInput(invocationId: string): SubagentToolCallInput {
    return {
        invocationId,
    }
}

function buildCapabilityFailureMessage() {
    return '当前模型不支持 Delivery Manager tool-calling，请切换到声明了 tool-calling 能力的模型后重试。'
}

function startTraceEntry(trace: SubagentToolInvocationTrace, subagentId: SubagentToolId) {
    const invocationId = createId()
    const startedAt = new Date().toISOString()

    trace.invocations.push({
        invocationId,
        startedAt,
        status: 'running',
        subagentId,
        summary: `正在调用 ${subagentId}`,
    })

    return {
        invocationId,
        startedAt,
    }
}

function finishTraceEntry(
    trace: SubagentToolInvocationTrace,
    invocationId: string,
    status: 'blocked' | 'completed' | 'failed',
    summary: string
) {
    const entry = trace.invocations.find(item => item.invocationId === invocationId)

    if (!entry) {
        return
    }

    entry.endedAt = new Date().toISOString()
    entry.status = status
    entry.summary = summary
}

function emitProgress(options: Pick<ControlledDeliveryManagerOptions, 'onProgress'>, event: DeliveryManagerProgressEvent) {
    options.onProgress?.(event)
}

function toDelegationStepId(subagentId: SubagentToolId) {
    if (subagentId === 'plan-subagent') {
        return 'delegate-plan' as const
    }

    if (subagentId === 'task-subagent') {
        return 'delegate-task' as const
    }

    return 'delegate-review' as const
}

function toDelegationRunningSummary(subagentId: SubagentToolId) {
    if (subagentId === 'plan-subagent') {
        return 'Manager 正在委派 Plan Subagent Tool'
    }

    if (subagentId === 'task-subagent') {
        return 'Manager 正在委派 Task Subagent Tool'
    }

    return 'Manager 正在委派 Review Subagent Tool'
}

export async function runControlledDeliveryManager(options: ControlledDeliveryManagerOptions): Promise<ControlledDeliveryManagerResult> {
    const warnings = [...options.resources.warnings]
    const trace: SubagentToolInvocationTrace = {
        invocations: [],
        workflowId: options.workflowId,
    }
    const artifacts: RuntimeArtifact[] = []
    const subagentInvocations = new Map<string, SubagentToolInvocation>()
    const modelSet = createDeliveryChainModelSet({
        resolvedModelSelection: options.resolvedModelSelection,
    })
    const managerModelHandle = modelSet.manager.handle

    const defaultToolDefinitions = createDeliveryChainSubagentTools({
        model: modelSet.subagents['plan-subagent'].handle.model,
        models: Object.fromEntries(
            Object.entries(modelSet.subagents).map(([subagentId, stage]) => [
                subagentId,
                {
                    model: stage.handle.model,
                    normalizeError: stage.handle.normalizeError,
                    timeoutMs: stage.timeoutMs,
                },
            ])
        ),
        normalizeError: modelSet.subagents['plan-subagent'].handle.normalizeError,
        resolveInvocationInput: ({ invocationId, subagentId }) => {
            const invocation = subagentInvocations.get(invocationId)

            if (!invocation || invocation.subagentId !== subagentId) {
                return null
            }

            return {
                constraints: invocation.constraints,
                contextBlocks: invocation.contextBlocks,
                inputArtifacts: invocation.inputArtifacts,
                instruction: invocation.instruction,
            }
        },
    })
    const overriddenToolDefinitions = new Map((options.subagentTools ?? []).map(definition => [definition.id, definition]))
    const toolDefinitions = defaultToolDefinitions.map(definition => overriddenToolDefinitions.get(definition.id) ?? definition)
    const chatToolRegistry = createChatToolRegistry(toolDefinitions.map(definition => definition.chatToolDefinition))
    const scopedChatToolDefinitions = chatToolRegistry.listActiveByRuntimeScope('delivery-chain-manager')
    const toolDefinitionMap = new Map(scopedChatToolDefinitions.map(toolDefinition => [toolDefinition.name, toolDefinition]))
    const subagentToolMap = new Map(toolDefinitions.map(definition => [definition.id, definition]))
    const noopWriteChunk = () => undefined

    if (!managerModelHandle.capabilities.toolCalling || !managerModelHandle.bindTools) {
        emitProgress(options, {
            failureMessage: buildCapabilityFailureMessage(),
            status: 'failed',
            stepId: 'delegate-plan',
            summary: '当前模型不支持 Delivery Manager tool-calling',
        })

        return createManagerToolFailureResult({
            artifacts,
            failureMessage: buildCapabilityFailureMessage(),
            input: options.input,
            resources: options.resources,
            trace,
            warnings,
        })
    }

    const toolBoundModel = managerModelHandle.bindTools(scopedChatToolDefinitions.map(toolDefinition => toolDefinition.tool)) as Runnable

    let planResult: SubagentToolResult | undefined
    let taskResult: SubagentToolResult | undefined

    for (const expectedToolId of SERIAL_SUBAGENT_ORDER) {
        const toolDefinition = subagentToolMap.get(expectedToolId)

        if (!toolDefinition) {
            return createManagerToolFailureResult({
                artifacts,
                failureMessage: `ControlledDeliveryManager 未注册 ${expectedToolId}。`,
                input: options.input,
                resources: options.resources,
                trace,
                warnings,
            })
        }

        const traceEntry = startTraceEntry(trace, expectedToolId)
        const stepId = toDelegationStepId(expectedToolId)
        const invocation = buildSubagentInvocation(
            expectedToolId,
            traceEntry.invocationId,
            traceEntry.startedAt,
            options.resources,
            artifacts
        )
        const toolCallInput = buildSubagentToolCallInput(traceEntry.invocationId)

        subagentInvocations.set(traceEntry.invocationId, invocation)

        const failCurrentStep = (failureMessage: string, failureSummary: string, progressSummary = failureSummary) => {
            finishTraceEntry(trace, traceEntry.invocationId, 'failed', failureSummary)
            emitProgress(options, {
                failureMessage,
                status: 'failed',
                stepId,
                summary: progressSummary,
            })

            return createManagerToolFailureResult({
                artifacts,
                failureMessage,
                input: options.input,
                resources: options.resources,
                trace,
                warnings,
            })
        }

        try {
            emitProgress(options, {
                details: [`Manager 调用 ${toolDefinition.displayName} Tool`],
                status: 'running',
                stepId,
                summary: toDelegationRunningSummary(expectedToolId),
            })

            const response = await toolBoundModel.invoke(
                createManagerMessages({
                    artifacts,
                    expectedToolId,
                    toolCallInput,
                    resources: options.resources,
                }),
                {
                    signal: options.signal,
                }
            )

            const validation = normalizeAndValidateToolCalls(response, toolDefinitionMap)
            const batchFailure = validateToolCallBatch(validation.toolCalls.length, deliveryChainDelegationPolicy.allowParallel)

            if (validation.toolErrors.length > 0 || batchFailure) {
                const validationErrorMessage = validation.toolErrors[0]?.message
                const failureMessage =
                    batchFailure?.message ?? validationErrorMessage ?? 'ControlledDeliveryManager 收到了不合法的 tool 参数。'
                const failureSummary = batchFailure?.summary ?? validationErrorMessage ?? '收到了不合法的 tool 参数'

                return failCurrentStep(failureMessage, failureSummary)
            }

            const toolCall = validation.toolCalls[0]
            const policyFailure = validateDelegationToolCall({
                artifacts,
                expectedToolId,
                policy: deliveryChainDelegationPolicy,
                requestedToolId: toolCall?.name ?? '',
                toolCallsSoFar: trace.invocations.length - 1,
            })

            if (!toolCall || policyFailure) {
                const failureMessage = policyFailure?.message ?? 'ControlledDeliveryManager 未发起合法的子 Agent tool 调用。'
                const failureSummary = policyFailure?.summary ?? '未发起合法的子 Agent tool 调用'

                return failCurrentStep(failureMessage, failureSummary)
            }

            if (!isDeepStrictEqual(toolCall.args, toolCallInput)) {
                return failCurrentStep(
                    '子 Agent tool 调用 token 与当前受控 invocation 不一致，已安全失败。',
                    '子 Agent tool 调用 token 与当前受控 invocation 不一致',
                    'Manager 拒绝了不一致的子 Agent tool 调用 token'
                )
            }

            const executedToolResult = await executeToolCall(
                toolCall,
                {
                    signal: options.signal,
                },
                noopWriteChunk,
                {
                    errorStage: 'tool-execution',
                    runtimeScope: 'delivery-chain-manager',
                    toolDefinitionMap,
                }
            )

            if (!executedToolResult.success) {
                return failCurrentStep(
                    `${toolDefinition.displayName} Tool 未完成合法执行，当前交付链已安全失败。`,
                    `${toolDefinition.displayName} Tool 未完成合法执行`
                )
            }

            const parsedToolResult = subagentToolJsonResultSchema.safeParse(executedToolResult.rawResult)

            if (!parsedToolResult.success) {
                return failCurrentStep('子 Agent tool 返回了不合法的 JSON result，已安全失败。', '子 Agent tool 返回了不合法的 JSON result')
            }

            const normalizedResult: SubagentToolResult = {
                artifacts: createSubagentResultArtifacts(expectedToolId, parsedToolResult.data, getDefaultArtifactTitle(expectedToolId)),
                endedAt: new Date().toISOString(),
                failureCode: parsedToolResult.data.failureCode,
                invocationId: traceEntry.invocationId,
                markdown: parsedToolResult.data.markdown,
                status: parsedToolResult.data.status,
                subagentId: expectedToolId,
                summaryForManager: parsedToolResult.data.summaryForManager,
                warnings: parsedToolResult.data.warnings,
            }

            warnings.push(...normalizedResult.warnings)
            artifacts.push(...normalizedResult.artifacts)

            if (expectedToolId === 'plan-subagent') {
                planResult = normalizedResult
            } else if (expectedToolId === 'task-subagent') {
                taskResult = normalizedResult
            }

            if (normalizedResult.status === 'failed' || (expectedToolId !== 'review-subagent' && normalizedResult.status !== 'completed')) {
                return failCurrentStep(
                    `${toolDefinition.displayName} 未完成，当前交付链已安全失败。`,
                    toSubagentReportSummary(normalizedResult)
                )
            }

            finishTraceEntry(
                trace,
                traceEntry.invocationId,
                normalizedResult.status === 'blocked' ? 'blocked' : 'completed',
                toSubagentReportSummary(normalizedResult)
            )
            emitProgress(options, {
                status: 'completed',
                stepId,
                summary: toSubagentReportSummary(normalizedResult),
            })
        } catch (error) {
            return failCurrentStep(
                buildRuntimeFailureMessage(
                    `${toolDefinition.displayName} Tool 调用失败，当前交付链已安全失败`,
                    error,
                    modelSet.subagents[expectedToolId].handle.normalizeError
                ),
                `${toolDefinition.displayName} Tool 调用失败`
            )
        } finally {
            subagentInvocations.delete(traceEntry.invocationId)
        }
    }

    // v0.4.1: Review Group 并行执行
    const reviewToolCalls: Array<{ invocationId: string; toolId: SubagentToolId; traceEntry: ReturnType<typeof startTraceEntry> }> = []
    for (const reviewToolId of REVIEW_GROUP_TOOLS) {
        const toolDefinition = subagentToolMap.get(reviewToolId)

        if (!toolDefinition) {
            return createManagerToolFailureResult({
                artifacts,
                failureMessage: `ControlledDeliveryManager 未注册 ${reviewToolId}。`,
                input: options.input,
                resources: options.resources,
                trace,
                warnings,
            })
        }

        const traceEntry = startTraceEntry(trace, reviewToolId)
        const invocation = buildSubagentInvocation(
            reviewToolId,
            traceEntry.invocationId,
            traceEntry.startedAt,
            options.resources,
            artifacts
        )

        subagentInvocations.set(traceEntry.invocationId, invocation)
        reviewToolCalls.push({ invocationId: traceEntry.invocationId, toolId: reviewToolId, traceEntry })
    }

    const reviewToolNames = reviewToolCalls.map(({ toolId }) => {
        const definition = subagentToolMap.get(toolId)
        return definition?.displayName ?? toolId
    })

    emitProgress(options, {
        details: ['Manager 并行调用评审子 Agent', ...reviewToolNames.map(name => `- ${name}`)],
        status: 'running',
        stepId: 'delegate-review-group',
        summary: `Manager 正在并行调用 ${reviewToolNames.length} 个评审子 Agent：${reviewToolNames.join('、')}`,
    })

    const failReviewGroup = (failureMessage: string, failureSummary: string) => {
        for (const { traceEntry } of reviewToolCalls) {
            finishTraceEntry(trace, traceEntry.invocationId, 'failed', failureSummary)
            subagentInvocations.delete(traceEntry.invocationId)
        }

        emitProgress(options, {
            failureMessage,
            status: 'failed',
            stepId: 'delegate-review-group',
            summary: failureSummary,
        })

        return createManagerToolFailureResult({
            artifacts,
            failureMessage,
            input: options.input,
            resources: options.resources,
            trace,
            warnings,
        })
    }

    let reviewResponse: Awaited<ReturnType<Runnable['invoke']>>

    try {
        reviewResponse = await toolBoundModel.invoke(
            createReviewGroupManagerMessages({
                artifacts,
                reviewToolCalls: reviewToolCalls.map(({ invocationId, toolId }) => ({ invocationId, toolId })),
                resources: options.resources,
            }),
            {
                signal: options.signal,
            }
        )
    } catch (error) {
        return failReviewGroup(
            buildRuntimeFailureMessage('Review Group Tool 调用失败，当前交付链已安全失败', error, managerModelHandle.normalizeError),
            'Review Group Tool 调用失败'
        )
    }

    const reviewValidation = normalizeAndValidateToolCalls(reviewResponse, toolDefinitionMap)
    const reviewBatchFailure = validateToolCallBatchForPhase(
        reviewValidation.toolCalls.length,
        'review-group',
        deliveryChainReviewGroupPolicy,
        deliveryChainDelegationPolicy
    )

    if (reviewValidation.toolErrors.length > 0 || reviewBatchFailure) {
        const validationErrorMessage = reviewValidation.toolErrors[0]?.message
        const failureMessage =
            reviewBatchFailure?.message ?? validationErrorMessage ?? 'ControlledDeliveryManager Review Group 收到了不合法的 tool 参数。'
        const failureSummary = reviewBatchFailure?.summary ?? validationErrorMessage ?? 'Review Group 收到了不合法的 tool 参数'

        return failReviewGroup(failureMessage, failureSummary)
    }

    // 校验每个 review tool call
    for (const toolCall of reviewValidation.toolCalls) {
        const policyFailure = validateReviewGroupToolCall({
            artifacts,
            policy: deliveryChainDelegationPolicy,
            reviewGroupPolicy: deliveryChainReviewGroupPolicy,
            requestedToolId: toolCall?.name ?? '',
            toolCallsSoFar: trace.invocations.length - 1,
        })

        if (!toolCall || policyFailure) {
            const failureMessage = policyFailure?.message ?? 'ControlledDeliveryManager Review Group 未发起合法的子 Agent tool 调用。'
            const failureSummary = policyFailure?.summary ?? 'Review Group 未发起合法的子 Agent tool 调用'

            return failReviewGroup(failureMessage, failureSummary)
        }
    }

    // 并行执行 review tool calls
    let reviewResults: Array<{
        executedToolResult: Awaited<ReturnType<typeof executeToolCall>>
        toolCall: (typeof reviewValidation.toolCalls)[number]
    }>

    try {
        reviewResults = await Promise.all(
            reviewValidation.toolCalls.map(async toolCall => {
                const executedToolResult = await executeToolCall(
                    toolCall,
                    {
                        signal: options.signal,
                    },
                    noopWriteChunk,
                    {
                        errorStage: 'tool-execution',
                        runtimeScope: 'delivery-chain-manager',
                        toolDefinitionMap,
                    }
                )

                return { executedToolResult, toolCall }
            })
        )
    } catch (error) {
        return failReviewGroup(
            buildRuntimeFailureMessage('Review Group Tool 执行失败，当前交付链已安全失败', error, managerModelHandle.normalizeError),
            'Review Group Tool 执行失败'
        )
    }

    // 处理 partial failure
    // v0.4.1: 通过 toolCall.name 查找对应的 reviewToolId，不依赖索引对齐
    const failedReviews: Array<{ subagentId: SubagentToolId; summary: string }> = []
    let generalReviewResult: SubagentToolResult | null = null
    let riskReviewResult: SubagentToolResult | null = null
    let boundaryReviewResult: SubagentToolResult | null = null

    for (const { executedToolResult, toolCall } of reviewResults) {
        const reviewToolId = (toolCall?.name ?? '') as SubagentToolId
        const reviewToolCall = reviewToolCalls.find(({ toolId }) => toolId === reviewToolId)

        if (!reviewToolCall) continue

        const traceEntry = reviewToolCall.traceEntry

        if (!executedToolResult.success) {
            failedReviews.push({ subagentId: reviewToolId, summary: `${reviewToolId} 执行失败` })
            finishTraceEntry(trace, traceEntry.invocationId, 'failed', `${reviewToolId} 执行失败`)
            subagentInvocations.delete(traceEntry.invocationId)
            continue
        }

        const parsedToolResult = subagentToolJsonResultSchema.safeParse(executedToolResult.rawResult)

        if (!parsedToolResult.success) {
            failedReviews.push({ subagentId: reviewToolId, summary: `${reviewToolId} 返回了不合法的 JSON result` })
            finishTraceEntry(trace, traceEntry.invocationId, 'failed', `${reviewToolId} 返回了不合法的 JSON result`)
            subagentInvocations.delete(traceEntry.invocationId)
            continue
        }

        // v0.4.1: executor 返回 status: 'failed'（如 createSafeFailureResult）也计入 failedReviews
        if (parsedToolResult.data.status === 'failed') {
            failedReviews.push({ subagentId: reviewToolId, summary: `${reviewToolId} 执行失败` })
            finishTraceEntry(trace, traceEntry.invocationId, 'failed', `${reviewToolId} 执行失败`)
            subagentInvocations.delete(traceEntry.invocationId)
            continue
        }

        const normalizedResult: SubagentToolResult = {
            artifacts: createSubagentResultArtifacts(reviewToolId, parsedToolResult.data, getDefaultArtifactTitle(reviewToolId)),
            endedAt: new Date().toISOString(),
            failureCode: parsedToolResult.data.failureCode,
            invocationId: traceEntry.invocationId,
            markdown: parsedToolResult.data.markdown,
            status: parsedToolResult.data.status,
            subagentId: reviewToolId,
            summaryForManager: parsedToolResult.data.summaryForManager,
            warnings: parsedToolResult.data.warnings,
        }

        warnings.push(...normalizedResult.warnings)
        artifacts.push(...normalizedResult.artifacts)

        if (reviewToolId === 'review-subagent') {
            generalReviewResult = normalizedResult
        } else if (reviewToolId === 'risk-subagent') {
            riskReviewResult = normalizedResult
        } else if (reviewToolId === 'boundary-subagent') {
            boundaryReviewResult = normalizedResult
        }

        finishTraceEntry(
            trace,
            traceEntry.invocationId,
            normalizedResult.status === 'blocked' ? 'blocked' : 'completed',
            toSubagentReportSummary(normalizedResult)
        )

        subagentInvocations.delete(traceEntry.invocationId)
    }

    // v0.4.1: partial failure 处理 — 全部 failed 才 fail closed
    if (failedReviews.length === REVIEW_GROUP_TOOLS.length) {
        const failureMessage = 'ControlledDeliveryManager Review Group 全部评审子 Agent 失败，已安全失败。'
        const failureSummary = 'Review Group 全部评审子 Agent 失败'

        emitProgress(options, {
            failureMessage,
            status: 'failed',
            stepId: 'delegate-review-group',
            summary: failureSummary,
        })

        return createManagerToolFailureResult({
            artifacts,
            failureMessage,
            input: options.input,
            resources: options.resources,
            trace,
            warnings,
        })
    }

    // 标记未返回的 tool call 为 failed
    for (const { toolId, traceEntry } of reviewToolCalls) {
        const hasResult =
            generalReviewResult?.subagentId === toolId ||
            riskReviewResult?.subagentId === toolId ||
            boundaryReviewResult?.subagentId === toolId

        if (!hasResult && !failedReviews.some(failed => failed.subagentId === toolId)) {
            failedReviews.push({ subagentId: toolId, summary: `${toolId} 未返回结果` })
            finishTraceEntry(trace, traceEntry.invocationId, 'failed', `${toolId} 未返回结果`)
        }
    }

    // v0.4.1: 构造 ReviewBundle 并调用 synthesizeReviewBundle
    const reviewBundle: ReviewBundle = {
        boundaryReview: boundaryReviewResult,
        failedReviews,
        generalReview: generalReviewResult,
        riskReview: riskReviewResult,
    }

    const completedReviews = [
        generalReviewResult ? 'Review Subagent' : null,
        riskReviewResult ? 'Risk Subagent' : null,
        boundaryReviewResult ? 'Boundary Subagent' : null,
    ].filter(Boolean)

    const completedReviewNames = completedReviews as string[]
    const failedReviewNames = failedReviews.map(f => f.subagentId)

    const completedDetails = completedReviewNames.map(name => `- ${name}：完成`)

    const failedDetails = failedReviewNames.length > 0 ? [...failedReviewNames.map(name => `- ${name}：失败`)] : []

    emitProgress(options, {
        details: [...completedDetails, ...failedDetails],
        status: 'completed',
        stepId: 'delegate-review-group',
        summary:
            failedReviewNames.length > 0
                ? `并行评审已完成，${completedReviewNames.length} 个成功，${failedReviewNames.length} 个失败：${failedReviewNames.join('、')}`
                : `并行评审已完成，${completedReviewNames.length} 个评审全部通过`,
    })

    const planArtifact = findRuntimeArtifact(artifacts, 'plan')
    const taskArtifact = findRuntimeArtifact(artifacts, 'tasks')

    if (!planArtifact || !taskArtifact) {
        return createManagerToolFailureResult({
            artifacts,
            failureMessage: 'ControlledDeliveryManager 缺少合成最终报告所需的 artifacts。',
            input: options.input,
            resources: options.resources,
            trace,
            warnings,
        })
    }

    emitProgress(options, {
        details: ['Manager 汇总 Delivery Chain Report'],
        status: 'running',
        stepId: 'synthesize-report',
        summary: 'Manager 正在汇总最终报告',
    })

    let synthesisResult: Awaited<ReturnType<typeof synthesizeReviewBundle>>

    try {
        synthesisResult = await synthesizeReviewBundle({
            bundle: reviewBundle,
            input: options.input,
            planArtifact,
            resources: options.resources,
            taskArtifact,
            warnings,
        })
    } catch (error) {
        const failureMessage = buildRuntimeFailureMessage(
            'Delivery Chain Report 汇总失败，当前交付链已安全失败',
            error,
            managerModelHandle.normalizeError
        )

        emitProgress(options, {
            failureMessage,
            status: 'failed',
            stepId: 'synthesize-report',
            summary: 'Delivery Chain Report 汇总失败',
        })

        return createManagerToolFailureResult({
            artifacts,
            failureMessage,
            input: options.input,
            resources: options.resources,
            trace,
            warnings,
        })
    }
    const reportMarkdown = synthesisResult.reportMarkdown
    const deliveryReportArtifact = createRuntimeArtifact({
        kind: 'delivery_report',
        markdown: reportMarkdown,
        metadata: synthesisResult.reviewDisposition === 'blocked' ? { blocked: true } : undefined,
        source: {
            stage: 'manager-synthesis',
        },
        title: 'Delivery Chain Report',
    })

    emitProgress(options, {
        status: 'completed',
        stepId: 'synthesize-report',
        summary: 'Delivery Chain Report 已生成。',
    })

    return {
        artifacts: [...artifacts, deliveryReportArtifact],
        deliveryReportArtifact,
        planResult,
        reportMarkdown,
        status: synthesisResult.reviewDisposition === 'blocked' ? 'blocked' : 'completed',
        taskResult,
        trace,
        warnings,
    }
}
