import { type BaseMessage, HumanMessage, SystemMessage, type ToolCall } from '@langchain/core/messages'
import type { ZodType } from 'zod'

import { createId } from '@/lib/ai/create-id'
import type { AiMindChatModelHandle } from '@/lib/ai/model-provider'
import { executeToolCall } from '@/lib/ai/runtime/tool-runtime/execution'

import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { DeliveryChainInput, DeliveryChainResourceBundle } from '../graph-state'
import {
    boundaryReviewResultDraftSchema,
    collectSafeContractIssues,
    generalReviewResultDraftSchema,
    planArtifactDraftSchema,
    type ReviewerRole,
    type ReviewResultDraft,
    type RevisionTarget,
    riskReviewResultDraftSchema,
    type RunStatus,
    type SupervisorDispatchPlan,
    supervisorExecuteDecisionDraftSchema,
    type SupervisorPostReviewDecisionDraft,
    type SupervisorPostReviewGuidanceDraft,
    supervisorPostReviewGuidanceDraftSchema,
    supervisorPreDecisionDraftSchema,
    taskArtifactDraftSchema,
} from './agent-contracts'
import { ContractInvocationError, invokeBusinessAgentContract, type StructuredOutputModel } from './contract-invocation'
import { createDeliveryChainExecutionBudget, validateExactReviewerRoles } from './delegation-policy'
import { buildDeliveryManagerFailureReport, buildStructuredDeliveryManagerReport, resolveReviewBundleStatus } from './report-synthesis'
import {
    createRuntimeArtifact,
    createRuntimePlanArtifact,
    createRuntimeTaskArtifact,
    reviseRuntimePlanArtifact,
    reviseRuntimeTaskArtifact,
} from './runtime-artifacts'
import { deliveryWorkerToolResultSchema, type SubagentToolId } from './subagent-tool-schemas'
import { createDeliveryChainSubagentTools } from './subagent-tools'
import type {
    DeliveryWorkerInvocation,
    RevisionOutcome,
    RuntimeArtifact,
    RuntimePlanArtifact,
    RuntimeReviewFinding,
    RuntimeReviewResult,
    RuntimeTaskArtifact,
    StructuredReviewBundle,
    SubagentToolInvocationTrace,
} from './types'
import type { DeliveryManagerProgressEvent } from './workflow-progress'

interface StructuredModelSet {
    manager: { contractHandle: AiMindChatModelHandle; handle: AiMindChatModelHandle }
    subagents: Record<string, { contractHandle: AiMindChatModelHandle; handle: AiMindChatModelHandle }>
}

export interface StructuredDeliveryManagerOptions {
    context?: ChatExecutionContext
    input: DeliveryChainInput
    modelSet: StructuredModelSet
    onProgress?: (event: DeliveryManagerProgressEvent) => void
    resources: DeliveryChainResourceBundle
    signal?: AbortSignal
    workflowId: string
    writeChunk?: WriteChunk
}

export interface StructuredDeliveryManagerResult {
    artifacts: RuntimeArtifact[]
    deliveryReportArtifact: RuntimeArtifact
    dispatchPlan?: SupervisorDispatchPlan
    failureMessage?: string
    invocationMetrics: {
        businessModelCalls: number
        contractModelCalls: number
        contractRepairCalls: number
    }
    reportMarkdown: string
    revisionOutcome?: RevisionOutcome
    reviewBundles: StructuredReviewBundle[]
    runStatus: RunStatus
    status: 'blocked' | 'completed' | 'failed'
    trace: SubagentToolInvocationTrace
    warnings: string[]
}

const reviewToolIdByRole: Record<ReviewerRole, 'review-subagent' | 'risk-subagent' | 'boundary-subagent'> = {
    boundary: 'boundary-subagent',
    general: 'review-subagent',
    risk: 'risk-subagent',
}

function emit(options: StructuredDeliveryManagerOptions, event: DeliveryManagerProgressEvent) {
    options.onProgress?.(event)
}

function toModel(handle: AiMindChatModelHandle): StructuredOutputModel {
    return handle.model as unknown as StructuredOutputModel
}

function toStatus(runStatus: RunStatus): StructuredDeliveryManagerResult['status'] {
    if (runStatus === 'failed') return 'failed'
    if (runStatus === 'blocked') return 'blocked'
    return 'completed'
}

function createArtifactContractSnapshot(artifact: RuntimeArtifact): string {
    const contractFields: Record<string, unknown> = { ...(artifact as RuntimeArtifact & Record<string, unknown>) }
    delete contractFields.artifactId
    delete contractFields.id
    delete contractFields.planRef
    delete contractFields.source

    return `${artifact.kind}@${artifact.revision}: ${JSON.stringify(contractFields)}`
}

