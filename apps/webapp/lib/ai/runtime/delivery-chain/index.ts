import { writeStaticTextPart } from '@ai-mind/stream-core'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { type BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { END, START, StateGraph } from '@langchain/langgraph'

import { createId } from '@/lib/ai/create-id'
import { PROJECT_DOCS_SERVER_ID } from '@/lib/ai/mcp/adapters/docs-resource-shared'
import { projectDocsResourceAdapter } from '@/lib/ai/mcp/adapters/project-docs-resource-adapter'
import type { ChatComposerReference, ChatRequest } from '@/lib/ai/types/chat'

import type { ChatExecutionContext, WriteChunk } from '../types'
import {
    createInitialDeliveryChainGraphState,
    DeliveryChainGraphStateAnnotation,
    type DeliveryChainGraphStateAnnotationState,
    type DeliveryChainInput,
    type DeliveryChainResourceBundle,
    type DeliveryChainStageResult,
} from './graph-state'

const DELIVERY_CHAIN_COMMAND_NAME = 'delivery-chain'
const VERSION_PLAN_REFERENCE_PATTERN = /^demo:\/\/version-plans\/[^/\\]+\.md$/i
const LEGACY_VERSION_PLAN_REFERENCE_PATTERN = /^(docs|demo):\/\/versions\/[^/\\]+\.md$/i
const DELIVERY_CHAIN_SCENARIO_ENTRY_PATTERN = /^demo:\/\/scenarios\/([^/\\]+)\/requirement\.md$/i
const DELIVERY_CHAIN_SCENARIO_NON_ENTRY_PATTERN =
    /^demo:\/\/scenarios\/([^/\\]+)\/(context|plan\.sample|tasks\.sample|review\.expected)\.md$/i
const FORBIDDEN_SCHEME_PATTERN = /^@?(docs|specs|file):\/\//i
const MIN_INLINE_REQUIREMENT_CHARS = 24

const PLAN_RUBRIC_FALLBACK = `- 明确需求目标与非目标
- 说明资源边界、兼容性和约束
- 给出最小实现路径与风险`

const TASK_RUBRIC_FALLBACK = `- 任务按依赖顺序拆解
- 标出高风险任务与验收任务
- 包含保护非目标的检查项`

const REVIEW_RUBRIC_FALLBACK = `- 检查需求覆盖、范围漂移和非目标
- 判断 plan 与 task 是否一致
- 给出 pass / needs_changes / blocked 结论`

const GOVERNANCE_FALLBACK = `- 只读取 @demo:// 公开 demo 资源
- 不读取真实项目目录，不写真实代码文件
- 不引入 nested HITL、artifact persistence 或 DB schema 变更`

export const DELIVERY_CHAIN_GRAPH_NODE_IDS = {
    buildDeliveryChainReport: 'buildDeliveryChainReport',
    loadDeliveryChainContext: 'loadDeliveryChainContext',
    runPlanStage: 'runPlanStage',
    runReviewStage: 'runReviewStage',
    runTaskStage: 'runTaskStage',
} as const

type DeliveryChainGraphNodeId = (typeof DELIVERY_CHAIN_GRAPH_NODE_IDS)[keyof typeof DELIVERY_CHAIN_GRAPH_NODE_IDS]
type DeliveryChainWorkflowStepId = 'load' | 'plan' | 'report' | 'review' | 'task'

interface DeliveryChainWorkflowStepDefinition {
    details: string[]
    runningSummary: string
    stepId: DeliveryChainWorkflowStepId
    title: string
}

interface DeliveryChainWorkflowProgressRuntime {
    partId: string
    startedAt: number
    stepStartedAt: Partial<Record<DeliveryChainWorkflowStepId, number>>
    workflowId: string
}

const DELIVERY_CHAIN_WORKFLOW_KIND = 'delivery-chain'
const DELIVERY_CHAIN_INTERNAL_RESOURCE_COUNT = 5
const DELIVERY_CHAIN_WORKFLOW_STEPS: Record<DeliveryChainGraphNodeId, DeliveryChainWorkflowStepDefinition> = {
    buildDeliveryChainReport: {
        details: ['汇总并生成最终报告'],
        runningSummary: '开始生成交付计划报告',
        stepId: 'report',
        title: '生成交付计划报告',
    },
    loadDeliveryChainContext: {
        details: ['包含需求、场景上下文、评审规则和治理规则'],
        runningSummary: '开始读取上下文',
        stepId: 'load',
        title: '读取上下文',
    },
    runPlanStage: {
        details: ['调用模型：生成方案 (plan)'],
        runningSummary: '开始方案规划',
        stepId: 'plan',
        title: '方案规划',
    },
    runReviewStage: {
        details: ['调用模型：交付评审 (review)'],
        runningSummary: '开始交付评审',
        stepId: 'review',
        title: '交付评审',
    },
    runTaskStage: {
        details: ['调用模型：拆解任务 (tasks)'],
        runningSummary: '开始任务拆解',
        stepId: 'task',
        title: '任务拆解',
    },
}

type DeliveryChainInvocation =
    | {
          inlineRequirementText?: string
          kind: 'ready-scenario'
          requirementReference: ChatComposerReference
          scenarioId: string
      }
    | {
          kind: 'ready-inline'
          requirementText: string
      }
    | {
          kind: 'missing-input'
      }
    | {
          kind: 'forbidden-resource'
          reference: ChatComposerReference
      }
    | {
          kind: 'invalid-local-resource'
          reference: ChatComposerReference
      }
    | {
          kind: 'legacy-version-plan'
          reference: ChatComposerReference
      }
    | {
          kind: 'scenario-non-entry'
          expectedUri: string
          reference: ChatComposerReference
      }
    | {
          kind: 'version-plan-resource'
          reference: ChatComposerReference
      }

interface StartDeliveryChainRunOptions {
    context: ChatExecutionContext
    model: BaseChatModel
    request: ChatRequest
    writeChunk: WriteChunk
}

interface DeliveryChainGraphRuntime {
    context: ChatExecutionContext
    model: BaseChatModel
    workflowProgress?: DeliveryChainWorkflowProgressRuntime
    writeChunk: WriteChunk
}

interface RunDeliveryChainGraphOptions extends DeliveryChainGraphRuntime {
    input: DeliveryChainInput
}

function getLastUserMessageText(request: ChatRequest) {
    for (let index = request.messages.length - 1; index >= 0; index -= 1) {
        const message = request.messages[index]

        if (message.role !== 'user') {
            continue
        }

        return message.parts
            .map(part => ('text' in part ? part.text : ''))
            .join('\n')
            .trim()
    }

    return ''
}

function normalizeReferenceUri(uri: string) {
    return uri.trim().replace(/^@/, '')
}

function isLocalResourceReference(reference: ChatComposerReference) {
    return reference.type === 'resource' && reference.source === 'local'
}

function getInlineRequirementText(request: ChatRequest) {
    const composerText = request.composer?.plainText.trim()

    if (composerText) {
        return composerText
    }

    return getLastUserMessageText(request)
}

function toNormalizedReference(reference: ChatComposerReference) {
    return {
        ...reference,
        uri: normalizeReferenceUri(reference.uri),
    }
}

function getPrimaryComposerReference(request: ChatRequest) {
    return request.composer?.references?.[0]
}

function extractModelText(content: BaseMessage['content']) {
    if (typeof content === 'string') {
        return content.trim()
    }

    return content
        .map(part => {
            if (typeof part === 'string') {
                return part
            }

            if ('text' in part && typeof part.text === 'string') {
                return part.text
            }

            return ''
        })
        .join('\n')
        .trim()
}

function createStageFallbackText(title: string) {
    return `## ${title}\n\n- 当前阶段未返回有效内容，请人工补充。`
}

function createReviewStageFallbackText() {
    return ['结论: needs_changes', '', createStageFallbackText('交付评审')].join('\n')
}

function createGraphNodeUpdate(nodeId: DeliveryChainGraphNodeId) {
    return {
        visitedNodes: [nodeId],
    }
}

function createStageFailureWarning(stageLabel: string) {
    return `${stageLabel} 调用失败，已使用保底文本继续生成交付计划报告。`
}

function createDeliveryChainGraphInput(
    invocation: Extract<DeliveryChainInvocation, { kind: 'ready-inline' | 'ready-scenario' }>
): DeliveryChainInput {
    if (invocation.kind === 'ready-inline') {
        return {
            requirementText: invocation.requirementText,
            source: 'inline_requirement',
        }
    }

    return {
        inlineRequirementText: invocation.inlineRequirementText,
        requirementRef: invocation.requirementReference.uri,
        scenarioId: invocation.scenarioId,
        source: 'demo_scenario',
    }
}

function createDeliveryChainWorkflowProgressRuntime(): DeliveryChainWorkflowProgressRuntime {
    return {
        partId: createId(),
        startedAt: Date.now(),
        stepStartedAt: {},
        workflowId: `delivery-chain:${createId()}`,
    }
}

function getWorkflowStepDefinition(nodeId: DeliveryChainGraphNodeId) {
    return DELIVERY_CHAIN_WORKFLOW_STEPS[nodeId]
}

function buildWorkflowStepDetails(
    nodeId: DeliveryChainGraphNodeId,
    state: DeliveryChainGraphStateAnnotationState | { input: DeliveryChainInput; resources: DeliveryChainResourceBundle }
) {
    const definition = getWorkflowStepDefinition(nodeId)

    if (nodeId !== DELIVERY_CHAIN_GRAPH_NODE_IDS.loadDeliveryChainContext) {
        return definition.details
    }

    const details = [...definition.details]

    if (state.input.source === 'demo_scenario') {
        details.push(`读取文件：${state.input.scenarioId}/requirement.md`)

        if (state.resources.contextText) {
            details.push('读取文件：context.md')
        }
    } else {
        details.push('读取输入：inline requirement')
    }

    details.push('读取规则：plan-rubric.md、task-rubric.md、review-rubric.md')
    details.push('读取治理：delivery-boundaries.md、engineering-rules.md')

    return details
}

function buildWorkflowStepCompletedSummary(nodeId: DeliveryChainGraphNodeId, state: DeliveryChainGraphStateAnnotationState) {
    switch (nodeId) {
        case DELIVERY_CHAIN_GRAPH_NODE_IDS.loadDeliveryChainContext: {
            const resourceCount = DELIVERY_CHAIN_INTERNAL_RESOURCE_COUNT + (state.resources?.contextText ? 1 : 0)

            return `已读取 demo 上下文 ${resourceCount} 项`
        }
        case DELIVERY_CHAIN_GRAPH_NODE_IDS.runPlanStage:
            return '已完成方案规划'
        case DELIVERY_CHAIN_GRAPH_NODE_IDS.runTaskStage:
            return '已完成任务拆解'
        case DELIVERY_CHAIN_GRAPH_NODE_IDS.runReviewStage:
            return '已完成交付评审'
        case DELIVERY_CHAIN_GRAPH_NODE_IDS.buildDeliveryChainReport:
            return '已生成交付计划报告'
    }
}

function buildWorkflowStepFailureMessage(nodeId: DeliveryChainGraphNodeId) {
    const { title } = getWorkflowStepDefinition(nodeId)

    if (nodeId === DELIVERY_CHAIN_GRAPH_NODE_IDS.loadDeliveryChainContext) {
        return `${title}未完成，当前交付计划已安全停止。`
    }

    return `${title}未完成，已使用安全保底内容继续。`
}

function emitWorkflowProgressStart(runtime: DeliveryChainGraphRuntime) {
    if (!runtime.workflowProgress) {
        return
    }

    runtime.writeChunk({
        partId: runtime.workflowProgress.partId,
        startedAt: runtime.workflowProgress.startedAt,
        title: '正在生成交付计划...',
        type: 'workflow-progress-start',
        workflowId: runtime.workflowProgress.workflowId,
        workflowKind: DELIVERY_CHAIN_WORKFLOW_KIND,
    })
}

function emitWorkflowProgressStep(
    runtime: DeliveryChainGraphRuntime,
    nodeId: DeliveryChainGraphNodeId,
    status: 'completed' | 'failed' | 'running',
    overrides?: {
        details?: string[]
        failureMessage?: string
        summary?: string
    }
) {
    if (!runtime.workflowProgress) {
        return
    }

    const definition = getWorkflowStepDefinition(nodeId)

    if (status === 'running') {
        const startedAt = Date.now()

        runtime.workflowProgress.stepStartedAt[definition.stepId] = startedAt

        runtime.writeChunk({
            details: overrides?.details ?? definition.details,
            partId: runtime.workflowProgress.partId,
            startedAt,
            status,
            stepId: definition.stepId,
            summary: overrides?.summary ?? definition.runningSummary,
            title: definition.title,
            type: 'workflow-progress-step',
            workflowId: runtime.workflowProgress.workflowId,
        })
        return
    }

    const endedAt = Date.now()
    const startedAt = runtime.workflowProgress.stepStartedAt[definition.stepId]
    const durationMs = typeof startedAt === 'number' ? endedAt - startedAt : undefined

    runtime.writeChunk({
        details: overrides?.details ?? definition.details,
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(startedAt !== undefined ? { startedAt } : {}),
        endedAt,
        ...(overrides?.failureMessage ? { failureMessage: overrides.failureMessage } : {}),
        partId: runtime.workflowProgress.partId,
        status,
        stepId: definition.stepId,
        ...(overrides?.summary ? { summary: overrides.summary } : {}),
        title: definition.title,
        type: 'workflow-progress-step',
        workflowId: runtime.workflowProgress.workflowId,
    })
}

function emitWorkflowProgressEnd(
    runtime: DeliveryChainGraphRuntime,
    status: 'completed' | 'failed',
    summary?: string,
    failureMessage?: string
) {
    if (!runtime.workflowProgress) {
        return
    }

    const endedAt = Date.now()

    runtime.writeChunk({
        durationMs: endedAt - runtime.workflowProgress.startedAt,
        endedAt,
        ...(failureMessage ? { failureMessage } : {}),
        partId: runtime.workflowProgress.partId,
        status,
        ...(summary ? { summary } : {}),
        type: 'workflow-progress-end',
        workflowId: runtime.workflowProgress.workflowId,
    })
}

async function readDemoResource(options: {
    context: ChatExecutionContext
    fallbackText?: string
    label: string
    optional?: boolean
    uri: string
    warnings: string[]
    writeChunk: WriteChunk
}) {
    const partId = createId()

    options.writeChunk({
        type: 'resource-start',
        partId,
        location: 'local',
        resourceName: options.label,
        serverId: PROJECT_DOCS_SERVER_ID,
        source: 'mcp',
        uri: options.uri,
    })

    try {
        const resource = await projectDocsResourceAdapter.read({
            uri: options.uri,
        })

        options.writeChunk({
            type: 'resource-end',
            partId,
            contentPreview: resource.contentPreview,
            isTruncated: resource.truncated,
            location: 'local',
            previewChars: resource.previewChars,
            resourceName: resource.resourceName,
            serverId: resource.serverId,
            source: 'mcp',
            uri: resource.uri,
        })

        return resource.content
    } catch (error) {
        const message = error instanceof Error ? error.message : 'demo resource 读取失败。'

        if (!options.optional) {
            throw new Error(`${options.label} 读取失败：${message}`)
        }

        options.warnings.push(`${options.label} 读取失败，已降级为内置规则。`)

        return options.fallbackText ?? null
    }
}

function buildScenarioContextUri(scenarioId: string) {
    return `demo://scenarios/${scenarioId}/context.md`
}

async function loadDeliveryChainContext(
    input: DeliveryChainInput,
    options: Pick<DeliveryChainGraphRuntime, 'context' | 'writeChunk'>
): Promise<DeliveryChainResourceBundle> {
    const warnings: string[] = []
    const planRubricText =
        (await readDemoResource({
            context: options.context,
            fallbackText: PLAN_RUBRIC_FALLBACK,
            label: 'plan-rubric.md',
            optional: true,
            uri: 'demo://rubrics/plan-rubric.md',
            warnings,
            writeChunk: options.writeChunk,
        })) ?? PLAN_RUBRIC_FALLBACK
    const taskRubricText =
        (await readDemoResource({
            context: options.context,
            fallbackText: TASK_RUBRIC_FALLBACK,
            label: 'task-rubric.md',
            optional: true,
            uri: 'demo://rubrics/task-rubric.md',
            warnings,
            writeChunk: options.writeChunk,
        })) ?? TASK_RUBRIC_FALLBACK
    const reviewRubricText =
        (await readDemoResource({
            context: options.context,
            fallbackText: REVIEW_RUBRIC_FALLBACK,
            label: 'review-rubric.md',
            optional: true,
            uri: 'demo://rubrics/review-rubric.md',
            warnings,
            writeChunk: options.writeChunk,
        })) ?? REVIEW_RUBRIC_FALLBACK
    const deliveryBoundariesText =
        (await readDemoResource({
            context: options.context,
            fallbackText: GOVERNANCE_FALLBACK,
            label: 'delivery-boundaries.md',
            optional: true,
            uri: 'demo://governance/delivery-boundaries.md',
            warnings,
            writeChunk: options.writeChunk,
        })) ?? GOVERNANCE_FALLBACK
    const engineeringRulesText =
        (await readDemoResource({
            context: options.context,
            fallbackText: GOVERNANCE_FALLBACK,
            label: 'engineering-rules.md',
            optional: true,
            uri: 'demo://governance/engineering-rules.md',
            warnings,
            writeChunk: options.writeChunk,
        })) ?? GOVERNANCE_FALLBACK

    if (input.source === 'inline_requirement') {
        if (input.requirementText.length < MIN_INLINE_REQUIREMENT_CHARS) {
            warnings.push('输入需求较短，以下结果会带默认假设和待补充信息。')
        }

        return {
            governanceText: [deliveryBoundariesText, engineeringRulesText].join('\n\n'),
            planRubricText,
            requirementText: input.requirementText,
            reviewRubricText,
            sourceRefs: [],
            taskRubricText,
            warnings,
        }
    }

    const requirementText = await readDemoResource({
        context: options.context,
        label: `${input.scenarioId}/requirement.md`,
        uri: input.requirementRef,
        warnings,
        writeChunk: options.writeChunk,
    })

    const contextText = await readDemoResource({
        context: options.context,
        label: `${input.scenarioId}/context.md`,
        optional: true,
        uri: buildScenarioContextUri(input.scenarioId),
        warnings,
        writeChunk: options.writeChunk,
    })

    if (!contextText) {
        warnings.push(`scenario ${input.scenarioId} 缺少 context.md，以下结果按 requirement-only 生成。`)
    }

    return {
        contextText: contextText ?? undefined,
        governanceText: [deliveryBoundariesText, engineeringRulesText].join('\n\n'),
        inlineRequirementText: input.inlineRequirementText,
        planRubricText,
        requirementText,
        reviewRubricText,
        scenarioId: input.scenarioId,
        sourceRefs: [input.requirementRef, ...(contextText ? [buildScenarioContextUri(input.scenarioId)] : [])],
        taskRubricText,
        warnings,
    }
}

function createSharedStageContext(resources: DeliveryChainResourceBundle, warnings: string[]) {
    return [
        '你正在 AI Mind 的 Controlled Delivery Chain MVP 中工作。',
        '只允许基于本轮提供的 requirement、context、rubric 和 governance 生成中文 Markdown。',
        '不要声称读取了真实 docs/specs/apps/packages，也不要写代码、PR、数据库或文件。',
        '不要引入 multi-agent、nested HITL、artifact persistence、@artifact:// 或 chat persistence。',
        `输入来源：${resources.scenarioId ? `demo scenario ${resources.scenarioId}` : 'inline requirement'}`,
        resources.sourceRefs.length > 0 ? `来源引用：${resources.sourceRefs.join(', ')}` : '来源引用：无，仅使用用户输入。',
        `治理边界：\n${resources.governanceText}`,
        resources.contextText ? `补充上下文：\n${resources.contextText}` : '补充上下文：无，请明确标注默认假设。',
        resources.inlineRequirementText ? `用户补充说明：\n${resources.inlineRequirementText}` : '',
        warnings.length > 0 ? `已知警告：\n- ${warnings.join('\n- ')}` : '',
        `原始需求：\n${resources.requirementText}`,
    ]
        .filter(Boolean)
        .join('\n\n')
}

function buildPlanStageMessages(resources: DeliveryChainResourceBundle, warnings: string[]) {
    return [
        new SystemMessage('你是 Delivery Chain 的 PlanStage。输出必须简洁、具体、面向实施边界。'),
        new HumanMessage(
            [
                createSharedStageContext(resources, warnings),
                `Plan Rubric：\n${resources.planRubricText}`,
                '请输出以下 Markdown 小节：',
                '## 需求理解',
                '## 实现方案',
                '## 涉及模块',
                '## 非目标',
                '## 风险',
                '## 验收标准建议',
            ].join('\n\n')
        ),
    ]
}

function buildTaskStageMessages(resources: DeliveryChainResourceBundle, planMarkdown: string, warnings: string[]) {
    return [
        new SystemMessage('你是 Delivery Chain 的 TaskStage。只做受控任务拆解，不调用 Tasklist Agent Graph。'),
        new HumanMessage(
            [
                createSharedStageContext(resources, warnings),
                `PlanStage 输出：\n${planMarkdown}`,
                `Task Rubric：\n${resources.taskRubricText}`,
                '请输出以下 Markdown 小节：',
                '## 任务拆解',
                '## 推荐顺序',
                '## 风险任务',
                '## 验收相关任务',
                '## 非目标保护任务',
            ].join('\n\n')
        ),
    ]
}

function buildReviewStageMessages(resources: DeliveryChainResourceBundle, planMarkdown: string, taskMarkdown: string, warnings: string[]) {
    return [
        new SystemMessage('你是 Delivery Chain 的 ReviewStage。只做交付评审，不做真实代码 review，也不修改 plan/task。'),
        new HumanMessage(
            [
                createSharedStageContext(resources, warnings),
                `PlanStage 输出：\n${planMarkdown}`,
                `TaskStage 输出：\n${taskMarkdown}`,
                `Review Rubric：\n${resources.reviewRubricText}`,
                '请先输出一行 `结论: pass|needs_changes|blocked`，再输出以下 Markdown 小节：',
                '## 覆盖检查',
                '## 一致性检查',
                '## 范围漂移检查',
                '## 风险与下一步建议',
            ].join('\n\n')
        ),
    ]
}

async function invokeStageMarkdown(model: BaseChatModel, messages: BaseMessage[], signal?: AbortSignal) {
    const response = await model.invoke(messages, {
        signal,
    })

    return extractModelText(response.content)
}

function extractReviewDisposition(reviewMarkdown: string) {
    const match = reviewMarkdown.match(/结论:\s*(pass|needs_changes|blocked)/i)

    return (match?.[1]?.toLowerCase() as 'blocked' | 'needs_changes' | 'pass' | undefined) ?? 'needs_changes'
}

function buildAssumptions(options: { input: DeliveryChainInput; resources: DeliveryChainResourceBundle; warnings: string[] }) {
    const assumptions = ['本轮只基于公开 demo 资源与用户输入生成规划，不读取真实项目目录，也不直接写代码文件。']

    if (!options.resources.contextText) {
        assumptions.push('由于缺少独立 context.md 或真实项目上下文，模块和接口判断以需求文本的最小可行理解为准。')
    }

    if (options.input.source === 'inline_requirement' && options.input.requirementText.length < MIN_INLINE_REQUIREMENT_CHARS) {
        assumptions.push('当前 inline requirement 较短，以下方案包含默认假设，后续需要补充范围、环境和验收细节。')
    }

    for (const warning of options.warnings) {
        assumptions.push(warning)
    }

    return assumptions
}

function buildRisks(options: {
    input: DeliveryChainInput
    resources: DeliveryChainResourceBundle
    reviewDisposition: 'blocked' | 'needs_changes' | 'pass'
}) {
    const risks = [
        `当前评审结论为 \`${options.reviewDisposition}\`，说明链路输出仍需人工确认后再进入后续实施。`,
        '本版本是 public demo 规划链路，不包含真实代码验证、真实仓库读取或源码级 review。',
    ]

    if (options.input.source === 'inline_requirement') {
        risks.push('inline requirement 缺少真实模块地图和接口契约时，任务顺序与边界判断可能偏保守。')
    }

    if (!options.resources.contextText) {
        risks.push('缺少 context.md 会降低对模块边界和兼容性风险的判断精度。')
    }

    return risks
}

function buildNonGoals() {
    return [
        '不写真实代码文件，不生成真实 PR，不读取真实 docs/specs/apps/packages/private-folder。',
        '不引入 /plan、/task、/review public command，不做 nested HITL、artifact persistence 或数据库变更。',
        '不把本次报告视为已完成交付结果，它只是受控规划与评审输出。',
    ]
}

function buildNextSteps(options: {
    input: DeliveryChainInput
    resources: DeliveryChainResourceBundle
    reviewDisposition: 'blocked' | 'needs_changes' | 'pass'
}) {
    const nextSteps = [`先确认当前评审结论 \`${options.reviewDisposition}\` 是否满足预期，再决定是否进入后续实施。`]

    if (options.input.source === 'demo_scenario') {
        nextSteps.push('可将本报告与同 scenario 下的 sample artifacts 对照，检查 plan/task/review 口径是否一致。')
    } else {
        nextSteps.push('建议补充真实模块范围、接口契约和 acceptance 细节后，再继续进入实现讨论。')
    }

    nextSteps.push('如需 public demo 的版本任务清单能力，请改用 `/tasklist + @demo://version-plans/*.md`。')

    return nextSteps
}

function buildFailureReport(state: DeliveryChainGraphStateAnnotationState) {
    const sourceSummary = state.input.source === 'demo_scenario' ? `demo scenario：\`${state.input.scenarioId}\`` : 'inline requirement'
    const sourceRefs = state.resources?.sourceRefs ?? (state.input.source === 'demo_scenario' ? [state.input.requirementRef] : [])
    const warnings = state.warnings.length > 0 ? state.warnings : ['当前交付链路在资源或阶段执行时提前停止。']

    return [
        '# Delivery Chain Report / 交付计划报告',
        '',
        '> 本轮交付计划未能完整生成，以下为安全失败摘要，不会读取真实项目目录，也不会修改代码或数据库。',
        '',
        '## 输入来源',
        `- 来源类型：${sourceSummary}`,
        sourceRefs.length > 0 ? `- 资源引用：${sourceRefs.join('、')}` : '- 资源引用：无，仅使用用户输入文本。',
        '',
        '## 失败摘要',
        `- ${state.failureMessage ?? '当前 graph 执行未完成，请稍后重试。'}`,
        '',
        '## 已知警告',
        ...warnings.map(warning => `- ${warning}`),
        '',
        '## 下一步建议',
        '- 先确认 demo scenario 入口资源是否完整，或改为直接输入更完整的需求文本。',
        '- 如需版本任务清单，请改用 `/tasklist + @demo://version-plans/*.md`。',
    ].join('\n')
}

function buildReport(options: {
    input: DeliveryChainInput
    planStage: DeliveryChainStageResult
    resources: DeliveryChainResourceBundle
    reviewDisposition: 'blocked' | 'needs_changes' | 'pass'
    reviewStage: DeliveryChainStageResult
    taskStage: DeliveryChainStageResult
    warnings: string[]
}) {
    const assumptions = buildAssumptions({
        input: options.input,
        resources: options.resources,
        warnings: options.warnings,
    })
    const risks = buildRisks({
        input: options.input,
        resources: options.resources,
        reviewDisposition: options.reviewDisposition,
    })
    const nonGoals = buildNonGoals()
    const nextSteps = buildNextSteps({
        input: options.input,
        resources: options.resources,
        reviewDisposition: options.reviewDisposition,
    })
    const sourceSummary = options.input.source === 'demo_scenario' ? `demo scenario：\`${options.input.scenarioId}\`` : 'inline requirement'

    return [
        '# Delivery Chain Report / 交付计划报告',
        '',
        '> 这是受控规划与评审报告，不会直接修改代码、文件、数据库或真实项目目录。',
        '',
        '## 输入来源',
        `- 来源类型：${sourceSummary}`,
        options.resources.sourceRefs.length > 0
            ? `- 资源引用：${options.resources.sourceRefs.join('、')}`
            : '- 资源引用：无，仅使用用户输入文本。',
        '',
        '## 需求摘要',
        normalizeEmbeddedSectionMarkdown(options.resources.requirementText),
        '',
        '## 默认假设',
        ...assumptions.map(assumption => `- ${assumption}`),
        '',
        '## 实现方案',
        normalizeEmbeddedSectionMarkdown(options.planStage.markdown, '实现方案'),
        '',
        '## 任务拆解',
        normalizeEmbeddedSectionMarkdown(options.taskStage.markdown, '任务拆解'),
        '',
        '## 交付评审',
        `- 评审状态：\`${options.reviewDisposition}\``,
        normalizeEmbeddedSectionMarkdown(options.reviewStage.markdown, '交付评审'),
        '',
        '## 风险',
        ...risks.map(risk => `- ${risk}`),
        '',
        '## 非目标',
        ...nonGoals.map(nonGoal => `- ${nonGoal}`),
        '',
        '## 下一步建议',
        ...nextSteps.map(nextStep => `- ${nextStep}`),
    ].join('\n')
}

async function runLoadDeliveryChainContextNode(state: DeliveryChainGraphStateAnnotationState, runtime: DeliveryChainGraphRuntime) {
    const nodeId = DELIVERY_CHAIN_GRAPH_NODE_IDS.loadDeliveryChainContext
    emitWorkflowProgressStep(runtime, nodeId, 'running')

    try {
        const resources = await loadDeliveryChainContext(state.input, {
            context: runtime.context,
            writeChunk: runtime.writeChunk,
        })

        emitWorkflowProgressStep(runtime, nodeId, 'completed', {
            details: buildWorkflowStepDetails(nodeId, {
                input: state.input,
                resources,
            }),
            summary: buildWorkflowStepCompletedSummary(nodeId, {
                ...state,
                resources,
            }),
        })

        return {
            ...createGraphNodeUpdate(nodeId),
            resources,
            warnings: resources.warnings,
        }
    } catch {
        emitWorkflowProgressStep(runtime, nodeId, 'failed', {
            failureMessage: buildWorkflowStepFailureMessage(nodeId),
            summary: '读取上下文未完成',
        })

        return {
            ...createGraphNodeUpdate(nodeId),
            failureMessage: '公开 demo 资源读取失败，当前无法继续生成交付计划报告。',
            status: 'failed' as const,
            warnings: ['Delivery Chain demo 资源读取失败，已终止本轮 graph。'],
        }
    }
}

async function runPlanStageNode(state: DeliveryChainGraphStateAnnotationState, runtime: DeliveryChainGraphRuntime) {
    const nodeId = DELIVERY_CHAIN_GRAPH_NODE_IDS.runPlanStage

    if (state.status === 'failed' || !state.resources) {
        return createGraphNodeUpdate(nodeId)
    }

    emitWorkflowProgressStep(runtime, nodeId, 'running')

    try {
        const markdown =
            (await invokeStageMarkdown(runtime.model, buildPlanStageMessages(state.resources, state.warnings), runtime.context.signal)) ||
            createStageFallbackText('实现方案')

        emitWorkflowProgressStep(runtime, nodeId, 'completed', {
            summary: '已完成方案规划',
        })

        return {
            ...createGraphNodeUpdate(nodeId),
            plan: {
                markdown,
                stage: 'plan' as const,
                status: 'completed' as const,
            },
        }
    } catch {
        const warning = createStageFailureWarning('PlanStage')

        emitWorkflowProgressStep(runtime, nodeId, 'failed', {
            failureMessage: buildWorkflowStepFailureMessage(nodeId),
            summary: '方案规划未完成',
        })

        return {
            ...createGraphNodeUpdate(nodeId),
            plan: {
                markdown: createStageFallbackText('实现方案'),
                stage: 'plan' as const,
                status: 'failed' as const,
                warnings: [warning],
            },
            warnings: [warning],
        }
    }
}

async function runTaskStageNode(state: DeliveryChainGraphStateAnnotationState, runtime: DeliveryChainGraphRuntime) {
    const nodeId = DELIVERY_CHAIN_GRAPH_NODE_IDS.runTaskStage
    const shouldSkipTaskStage = state.status === 'failed' || !state.resources

    if (shouldSkipTaskStage) {
        return createGraphNodeUpdate(nodeId)
    }

    emitWorkflowProgressStep(runtime, nodeId, 'running')

    const planMarkdown = state.plan?.markdown ?? createStageFallbackText('实现方案')

    try {
        const markdown =
            (await invokeStageMarkdown(
                runtime.model,
                buildTaskStageMessages(state.resources, planMarkdown, state.warnings),
                runtime.context.signal
            )) || createStageFallbackText('任务拆解')

        emitWorkflowProgressStep(runtime, nodeId, 'completed', {
            summary: '已完成任务拆解',
        })

        return {
            ...createGraphNodeUpdate(nodeId),
            task: {
                markdown,
                stage: 'task' as const,
                status: 'completed' as const,
            },
        }
    } catch {
        const warning = createStageFailureWarning('TaskStage')

        emitWorkflowProgressStep(runtime, nodeId, 'failed', {
            failureMessage: buildWorkflowStepFailureMessage(nodeId),
            summary: '任务拆解未完成',
        })

        return {
            ...createGraphNodeUpdate(nodeId),
            task: {
                markdown: createStageFallbackText('任务拆解'),
                stage: 'task' as const,
                status: 'failed' as const,
                warnings: [warning],
            },
            warnings: [warning],
        }
    }
}

async function runReviewStageNode(state: DeliveryChainGraphStateAnnotationState, runtime: DeliveryChainGraphRuntime) {
    const nodeId = DELIVERY_CHAIN_GRAPH_NODE_IDS.runReviewStage
    const shouldSkipReviewStage = state.status === 'failed' || !state.resources

    if (shouldSkipReviewStage) {
        return createGraphNodeUpdate(nodeId)
    }

    emitWorkflowProgressStep(runtime, nodeId, 'running')

    const planMarkdown = state.plan?.markdown ?? createStageFallbackText('实现方案')
    const taskMarkdown = state.task?.markdown ?? createStageFallbackText('任务拆解')

    try {
        const markdown =
            (await invokeStageMarkdown(
                runtime.model,
                buildReviewStageMessages(state.resources, planMarkdown, taskMarkdown, state.warnings),
                runtime.context.signal
            )) || createReviewStageFallbackText()
        const reviewDisposition = extractReviewDisposition(markdown)

        emitWorkflowProgressStep(runtime, nodeId, 'completed', {
            summary: '已完成交付评审',
        })

        return {
            ...createGraphNodeUpdate(nodeId),
            review: {
                markdown,
                stage: 'review' as const,
                status: reviewDisposition === 'blocked' ? ('blocked' as const) : ('completed' as const),
            },
            reviewDisposition,
        }
    } catch {
        const warning = createStageFailureWarning('ReviewStage')
        const markdown = createReviewStageFallbackText()

        emitWorkflowProgressStep(runtime, nodeId, 'failed', {
            failureMessage: buildWorkflowStepFailureMessage(nodeId),
            summary: '交付评审未完成',
        })

        return {
            ...createGraphNodeUpdate(nodeId),
            review: {
                markdown,
                stage: 'review' as const,
                status: 'failed' as const,
                warnings: [warning],
            },
            reviewDisposition: 'needs_changes' as const,
            warnings: [warning],
        }
    }
}

async function buildDeliveryChainReportNode(state: DeliveryChainGraphStateAnnotationState, runtime: DeliveryChainGraphRuntime) {
    const nodeId = DELIVERY_CHAIN_GRAPH_NODE_IDS.buildDeliveryChainReport

    emitWorkflowProgressStep(runtime, nodeId, 'running')

    if (state.status === 'failed' || !state.resources) {
        emitWorkflowProgressStep(runtime, nodeId, 'completed', {
            summary: '已生成交付计划报告',
        })

        return {
            ...createGraphNodeUpdate(nodeId),
            reportMarkdown: buildFailureReport(state),
            status: 'failed' as const,
        }
    }

    const planStage: DeliveryChainStageResult = state.plan ?? {
        markdown: createStageFallbackText('实现方案'),
        stage: 'plan',
        status: 'failed',
    }
    const taskStage: DeliveryChainStageResult = state.task ?? {
        markdown: createStageFallbackText('任务拆解'),
        stage: 'task',
        status: 'failed',
    }
    const reviewStage: DeliveryChainStageResult = state.review ?? {
        markdown: createReviewStageFallbackText(),
        stage: 'review',
        status: 'failed',
    }
    const reviewDisposition = state.reviewDisposition ?? extractReviewDisposition(reviewStage.markdown)
    const hasStageFailure = [planStage, taskStage, reviewStage].some(stage => stage.status === 'failed')

    emitWorkflowProgressStep(runtime, nodeId, 'completed', {
        summary: '已生成交付计划报告',
    })

    return {
        ...createGraphNodeUpdate(nodeId),
        reportMarkdown: buildReport({
            input: state.input,
            planStage,
            resources: state.resources,
            reviewDisposition,
            reviewStage,
            taskStage,
            warnings: state.warnings,
        }),
        reviewDisposition,
        status: hasStageFailure ? ('failed' as const) : reviewDisposition === 'blocked' ? ('blocked' as const) : ('completed' as const),
    }
}

export function createDeliveryChainGraph(runtime: DeliveryChainGraphRuntime) {
    return new StateGraph(DeliveryChainGraphStateAnnotation)
        .addNode(DELIVERY_CHAIN_GRAPH_NODE_IDS.loadDeliveryChainContext, state => runLoadDeliveryChainContextNode(state, runtime))
        .addNode(DELIVERY_CHAIN_GRAPH_NODE_IDS.runPlanStage, state => runPlanStageNode(state, runtime))
        .addNode(DELIVERY_CHAIN_GRAPH_NODE_IDS.runTaskStage, state => runTaskStageNode(state, runtime))
        .addNode(DELIVERY_CHAIN_GRAPH_NODE_IDS.runReviewStage, state => runReviewStageNode(state, runtime))
        .addNode(DELIVERY_CHAIN_GRAPH_NODE_IDS.buildDeliveryChainReport, state => buildDeliveryChainReportNode(state, runtime))
        .addEdge(START, DELIVERY_CHAIN_GRAPH_NODE_IDS.loadDeliveryChainContext)
        .addEdge(DELIVERY_CHAIN_GRAPH_NODE_IDS.loadDeliveryChainContext, DELIVERY_CHAIN_GRAPH_NODE_IDS.runPlanStage)
        .addEdge(DELIVERY_CHAIN_GRAPH_NODE_IDS.runPlanStage, DELIVERY_CHAIN_GRAPH_NODE_IDS.runTaskStage)
        .addEdge(DELIVERY_CHAIN_GRAPH_NODE_IDS.runTaskStage, DELIVERY_CHAIN_GRAPH_NODE_IDS.runReviewStage)
        .addEdge(DELIVERY_CHAIN_GRAPH_NODE_IDS.runReviewStage, DELIVERY_CHAIN_GRAPH_NODE_IDS.buildDeliveryChainReport)
        .addEdge(DELIVERY_CHAIN_GRAPH_NODE_IDS.buildDeliveryChainReport, END)
        .compile({
            name: 'delivery-chain-graph',
        })
}

export async function runDeliveryChainGraph(options: RunDeliveryChainGraphOptions) {
    const graph = createDeliveryChainGraph({
        context: options.context,
        model: options.model,
        workflowProgress: options.workflowProgress,
        writeChunk: options.writeChunk,
    })

    return graph.invoke(createInitialDeliveryChainGraphState(options.input))
}

function buildUnexpectedGraphFailureReport(input: DeliveryChainInput) {
    return buildFailureReport({
        ...createInitialDeliveryChainGraphState(input),
        failureMessage: '当前交付链路运行失败，请稍后重试。',
        status: 'failed',
    })
}

function escapeMarkdownRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripLeadingEmbeddedHeading(markdown: string, title: string) {
    const pattern = new RegExp(`^#{1,6}\\s+${escapeMarkdownRegExp(title)}\\s*(?:\\r?\\n)+`)

    return markdown.replace(pattern, '').trim()
}

function demoteEmbeddedMarkdownHeadings(markdown: string) {
    return markdown.replace(/^(#{1,6})\s+/gm, (_, hashes: string) => `${'#'.repeat(Math.min(Math.max(hashes.length + 1, 3), 6))} `)
}

function normalizeEmbeddedSectionMarkdown(markdown: string, parentTitle?: string) {
    const trimmedMarkdown = markdown.trim()

    if (!trimmedMarkdown) {
        return trimmedMarkdown
    }

    const withoutDuplicateTitle = parentTitle ? stripLeadingEmbeddedHeading(trimmedMarkdown, parentTitle) : trimmedMarkdown

    return demoteEmbeddedMarkdownHeadings(withoutDuplicateTitle).trim()
}

export function resolveDeliveryChainInvocation(request: ChatRequest): DeliveryChainInvocation | null {
    if (request.composer?.command?.name !== DELIVERY_CHAIN_COMMAND_NAME) {
        return null
    }

    const inlineRequirementText = getInlineRequirementText(request)
    const reference = getPrimaryComposerReference(request)

    if (!reference) {
        return inlineRequirementText
            ? {
                  kind: 'ready-inline',
                  requirementText: inlineRequirementText,
              }
            : {
                  kind: 'missing-input',
              }
    }

    if (!isLocalResourceReference(reference)) {
        return {
            kind: 'invalid-local-resource',
            reference,
        }
    }

    const normalizedReference = toNormalizedReference(reference)
    const entryMatch = normalizedReference.uri.match(DELIVERY_CHAIN_SCENARIO_ENTRY_PATTERN)

    if (entryMatch) {
        return {
            inlineRequirementText: inlineRequirementText || undefined,
            kind: 'ready-scenario',
            requirementReference: normalizedReference,
            scenarioId: entryMatch[1] ?? 'unknown-scenario',
        }
    }

    const nonEntryMatch = normalizedReference.uri.match(DELIVERY_CHAIN_SCENARIO_NON_ENTRY_PATTERN)

    if (nonEntryMatch) {
        return {
            expectedUri: `demo://scenarios/${nonEntryMatch[1]}/requirement.md`,
            kind: 'scenario-non-entry',
            reference: normalizedReference,
        }
    }

    if (FORBIDDEN_SCHEME_PATTERN.test(reference.uri)) {
        return {
            kind: 'forbidden-resource',
            reference,
        }
    }

    if (
        LEGACY_VERSION_PLAN_REFERENCE_PATTERN.test(normalizedReference.uri) &&
        !VERSION_PLAN_REFERENCE_PATTERN.test(normalizedReference.uri)
    ) {
        return {
            kind: 'legacy-version-plan',
            reference: normalizedReference,
        }
    }

    if (VERSION_PLAN_REFERENCE_PATTERN.test(normalizedReference.uri)) {
        return {
            kind: 'version-plan-resource',
            reference: normalizedReference,
        }
    }

    return {
        kind: 'invalid-local-resource',
        reference: normalizedReference,
    }
}

export async function startDeliveryChainRun(options: StartDeliveryChainRunOptions) {
    const invocation = resolveDeliveryChainInvocation(options.request)

    if (!invocation) {
        return false
    }

    if (invocation.kind === 'missing-input') {
        writeStaticTextPart(
            options.writeChunk,
            '请显式提供 `/delivery-chain + @demo://scenarios/*/requirement.md`，或直接在 `/delivery-chain` 后输入需求文本。'
        )
        return true
    }

    if (invocation.kind === 'version-plan-resource' || invocation.kind === 'legacy-version-plan') {
        writeStaticTextPart(
            options.writeChunk,
            '当前 `/delivery-chain` 只接受 `@demo://scenarios/*/requirement.md` 作为 demo 入口。`@demo://version-plans/*.md` 属于 `/tasklist`。'
        )
        return true
    }

    if (invocation.kind === 'scenario-non-entry') {
        writeStaticTextPart(
            options.writeChunk,
            `请引用 scenario 的 requirement.md 作为入口，例如 \`${invocation.expectedUri}\`。当前不支持直接把 context.md 或 sample artifact 当作 /delivery-chain 输入。`
        )
        return true
    }

    if (invocation.kind === 'forbidden-resource') {
        writeStaticTextPart(
            options.writeChunk,
            '公开 Delivery Chain 只允许读取 `@demo://scenarios/*/requirement.md`。`@docs://`、`@specs://`、`@file://` 和真实路径都不在允许范围内。'
        )
        return true
    }

    if (invocation.kind === 'invalid-local-resource') {
        writeStaticTextPart(
            options.writeChunk,
            '公开 Delivery Chain 只接受 `@demo://scenarios/*/requirement.md` 或直接输入需求文本。请不要使用绝对路径、`../`、反斜杠路径或其他本地目录资源。'
        )
        return true
    }

    const input = createDeliveryChainGraphInput(invocation)
    const workflowProgress = createDeliveryChainWorkflowProgressRuntime()

    try {
        emitWorkflowProgressStart({
            context: options.context,
            model: options.model,
            workflowProgress,
            writeChunk: options.writeChunk,
        })

        const graphState = await runDeliveryChainGraph({
            context: options.context,
            input,
            model: options.model,
            workflowProgress,
            writeChunk: options.writeChunk,
        })

        emitWorkflowProgressEnd(
            {
                context: options.context,
                model: options.model,
                workflowProgress,
                writeChunk: options.writeChunk,
            },
            graphState.status === 'completed' ? 'completed' : 'failed',
            undefined,
            graphState.status === 'completed' ? undefined : '交付计划未完整生成，已输出安全报告。'
        )

        writeStaticTextPart(options.writeChunk, graphState.reportMarkdown ?? buildFailureReport(graphState))
        return true
    } catch {
        emitWorkflowProgressEnd(
            {
                context: options.context,
                model: options.model,
                workflowProgress,
                writeChunk: options.writeChunk,
            },
            'failed',
            undefined,
            '交付计划未完整生成，请稍后重试。'
        )

        writeStaticTextPart(options.writeChunk, buildUnexpectedGraphFailureReport(input))
        return true
    }
}
