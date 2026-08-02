import { tool, type ToolRuntime } from '@langchain/core/tools'

import { isAbortError } from '@/lib/ai/error-utils'
import type { ChatToolDefinition } from '@/lib/ai/tools'

import { ContractInvocationError, invokeBusinessAgentContract } from './contract-invocation'
import {
    deliveryWorkerToolResultSchema,
    type SubagentToolCallInput,
    subagentToolCallInputSchema,
    type SubagentToolId,
    subagentToolIds,
} from './subagent-tool-schemas'
import type { DeliveryChainSubagentToolDefinition, DeliveryWorkerInvocation, SubagentToolDefinition } from './types'

export interface CreateDeliveryChainSubagentToolsOptions {
    resolveInvocation: (options: { invocationId: string; subagentId: SubagentToolId }) => DeliveryWorkerInvocation | null
}

const DELIVERY_CHAIN_SUBAGENT_DEFINITIONS: Record<SubagentToolId, Omit<SubagentToolDefinition, 'id'>> = {
    'boundary-subagent': {
        allowedContextKinds: ['requirement', 'context', 'governance', 'rubric', 'user-note'],
        allowedTools: [],
        description: '检查 Plan/Tasks 是否触碰持久化、人工审批、流协议与工具注册等边界约束。',
        displayName: 'Boundary Subagent',
        inputArtifactKinds: ['plan', 'tasks'],
        nonGoals: ['不写代码', '不修改 Plan/Tasks', '不做源码级 code review', '不调用 Tasklist Agent'],
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
        roleInstruction: '你负责把 requirement、上下文、治理边界和 rubric 收口为受控 Plan。',
    },
    'review-subagent': {
        allowedContextKinds: ['requirement', 'context', 'governance', 'rubric', 'user-note'],
        allowedTools: [],
        description: '基于 Plan 和 Tasks artifacts 生成受控交付评审。',
        displayName: 'Review Subagent',
        inputArtifactKinds: ['plan', 'tasks'],
        nonGoals: ['不写代码', '不修改 Plan/Tasks', '不做源码级 code review', '不调用 Tasklist Agent'],
        outputArtifactKinds: ['review'],
        roleInstruction: '你负责评估 Plan 和 Tasks 的覆盖度、一致性和范围漂移。',
    },
    'risk-subagent': {
        allowedContextKinds: ['requirement', 'context', 'governance', 'rubric', 'user-note'],
        allowedTools: [],
        description: '检查实现复杂度、测试覆盖和维护成本等风险。',
        displayName: 'Risk Subagent',
        inputArtifactKinds: ['plan', 'tasks'],
        nonGoals: ['不写代码', '不修改 Plan/Tasks', '不做源码级 code review', '不调用 Tasklist Agent'],
        outputArtifactKinds: ['review'],
        roleInstruction: '你负责评估 Plan 和 Tasks 的风险等级并提出缓解建议。',
    },
    'task-subagent': {
        allowedContextKinds: ['requirement', 'context', 'governance', 'rubric', 'user-note'],
        allowedTools: [],
        description: '消费 Plan artifact 并生成受控任务拆解。',
        displayName: 'Task Subagent',
        inputArtifactKinds: ['plan'],
        nonGoals: ['不写代码', '不触发 HITL', '不调用 Tasklist Agent', '不输出最终报告'],
        outputArtifactKinds: ['tasks'],
        roleInstruction: '你负责把 Plan artifact 落成可执行任务拆解和验收相关任务。',
    },
}

function formatSubagentToolInput(args: SubagentToolCallInput) {
    return `invocationId=${args.invocationId}`
}

function formatSubagentToolOutput(result: unknown) {
    const parsedResult = deliveryWorkerToolResultSchema.safeParse(result)
    if (!parsedResult.success) return 'Worker 返回了无效的内部结果。'

    switch (parsedResult.data.kind) {
        case 'success':
            return 'Worker 已完成。'
        case 'contract_failure':
            return 'Worker Contract 未完成。'
        case 'timeout':
            return 'Worker 调用超时。'
        case 'execution_failed':
            return 'Worker 执行未完成。'
    }
}

function getFailureCode(error: unknown, invocation: DeliveryWorkerInvocation) {
    try {
        return invocation.normalizeError?.(error)?.code
    } catch {
        return undefined
    }
}

function createSubagentChatToolDefinition(
    id: SubagentToolId,
    description: string,
    resolveInvocation: CreateDeliveryChainSubagentToolsOptions['resolveInvocation']
): ChatToolDefinition<SubagentToolCallInput> {
    const structuredTool = tool(
        async (input: SubagentToolCallInput, runtime: ToolRuntime) => {
            const invocation = resolveInvocation({ invocationId: input.invocationId, subagentId: id })
            if (!invocation) {
                return deliveryWorkerToolResultSchema.parse({
                    failureCode: 'WORKER_INVOCATION_NOT_FOUND',
                    kind: 'execution_failed',
                })
            }

            try {
                const value = await invokeBusinessAgentContract({
                    businessModel: invocation.businessModel,
                    messages: invocation.messages,
                    model: invocation.contractModel,
                    name: invocation.name,
                    onBusinessInvoke: invocation.onBusinessInvoke,
                    onContractInvoke: invocation.onContractInvoke,
                    schema: invocation.schema,
                    signal: runtime.config?.signal ?? runtime.signal,
                    validate: invocation.validate,
                })
                return deliveryWorkerToolResultSchema.parse({ kind: 'success', value })
            } catch (error) {
                if (isAbortError(error) || runtime.config?.signal?.aborted || runtime.signal?.aborted) {
                    throw error
                }

                if (error instanceof ContractInvocationError) {
                    return deliveryWorkerToolResultSchema.parse({
                        issues: error.issues,
                        kind: 'contract_failure',
                    })
                }

                const failureCode = getFailureCode(error, invocation)
                if (failureCode === 'MODEL_PROVIDER_TIMEOUT') {
                    return deliveryWorkerToolResultSchema.parse({ kind: 'timeout' })
                }

                return deliveryWorkerToolResultSchema.parse({
                    failureCode: failureCode ?? 'WORKER_EXECUTION_FAILED',
                    kind: 'execution_failed',
                })
            }
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
    return subagentToolIds.map(id => {
        const definition = getDeliveryChainSubagentDefinition(id)

        return {
            ...definition,
            chatToolDefinition: createSubagentChatToolDefinition(id, definition.description, options.resolveInvocation),
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