function createMessages(
    title: string,
    instructions: string[],
    resources: DeliveryChainResourceBundle,
    artifacts: RuntimeArtifact[] = [],
    rubric?: { label: string; text: string }
): BaseMessage[] {
    return [
        new SystemMessage(
            [
                `你是一个受控交付规划工作流中的${title}。`,
                '为你的角色生成一份完整、详细的业务草稿。后续的 Contract 阶段会将其编码为严格的结构化输出。',
                '不要假设本次业务模型调用附带了 schema，也不要向用户索要已在 Requirement、Context、Governance、artifacts 或角色 rubric 中提供的信息。',
                ...instructions,
            ].join('\n')
        ),
        new HumanMessage(
            [
                `Requirement:\n${resources.requirementText}`,
                resources.contextText ? `Context:\n${resources.contextText}` : '',
                `Governance:\n${resources.governanceText}`,
                rubric ? `${rubric.label} rubric:\n${rubric.text}` : '',
                artifacts.length > 0 ? `Current artifacts:\n${artifacts.map(createArtifactContractSnapshot).join('\n\n')}` : '',
            ]
                .filter(Boolean)
                .join('\n\n')
        ),
    ]
}

function createRevisionWorkerContext(options: {
    findings: RuntimeReviewFinding[]
    requests: Extract<SupervisorPostReviewDecisionDraft, { action: 'revise' }>['requests']
    target: RevisionTarget
}): HumanMessage {
    const requests = options.requests
        .filter(request => request.targets.includes(options.target))
        .map(request => ({
            requestKey: request.requestKey,
            requiredActions: request.requiredActions,
            sourceFindingIds: request.sourceFindingIds,
            summary: request.summary,
            targets: request.targets,
        }))
    const sourceFindingIds = new Set(requests.flatMap(request => request.sourceFindingIds))
    const findings = options.findings
        .filter(finding => sourceFindingIds.has(finding.findingId))
        .map(finding => ({
            description: finding.description,
            evidence: finding.evidence,
            findingId: finding.findingId,
            requirement: finding.requirement,
            severity: finding.severity,
            sourceRole: finding.sourceRole,
            suggestedAction: finding.suggestedAction,
            targetArtifacts: finding.targetArtifacts,
        }))

    return new HumanMessage(`已验证的修订上下文：\n${JSON.stringify({ findings, requests })}`)
}

function addTrace(
    trace: SubagentToolInvocationTrace,
    subagentId: 'plan-subagent' | 'task-subagent' | 'review-subagent' | 'risk-subagent' | 'boundary-subagent'
) {
    const invocationId = createId()
    trace.invocations.push({
        invocationId,
        startedAt: new Date().toISOString(),
        status: 'running',
        subagentId,
        summary: `正在调用 ${subagentId}`,
    })
    return invocationId
}

function finishTrace(trace: SubagentToolInvocationTrace, invocationId: string, status: 'completed' | 'failed', summary: string) {
    const entry = trace.invocations.find(item => item.invocationId === invocationId)
    if (!entry) return
    entry.endedAt = new Date().toISOString()
    entry.status = status
    entry.summary = summary
}

class DeliveryWorkerToolExecutionError extends Error {
    constructor(
        readonly kind: 'execution_failed' | 'timeout',
        readonly failureCode?: string
    ) {
        super(kind === 'timeout' ? 'Delivery Worker timed out.' : 'Delivery Worker execution failed.')
        this.name = 'DeliveryWorkerToolExecutionError'
    }
}

function createDeliveryWorkerToolRuntime(options: {
    context: ChatExecutionContext
    trace: SubagentToolInvocationTrace
    writeChunk: WriteChunk
}) {
    const invocations = new Map<string, { invocation: DeliveryWorkerInvocation; subagentId: SubagentToolId }>()
    const toolDefinitionMap = new Map(
        createDeliveryChainSubagentTools({
            resolveInvocation: ({ invocationId, subagentId }) => {
                const entry = invocations.get(invocationId)
                return entry?.subagentId === subagentId ? entry.invocation : null
            },
        }).map(definition => [definition.id, definition.chatToolDefinition])
    )

    return {
        async execute<T>(execution: {
            invocation: Omit<DeliveryWorkerInvocation, 'schema'> & {
                schema: ZodType<T>
            }
            subagentId: SubagentToolId
        }): Promise<T> {
            const invocationId = addTrace(options.trace, execution.subagentId)
            const invocation: DeliveryWorkerInvocation = execution.invocation
            invocations.set(invocationId, { invocation, subagentId: execution.subagentId })

            try {
                const toolCall: ToolCall = {
                    args: { invocationId },
                    id: invocationId,
                    name: execution.subagentId,
                }
                const result = await executeToolCall(toolCall, options.context, options.writeChunk, {
                    runtimeScope: 'delivery-chain-manager',
                    toolDefinitionMap,
                })
                const parsedResult = deliveryWorkerToolResultSchema.safeParse(result.rawResult)

                if (!result.success || !parsedResult.success) {
                    throw new DeliveryWorkerToolExecutionError('execution_failed', 'WORKER_TOOL_TRANSPORT_FAILED')
                }

                if (parsedResult.data.kind === 'contract_failure') {
                    throw new ContractInvocationError(parsedResult.data.issues)
                }

                if (parsedResult.data.kind === 'timeout') {
                    throw new DeliveryWorkerToolExecutionError('timeout')
                }

                if (parsedResult.data.kind === 'execution_failed') {
                    throw new DeliveryWorkerToolExecutionError('execution_failed', parsedResult.data.failureCode)
                }

                const parsedDraft = execution.invocation.schema.safeParse(parsedResult.data.value)
                if (!parsedDraft.success) {
                    throw new ContractInvocationError(collectSafeContractIssues(parsedDraft.error))
                }

                finishTrace(options.trace, invocationId, 'completed', `${execution.subagentId} 已完成`)
                return parsedDraft.data
            } catch (error) {
                finishTrace(options.trace, invocationId, 'failed', `${execution.subagentId} 未完成`)
                throw error
            } finally {
                invocations.delete(invocationId)
            }
        },
    }
}

function createFailure(options: {
    artifacts: RuntimeArtifact[]
    failureMessage: string
    input: DeliveryChainInput
    invocationMetrics?: StructuredDeliveryManagerResult['invocationMetrics']
    resources: DeliveryChainResourceBundle
    reviewBundles: StructuredReviewBundle[]
    trace: SubagentToolInvocationTrace
    warnings: string[]
}): StructuredDeliveryManagerResult {
    const reportMarkdown = buildDeliveryManagerFailureReport({
        artifacts: options.artifacts,
        failureMessage: options.failureMessage,
        input: options.input,
        resources: options.resources,
        reviewBundles: options.reviewBundles,
        warnings: options.warnings,
    })
    const deliveryReportArtifact = createRuntimeArtifact({
        kind: 'delivery_report',
        markdown: reportMarkdown,
        source: { stage: 'manager-synthesis' },
        title: 'Delivery Chain Report',
    })
    return {
        artifacts: [...options.artifacts, deliveryReportArtifact],
        deliveryReportArtifact,
        failureMessage: options.failureMessage,
        invocationMetrics: options.invocationMetrics ?? {
            businessModelCalls: 0,
            contractModelCalls: 0,
            contractRepairCalls: 0,
        },
        reportMarkdown,
        reviewBundles: options.reviewBundles,
        runStatus: 'failed',
        status: 'failed',
        trace: options.trace,
        warnings: options.warnings,
    }
}

function describeStageFailure(stage: string, error: unknown, normalizeError?: (error: unknown) => { message: string }) {
    if (error instanceof DeliveryWorkerToolExecutionError) {
        const isTimeout = error.kind === 'timeout'
        return {
            failureMessage: isTimeout ? `${stage} 调用超时。` : `${stage} 执行未完成。`,
            progressMessage: isTimeout ? `${stage} 调用超时。` : `${stage} 执行未完成。`,
            summary: isTimeout ? `${stage} 调用超时。` : `${stage} 执行未完成。`,
        }
    }

    if (error instanceof ContractInvocationError) {
        const issueSummary = error.issues.map(issue => `${issue.path} (${issue.code})`).join('、')
        return {
            failureMessage: issueSummary ? `${stage} Contract 未完成：${issueSummary}。` : `${stage} Contract 未完成。`,
            progressMessage: issueSummary ? `${stage} Contract 未完成：${issueSummary}。` : `${stage} Contract 未完成。`,
            summary: `${stage} Contract 未完成。`,
        }
    }

    if (normalizeError) {
        try {
            const normalized = normalizeError(error)
            if (normalized.message) {
                return {
                    failureMessage: `${stage} 执行未完成。${normalized.message}`,
                    progressMessage: `${stage} 执行未完成。`,
                    summary: `${stage} 执行未完成。`,
                }
            }
        } catch {
            // Provider 归一化失败时继续使用通用安全摘要。
        }
    }

    return {
        failureMessage: `${stage} 执行未完成。`,
        progressMessage: `${stage} 执行未完成。`,
        summary: `${stage} 执行未完成。`,
    }
}

export function resolveStructuredReviewStatus(bundle: StructuredReviewBundle): RunStatus {
    return resolveReviewBundleStatus(bundle)
}

function toRuntimeReviewResult(role: ReviewerRole, cycleId: string, draft: ReviewResultDraft): RuntimeReviewResult {
    const findings: RuntimeReviewFinding[] = draft.findings.map(finding => ({
        ...finding,
        cycleId,
        findingId: createId(),
        sourceRole: role,
    }))
    return { ...draft, cycleId, findings }
}

export function derivePostReviewDecision(
    bundle: StructuredReviewBundle,
    guidance?: SupervisorPostReviewGuidanceDraft
): SupervisorPostReviewDecisionDraft {
    const actionableFindings = bundle.findings.filter(finding => finding.findingType === 'issue' && finding.requirement === 'required')
    const rationale = guidance?.rationale ?? 'Runtime 已根据通过校验的评审发现确定后续处理范围。'

    if (actionableFindings.length === 0) return { action: 'finalize', rationale }

    const requests = (['plan', 'tasks'] as const).flatMap(target => {
        const findings = actionableFindings.filter(finding => finding.targetArtifacts.includes(target))
        if (findings.length === 0) return []

        const recommendation = guidance?.recommendations.find(item => item.target === target)
        const requiredActions = recommendation
            ? [...new Set([...recommendation.requiredActions, recommendation.acceptanceSuggestion])]
            : [...new Set(findings.map(finding => finding.suggestedAction))]
        return [
            {
                requestKey: `runtime-${target}-revision`,
                requiredActions,
                sourceFindingIds: findings.map(finding => finding.findingId),
                summary:
                    recommendation?.summary ?? `根据 ${findings.length} 条已验证的必需问题更新${target === 'plan' ? '方案' : '任务'}。`,
                targets: [target],
            },
        ]
    })

    if (requests.length === 0) return { action: 'finalize', rationale }

    return {
        action: 'revise',
        rationale,
        requests,
        revisionTargets: requests.map(request => request.targets[0]),
    }
}

async function runReviewCycle(options: {
    artifacts: RuntimeArtifact[]
    modelSet: StructuredModelSet
    onBusinessInvoke?: () => void
    onContractInvoke?: (attempt: 'initial' | 'repair') => void
    resources: DeliveryChainResourceBundle
    signal?: AbortSignal
    trace: SubagentToolInvocationTrace
    workerTools: ReturnType<typeof createDeliveryWorkerToolRuntime>
}): Promise<{ artifacts: RuntimeArtifact[]; bundle: StructuredReviewBundle }> {
    const plan = options.artifacts.filter(artifact => artifact.kind === 'plan').at(-1)
    const tasks = options.artifacts.filter(artifact => artifact.kind === 'tasks').at(-1)
    if (!plan || !tasks) throw new Error('Review Group requires Plan and Tasks artifacts.')

    const cycleId = createId()
    const roles: ReviewerRole[] = ['general', 'risk', 'boundary']
    const coverage: StructuredReviewBundle['coverage'] = {
        boundary: 'execution_failed',
        general: 'execution_failed',
        risk: 'execution_failed',
    }
    const results: StructuredReviewBundle['results'] = {}
    const reviewArtifacts: RuntimeArtifact[] = []

    const settled = await Promise.allSettled(
        roles.map(async role => {
            const subagentId = reviewToolIdByRole[role]
            try {
                const messages = createMessages(
                    `${role} Reviewer`,
                    [
                        '仅评估提供的 Plan 和 Tasks。',
                        '仅在存在需要处理的具体缺口时使用 findingType="issue"。将正向验证记录为 findingType="observation"，且不将其纳入必须跟进的工作。',
                        'Current artifacts 部分包含本次评审的权威 Plan 和 Tasks 快照。当 artifacts 已存在时，不要声称其缺失。',
                        '本 Runtime 执行的是只读规划与评审。Plan 或 Task 中提及应用源文件仅描述未来的实现工作，并非本 run 已访问或修改了这些文件的证据。',
                        '将 governance 副作用限制应用于本 Runtime 实际执行的操作。不要仅因为需求功能或未来实现会修改应用代码就判定为 blocked。',
                        '将 Requirement 和 Context 中的实现决策约定视为未来允许的目标模块和范围的权威依据。',
                        ...(role === 'boundary'
                            ? [
                                  'Governance 中"规划 vs 实际变更"规则优先：Plan 或 Task 中仅将 apps/ 或 packages/ 作为未来实现目标来命名，不属于资源边界违规，不得产生边界 blocker。',
                              ]
                            : []),
                    ],
                    options.resources,
                    [plan, tasks],
                    { label: 'Review', text: options.resources.reviewRubricText }
                )
                const draft =
                    role === 'general'
                        ? await options.workerTools.execute({
                              subagentId,
                              invocation: {
                                  businessModel: options.modelSet.subagents[subagentId]!.handle.model,
                                  contractModel: toModel(options.modelSet.subagents[subagentId]!.contractHandle),
                                  messages,
                                  name: 'delivery_chain_general_review',
                                  normalizeError: options.modelSet.subagents[subagentId]!.handle.normalizeError,
                                  onBusinessInvoke: options.onBusinessInvoke,
                                  onContractInvoke: options.onContractInvoke,
                                  schema: generalReviewResultDraftSchema,
                              },
                          })
                        : role === 'risk'
                          ? await options.workerTools.execute({
                                subagentId,
                                invocation: {
                                    businessModel: options.modelSet.subagents[subagentId]!.handle.model,
                                    contractModel: toModel(options.modelSet.subagents[subagentId]!.contractHandle),
                                    messages,
                                    name: 'delivery_chain_risk_review',
                                    normalizeError: options.modelSet.subagents[subagentId]!.handle.normalizeError,
                                    onBusinessInvoke: options.onBusinessInvoke,
                                    onContractInvoke: options.onContractInvoke,
                                    schema: riskReviewResultDraftSchema,
                                },
                            })
                          : await options.workerTools.execute({
                                subagentId,
                                invocation: {
                                    businessModel: options.modelSet.subagents[subagentId]!.handle.model,
                                    contractModel: toModel(options.modelSet.subagents[subagentId]!.contractHandle),
                                    messages,
                                    name: 'delivery_chain_boundary_review',
                                    normalizeError: options.modelSet.subagents[subagentId]!.handle.normalizeError,
                                    onBusinessInvoke: options.onBusinessInvoke,
                                    onContractInvoke: options.onContractInvoke,
                                    schema: boundaryReviewResultDraftSchema,
                                },
                            })
                const result = toRuntimeReviewResult(role, cycleId, draft)
                coverage[role] = 'completed'
                results[role] = result
                reviewArtifacts.push(
                    createRuntimeArtifact({
                        kind: 'review',
                        markdown: draft.markdown,
                        source: { stage: `review-${role}`, subagentId },
                        title: `${role} Review`,
                    })
                )
            } catch (error) {
                coverage[role] =
                    error instanceof ContractInvocationError
                        ? 'contract_failure'
                        : error instanceof DeliveryWorkerToolExecutionError && error.kind === 'timeout'
                          ? 'timeout'
                          : 'execution_failed'
            }
        })
    )
    void settled
    const bundle: StructuredReviewBundle = {
        artifactRefs: {
            plan: { artifactId: plan.artifactId, revision: plan.revision },
            tasks: { artifactId: tasks.artifactId, revision: tasks.revision },
        },
        coverage,
        cycleId,
        findings: Object.values(results).flatMap(result => result?.findings ?? []),
        results,
    }
    return { artifacts: reviewArtifacts, bundle }
}

export async function runStructuredDeliveryManager(options: StructuredDeliveryManagerOptions): Promise<StructuredDeliveryManagerResult> {
    const warnings = [...options.resources.warnings]
    const trace: SubagentToolInvocationTrace = { invocations: [], workflowId: options.workflowId }
    const artifacts: RuntimeArtifact[] = []
    const reviewBundles: StructuredReviewBundle[] = []
    const executionBudget = createDeliveryChainExecutionBudget()
    const invocationMetrics: StructuredDeliveryManagerResult['invocationMetrics'] = {
        businessModelCalls: 0,
        contractModelCalls: 0,
        contractRepairCalls: 0,
    }
    const onBusinessInvoke = () => {
        invocationMetrics.businessModelCalls += 1
    }
    const onContractInvoke = (attempt: 'initial' | 'repair') => {
        invocationMetrics.contractModelCalls += 1
        if (attempt === 'repair') invocationMetrics.contractRepairCalls += 1
    }
    const workerTools = createDeliveryWorkerToolRuntime({
        context: options.context ?? { signal: options.signal },
        trace,
        writeChunk: options.writeChunk ?? (() => {}),
    })

    let preDecision
    try {
        emit(options, { status: 'running', stepId: 'supervisor-pre-decision', summary: 'Supervisor 正在决定是否进入受控执行。' })
        const preDecisionSchema =
            options.input.source === 'demo_scenario' && options.input.expectedPreDecision === 'execute'
                ? supervisorExecuteDecisionDraftSchema
                : supervisorPreDecisionDraftSchema
        if (!executionBudget.claim('preDecision')) throw new Error('Delivery Chain pre-decision budget exceeded.')
        preDecision = await invokeBusinessAgentContract({
            businessModel: options.modelSet.manager.handle.model,
            onBusinessInvoke,
            onContractInvoke,
            messages: createMessages(
                'Supervisor',
                [
                    '决定 execute、clarification_required 或 blocked。',
                    '本 run 是只读规划与评审：即使需求后续会修改应用代码，仍可进行规划。',
                    '仅在规划输入不足或本 run 被要求执行禁止的副作用时，才选择 clarification_required 或 blocked。',
                    '将 Requirement 中声明的用户可见行为和验收标准视为权威依据。Context 描述的是实现约束和现有辅助工具，其本身不构成澄清需求。',
                    '实现方案选择、与现有 helper 可能的不匹配、或可记录在 Plan 中的假设，均不属于信息缺失。仅在提供的材料缺少或存在不可调和的冲突，且该冲突会改变用户可接受的最终结果时，才选择 clarification_required。',
                    ...(options.input.source === 'demo_scenario'
                        ? [
                              '运行时事实：这是一个只读的演示规划场景。Runtime 仅加载了提供的 examples/agent-demo 需求、上下文、rubrics 和 governance 资源。',
                              'Requirement 或 Context 中出现的任何 apps/ 或 packages/ 路径，均为 Plan 和 Tasks 的未来实现目标，并不要求当前文件访问或实现。',
                              '对于已明确范围和验收标准的演示场景，选择 execute。不要仅因为未来工作是新功能或命名了 apps/ 或 packages/ 目标就选择 clarification_required；将这些 governance 限制记录为 Plan 和 Review 的约束即可。',
                              ...(options.input.expectedPreDecision === 'execute'
                                  ? [
                                        '运行时策略：此精选快速入口场景已通过输入就绪校验，因此 branch 必须为 execute。使用提供的材料填充 planningFocus、taskFocus、reviewFocus、stageIntents、assumptions 和精确的 Reviewer 集合。',
                                    ]
                                  : []),
                          ]
                        : []),
                    '当 branch 为 execute 时，reviewerRoles 必须恰好包含 general、risk、boundary 各一次，顺序无关。',
                    '不得省略、重复或添加 reviewer 角色。当集合无效时，Runtime 会在任何 Worker 启动前拒绝该 run。',
                    '当 branch 为 execute 时，stageIntents 必须恰好包含三个条目：plan、tasks、review 各一次。',
                ],
                options.resources
            ),
            model: toModel(options.modelSet.manager.contractHandle),
            name: 'delivery_chain_supervisor_pre',
            schema: preDecisionSchema,
            signal: options.signal,
        })
        emit(options, { status: 'completed', stepId: 'supervisor-pre-decision', summary: `Supervisor 决策：${preDecision.branch}` })
    } catch (error) {
        const failure = describeStageFailure('Supervisor pre-decision', error, options.modelSet.manager.handle.normalizeError)
        emit(options, {
            failureMessage: failure.progressMessage,
            status: 'failed',
            stepId: 'supervisor-pre-decision',
            summary: failure.summary,
        })
        return createFailure({
            artifacts,
            failureMessage: failure.failureMessage,
            input: options.input,
            resources: options.resources,
            reviewBundles,
            trace,
            warnings,
        })
    }

    const dispatchPlan: SupervisorDispatchPlan = { dispatchPlanId: createId(), preDecision }
    if (preDecision.branch !== 'execute') {
        const runStatus: RunStatus = preDecision.branch
        const reportMarkdown = [
            '# Delivery Chain Report / 交付计划报告',
            '',
            `- 状态：\`${runStatus}\``,
            `- 原因：${preDecision.reason}`,
            `- 下一步：${preDecision.nextStep}`,
        ].join('\n')
        const deliveryReportArtifact = createRuntimeArtifact({
            kind: 'delivery_report',
            markdown: reportMarkdown,
            source: { stage: 'manager-synthesis' },
            title: 'Delivery Chain Report',
        })
        return {
            artifacts: [deliveryReportArtifact],
            deliveryReportArtifact,
            dispatchPlan,
            invocationMetrics,
            reportMarkdown,
            reviewBundles,
            runStatus,
            status: toStatus(runStatus),
            trace,
            warnings,
        }
    }

    const exactSetFailure = validateExactReviewerRoles(preDecision.reviewerRoles)
    if (exactSetFailure) {
        emit(options, {
            failureMessage: exactSetFailure.summary,
            status: 'failed',
            stepId: 'delegate-review-group',
            summary: 'Review Group 角色集合无效。',
        })
        return createFailure({
            artifacts,
            failureMessage: exactSetFailure.summary,
            input: options.input,
            resources: options.resources,
            reviewBundles,
            trace,
            warnings,
        })
    }

    let plan: RuntimePlanArtifact
    try {
        if (!executionBudget.claim('plan')) throw new Error('Delivery Chain plan budget exceeded.')
        emit(options, { status: 'running', stepId: 'delegate-plan', summary: 'Plan Worker 正在生成结构化方案。' })
        const draft = await workerTools.execute({
            subagentId: 'plan-subagent',
            invocation: {
                businessModel: options.modelSet.subagents['plan-subagent']!.handle.model,
                normalizeError: options.modelSet.subagents['plan-subagent']!.handle.normalizeError,
                onBusinessInvoke,
                onContractInvoke,
                messages: createMessages('Plan Worker', ['创建一个包含需求和验收标准的有范围的实现方案。'], options.resources, [], {
                    label: 'Plan',
                    text: options.resources.planRubricText,
                }),
                contractModel: toModel(options.modelSet.subagents['plan-subagent']!.contractHandle),
                name: 'delivery_chain_plan',
                schema: planArtifactDraftSchema,
            },
        })
        plan = createRuntimePlanArtifact(draft)
        artifacts.push(plan)
        emit(options, { status: 'completed', stepId: 'delegate-plan', summary: 'Plan Worker 已完成。' })
    } catch (error) {
        const failure = describeStageFailure('Plan Worker', error, options.modelSet.subagents['plan-subagent']!.handle.normalizeError)
        emit(options, {
            failureMessage: failure.progressMessage,
            status: 'failed',
            stepId: 'delegate-plan',
            summary: failure.summary,
        })
        return createFailure({
            artifacts,
            failureMessage: failure.failureMessage,
            input: options.input,
            resources: options.resources,
            reviewBundles,
            trace,
            warnings,
        })
    }

    let task: RuntimeTaskArtifact
    try {
        if (!executionBudget.claim('tasks')) throw new Error('Delivery Chain task budget exceeded.')
        emit(options, { status: 'running', stepId: 'delegate-task', summary: 'Task Worker 正在生成结构化任务。' })
        const draft = await workerTools.execute({
            subagentId: 'task-subagent',
            invocation: {
                businessModel: options.modelSet.subagents['task-subagent']!.handle.model,
                normalizeError: options.modelSet.subagents['task-subagent']!.handle.normalizeError,
                onBusinessInvoke,
                onContractInvoke,
                messages: createMessages('Task Worker', ['根据提供的 Plan artifact 创建可执行的任务。'], options.resources, [plan], {
                    label: 'Task',
                    text: options.resources.taskRubricText,
                }),
                contractModel: toModel(options.modelSet.subagents['task-subagent']!.contractHandle),
                name: 'delivery_chain_tasks',
                schema: taskArtifactDraftSchema,
            },
        })
        task = createRuntimeTaskArtifact(draft, plan)
        artifacts.push(task)
        emit(options, { status: 'completed', stepId: 'delegate-task', summary: 'Task Worker 已完成。' })
    } catch (error) {
        const failure = describeStageFailure('Task Worker', error, options.modelSet.subagents['task-subagent']!.handle.normalizeError)
        emit(options, {
            failureMessage: failure.progressMessage,
            status: 'failed',
            stepId: 'delegate-task',
            summary: failure.summary,
        })
        return createFailure({
            artifacts,
            failureMessage: failure.failureMessage,
            input: options.input,
            resources: options.resources,
            reviewBundles,
            trace,
            warnings,
        })
    }

    emit(options, { status: 'running', stepId: 'delegate-review-group', summary: 'Runtime 正在启动固定 Review Group。' })
    if (!executionBudget.claim('reviewCycles')) throw new Error('Delivery Chain review-cycle budget exceeded.')
    const firstReview = await runReviewCycle({
        artifacts,
        modelSet: options.modelSet,
        onBusinessInvoke,
        onContractInvoke,
        resources: options.resources,
        signal: options.signal,
        trace,
        workerTools,
    })
    artifacts.push(...firstReview.artifacts)
    reviewBundles.push(firstReview.bundle)
    let runStatus = resolveStructuredReviewStatus(firstReview.bundle)
    let revisionOutcome: RevisionOutcome | undefined
    emit(options, {
        status: runStatus === 'failed' ? 'failed' : 'completed',
        stepId: 'delegate-review-group',
        summary: `Review Group 完成：${runStatus}`,
    })

    if (
        runStatus !== 'failed' &&
        runStatus !== 'blocked' &&
        Object.values(firstReview.bundle.coverage).every(state => state === 'completed')
    ) {
        try {
            emit(options, { status: 'running', stepId: 'supervisor-post-decision', summary: 'Supervisor 正在处理评审反馈。' })
            if (!executionBudget.claim('postReviewDecision')) throw new Error('Delivery Chain post-review budget exceeded.')
            let postReviewGuidance: SupervisorPostReviewGuidanceDraft | undefined
            try {
                postReviewGuidance = await invokeBusinessAgentContract({
                    businessModel: options.modelSet.manager.handle.model,
                    onBusinessInvoke,
                    onContractInvoke,
                    messages: [
                        ...createMessages(
                            'Supervisor',
                            [
                                '根据提供的评审证据，归纳返修理由、优先事项和验收建议。',
                                '不要选择最终运行动作，不要输出 finding ID、RevisionRequest 或返修目标集合；Runtime 会根据已验证 finding 确定是否返修及返修范围。',
                            ],
                            options.resources,
                            [...artifacts]
                        ),
                        new HumanMessage(
                            `运行时评审证据：${JSON.stringify(
                                firstReview.bundle.findings.map(finding => ({
                                    description: finding.description,
                                    requirement: finding.requirement,
                                    severity: finding.severity,
                                    suggestedAction: finding.suggestedAction,
                                    targetArtifacts: finding.targetArtifacts,
                                }))
                            )}`
                        ),
                    ],
                    model: toModel(options.modelSet.manager.contractHandle),
                    name: 'delivery_chain_supervisor_post',
                    schema: supervisorPostReviewGuidanceDraftSchema,
                    signal: options.signal,
                })
            } catch {
                warnings.push('Supervisor 评审后说明未完成，Runtime 已根据已验证的评审发现继续处理。')
            }
            const postReviewDecision = derivePostReviewDecision(firstReview.bundle, postReviewGuidance)
            dispatchPlan.postReviewDecision = postReviewDecision
            emit(options, {
                status: 'completed',
                stepId: 'supervisor-post-decision',
                summary: postReviewGuidance
                    ? `Runtime 已确定后续动作：${postReviewDecision.action}`
                    : `Supervisor 说明未完成，Runtime 已确定后续动作：${postReviewDecision.action}`,
            })
            if (postReviewDecision.action === 'revise' && runStatus === 'needs_changes') {
                if (!executionBudget.claim('revisionCycles')) throw new Error('Delivery Chain revision budget exceeded.')
                if (postReviewDecision.revisionTargets.includes('plan')) {
                    if (!executionBudget.claim('planRevision')) throw new Error('Delivery Chain plan revision budget exceeded.')
                    emit(options, { status: 'running', stepId: 'revise-plan', summary: 'Plan Worker 正在处理已验证的 Review finding。' })
                    const revisedPlan = await workerTools.execute({
                        subagentId: 'plan-subagent',
                        invocation: {
                            businessModel: options.modelSet.subagents['plan-subagent']!.handle.model,
                            normalizeError: options.modelSet.subagents['plan-subagent']!.handle.normalizeError,
                            onBusinessInvoke,
                            onContractInvoke,
                            messages: [
                                ...createMessages(
                                    'Plan Revision Worker',
                                    ['仅根据已验证的 Revision Context 修订提供的 Plan。'],
                                    options.resources,
                                    [plan],
                                    { label: 'Plan', text: options.resources.planRubricText }
                                ),
                                createRevisionWorkerContext({
                                    findings: firstReview.bundle.findings,
                                    requests: postReviewDecision.requests,
                                    target: 'plan',
                                }),
                            ],
                            contractModel: toModel(options.modelSet.subagents['plan-subagent']!.contractHandle),
                            name: 'delivery_chain_plan_revision',
                            schema: planArtifactDraftSchema,
                        },
                    })
                    plan = reviseRuntimePlanArtifact(plan, revisedPlan)
                    artifacts.push(plan)
                    emit(options, { status: 'completed', stepId: 'revise-plan', summary: 'Plan Worker 已完成返修。' })
                }
                if (postReviewDecision.revisionTargets.includes('tasks')) {
                    if (!executionBudget.claim('taskRevision')) throw new Error('Delivery Chain task revision budget exceeded.')
                    emit(options, { status: 'running', stepId: 'revise-tasks', summary: 'Task Worker 正在处理已验证的 Review finding。' })
                    const revisedTasks = await workerTools.execute({
                        subagentId: 'task-subagent',
                        invocation: {
                            businessModel: options.modelSet.subagents['task-subagent']!.handle.model,
                            normalizeError: options.modelSet.subagents['task-subagent']!.handle.normalizeError,
                            onBusinessInvoke,
                            onContractInvoke,
                            messages: [
                                ...createMessages(
                                    'Task Revision Worker',
                                    ['仅根据已验证的 Revision Context 修订提供的 Tasks。'],
                                    options.resources,
                                    [plan, task],
                                    { label: 'Task', text: options.resources.taskRubricText }
                                ),
                                createRevisionWorkerContext({
                                    findings: firstReview.bundle.findings,
                                    requests: postReviewDecision.requests,
                                    target: 'tasks',
                                }),
                            ],
                            contractModel: toModel(options.modelSet.subagents['task-subagent']!.contractHandle),
                            name: 'delivery_chain_task_revision',
                            schema: taskArtifactDraftSchema,
                        },
                    })
                    task = reviseRuntimeTaskArtifact(task, revisedTasks, plan)
                    artifacts.push(task)
                    emit(options, { status: 'completed', stepId: 'revise-tasks', summary: 'Task Worker 已完成返修。' })
                }
                revisionOutcome = {
                    requests: postReviewDecision.requests.map(request => ({
                        artifactRefs: request.targets.map(target => {
                            const artifact = target === 'plan' ? plan : task
                            if (artifact.revision !== 2) throw new Error(`Revision outcome is missing ${target}@2.`)
                            return { artifactId: artifact.artifactId, revision: 2, target }
                        }),
                        outcomeSummary: request.summary,
                        requestKey: request.requestKey,
                        sourceFindingIds: request.sourceFindingIds,
                        updatedTargets: request.targets,
                    })),
                    revisionSequence: 1,
                }
                // 本版本在一次受控返修后结束；没有独立复评时不得宣称通过。
                runStatus = 'needs_review'
            }
        } catch (error) {
            const failure = describeStageFailure('Supervisor post-review', error, options.modelSet.manager.handle.normalizeError)
            emit(options, {
                failureMessage: failure.progressMessage,
                status: 'failed',
                stepId: 'supervisor-post-decision',
                summary: failure.summary,
            })
            return createFailure({
                artifacts,
                failureMessage: failure.failureMessage,
                input: options.input,
                resources: options.resources,
                reviewBundles,
                trace,
                warnings,
            })
        }
    }

    emit(options, { status: 'running', stepId: 'synthesize-report', summary: 'Runtime 正在基于结构化事实生成报告。' })
    const reportMarkdown = buildStructuredDeliveryManagerReport({
        dispatchPlan,
        input: options.input,
        plan,
        resources: options.resources,
        revisionOutcome,
        reviewBundles,
        runStatus,
        task,
        warnings,
    })
    const deliveryReportArtifact = createRuntimeArtifact({
        kind: 'delivery_report',
        markdown: reportMarkdown,
        source: { stage: 'manager-synthesis' },
        title: 'Delivery Chain Report',
    })
    emit(options, { status: 'completed', stepId: 'synthesize-report', summary: 'Delivery Chain Report 已生成。' })
    return {
        artifacts: [...artifacts, deliveryReportArtifact],
        deliveryReportArtifact,
        dispatchPlan,
        invocationMetrics,
        reportMarkdown,
        revisionOutcome,
        reviewBundles,
        runStatus,
        status: toStatus(runStatus),
        trace,
        warnings,
    }
}
