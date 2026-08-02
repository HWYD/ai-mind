import { existsSync } from 'node:fs'
import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import { writeStaticTextPart } from '@ai-mind/stream-core'

import { createId } from '@/lib/ai/create-id'
import {
    assertSafeDocsResourcePath,
    createDocsResourcePreview,
    createDocsResourceUri,
    MAX_PROJECT_DOCS_RESOURCE_BYTES,
    MAX_PROJECT_DOCS_RESOURCE_CONTENT_CHARS,
    MAX_PROJECT_DOCS_RESOURCE_PREVIEW_CHARS,
    PROJECT_DOCS_SERVER_ID,
} from '@/lib/ai/mcp/adapters/docs-resource-shared'
import type { AiMindChatModelHandle, ResolvedModelSelection } from '@/lib/ai/model-provider'
import {
    buildChatConversationThreadId,
    chatMemoryService,
    conversationRegistryService,
    type ThreadMemoryStatusEvent,
} from '@/lib/ai/runtime/chat-memory'
import type { ChatComposerReference, ChatRequest } from '@/lib/ai/types/chat'

import type { ChatExecutionContext, WriteChunk } from '../types'
import type { DeliveryChainInput, DeliveryChainResourceBundle } from './graph-state'
import { DeliveryChainModelCapabilityError, runControlledDeliveryManager } from './manager'
import { buildDeliveryManagerFailureReport } from './manager/report-synthesis'
import {
    type DeliveryManagerProgressEvent,
    getReportProgressStepDefinition,
    getSubagentProgressStepDefinition,
} from './manager/workflow-progress'

const DELIVERY_CHAIN_COMMAND_NAME = 'delivery-chain'
const VERSION_PLAN_REFERENCE_PATTERN = /^demo:\/\/version-plans\/[^/\\]+\.md$/i
const LEGACY_VERSION_PLAN_REFERENCE_PATTERN = /^(docs|demo):\/\/versions\/[^/\\]+\.md$/i
const DELIVERY_CHAIN_SCENARIO_ENTRY_PATTERN = /^demo:\/\/scenarios\/([^/\\]+)\/requirement\.md$/i
const DELIVERY_CHAIN_SCENARIO_NON_ENTRY_PATTERN =
    /^demo:\/\/scenarios\/([^/\\]+)\/(context|plan\.sample|tasks\.sample|review\.expected)\.md$/i
const DELIVERY_CHAIN_SCENARIO_EXPECTED_PRE_DECISIONS: Readonly<Record<string, 'execute'>> = {
    'register-login': 'execute',
    'guangzhou-3-day-trip': 'execute',
    'frontend-learning-plan': 'execute',
    'request-limit-banner': 'execute',
}
const FORBIDDEN_SCHEME_PATTERN = /^@?(docs|specs|file):\/\//i
const MIN_INLINE_REQUIREMENT_CHARS = 24
const DELIVERY_CHAIN_WORKFLOW_KIND = 'delivery-chain'
const DELIVERY_CHAIN_INTERNAL_RESOURCE_COUNT = 5

const PLAN_RUBRIC_FALLBACK = `- 明确需求目标与非目标
- 说明资源边界、兼容性和约束
- 给出最小实现路径与风险`

const TASK_RUBRIC_FALLBACK = `- 任务按依赖顺序拆解
- 标出高风险任务与验收任务
- 包含保护非目标的检查项`

const REVIEW_RUBRIC_FALLBACK = `- 检查需求覆盖、范围漂移和非目标
- 判断 plan 与 task 是否一致
- 给出 pass / needs_changes / blocked 结论`

const GOVERNANCE_FALLBACK = `- 只读 @demo:// 公开 demo 资源
- 不读取真实项目目录，不写真实代码文件
- 不引入 nested HITL、artifact persistence 或 DB schema 变更`

type DeliveryChainWorkflowStepId =
    | 'load'
    | 'delegate-plan'
    | 'delegate-task'
    | 'delegate-review'
    | 'delegate-review-group'
    | 'revise-plan'
    | 'revise-tasks'
    | 'synthesize-report'
    | 'supervisor-post-decision'
    | 'supervisor-pre-decision'

interface DeliveryChainWorkflowProgressRuntime {
    partId: string
    startedAt: number
    stepStartedAt: Partial<Record<DeliveryChainWorkflowStepId, number>>
    workflowId: string
}

interface DeliveryChainWorkflowStepDefinition {
    details: string[]
    runningSummary: string
    stepId: DeliveryChainWorkflowStepId
    title: string
}

const LOAD_STEP_DEFINITION: DeliveryChainWorkflowStepDefinition = {
    details: ['包含需求、场景上下文、评审规则和治理规则'],
    runningSummary: '开始读取上下文',
    stepId: 'load',
    title: '读取上下文',
}

type DeliveryChainInvocation =
    | {
          expectedPreDecision?: 'execute'
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
    modelHandle: AiMindChatModelHandle
    request: ChatRequest
    resolvedModelSelection: ResolvedModelSelection
    writeChunk: WriteChunk
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

    if (request.composer) {
        return ''
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

function createDeliveryChainInput(
    invocation: Extract<DeliveryChainInvocation, { kind: 'ready-inline' | 'ready-scenario' }>
): DeliveryChainInput {
    if (invocation.kind === 'ready-inline') {
        return {
            requirementText: invocation.requirementText,
            source: 'inline_requirement',
        }
    }

    return {
        expectedPreDecision: invocation.expectedPreDecision,
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

function emitWorkflowProgressStart(writeChunk: WriteChunk, workflowProgress: DeliveryChainWorkflowProgressRuntime) {
    writeChunk({
        partId: workflowProgress.partId,
        startedAt: workflowProgress.startedAt,
        title: '正在生成交付计划...',
        type: 'workflow-progress-start',
        workflowId: workflowProgress.workflowId,
        workflowKind: DELIVERY_CHAIN_WORKFLOW_KIND,
    })
}

function emitWorkflowProgressStep(
    writeChunk: WriteChunk,
    workflowProgress: DeliveryChainWorkflowProgressRuntime,
    definition: DeliveryChainWorkflowStepDefinition,
    status: 'completed' | 'failed' | 'running',
    overrides?: {
        details?: string[]
        failureMessage?: string
        summary?: string
    }
) {
    if (status === 'running') {
        const startedAt = Date.now()

        workflowProgress.stepStartedAt[definition.stepId] = startedAt
        writeChunk({
            details: overrides?.details ?? definition.details,
            partId: workflowProgress.partId,
            startedAt,
            status,
            stepId: definition.stepId,
            summary: overrides?.summary ?? definition.runningSummary,
            title: definition.title,
            type: 'workflow-progress-step',
            workflowId: workflowProgress.workflowId,
        })
        return
    }

    const endedAt = Date.now()
    const startedAt = workflowProgress.stepStartedAt[definition.stepId]
    const durationMs = typeof startedAt === 'number' ? endedAt - startedAt : undefined

    writeChunk({
        details: overrides?.details ?? definition.details,
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(startedAt !== undefined ? { startedAt } : {}),
        endedAt,
        ...(overrides?.failureMessage ? { failureMessage: overrides.failureMessage } : {}),
        partId: workflowProgress.partId,
        status,
        stepId: definition.stepId,
        ...(overrides?.summary ? { summary: overrides.summary } : {}),
        title: definition.title,
        type: 'workflow-progress-step',
        workflowId: workflowProgress.workflowId,
    })
}

function emitWorkflowProgressEnd(
    writeChunk: WriteChunk,
    workflowProgress: DeliveryChainWorkflowProgressRuntime,
    status: 'completed' | 'failed',
    summary?: string,
    failureMessage?: string
) {
    const endedAt = Date.now()

    writeChunk({
        durationMs: endedAt - workflowProgress.startedAt,
        endedAt,
        ...(failureMessage ? { failureMessage } : {}),
        partId: workflowProgress.partId,
        status,
        ...(summary ? { summary } : {}),
        type: 'workflow-progress-end',
        workflowId: workflowProgress.workflowId,
    })
}

function buildLoadStepDetails(input: DeliveryChainInput, resources: DeliveryChainResourceBundle) {
    const details = [...LOAD_STEP_DEFINITION.details]

    if (input.source === 'demo_scenario') {
        details.push(`读取文件：${input.scenarioId}/requirement.md`)

        if (resources.contextText) {
            details.push('读取文件：context.md')
        }
    } else {
        details.push('读取输入：inline requirement')
    }

    details.push('读取规则：plan-rubric.md、task-rubric.md、review-rubric.md')
    details.push('读取治理：delivery-boundaries.md、engineering-rules.md')

    return details
}

function buildLoadCompletedSummary(input: DeliveryChainInput, resources: DeliveryChainResourceBundle) {
    if (input.source === 'demo_scenario') {
        const resourceCount = DELIVERY_CHAIN_INTERNAL_RESOURCE_COUNT + (resources.contextText ? 2 : 1)

        return `已读取 demo 上下文 ${resourceCount} 项`
    }

    return '已读取 inline requirement 与受控规则'
}

function mapManagerProgressEvent(event: DeliveryManagerProgressEvent): DeliveryChainWorkflowStepDefinition {
    if (event.stepId === 'supervisor-pre-decision' || event.stepId === 'supervisor-post-decision') {
        return {
            details: event.details ?? ['Supervisor 正在生成受控调度决策'],
            runningSummary: event.summary ?? 'Supervisor 正在生成受控调度决策',
            stepId: event.stepId,
            title: event.stepId === 'supervisor-pre-decision' ? 'Supervisor 执行前决策' : 'Supervisor 评审后决策',
        }
    }

    if (event.stepId === 'revise-plan' || event.stepId === 'revise-tasks') {
        const subagentId = event.stepId === 'revise-plan' ? 'plan-subagent' : 'task-subagent'

        return {
            ...getSubagentProgressStepDefinition(subagentId),
            details: event.details ?? [`${subagentId} 正在处理已验证的返修请求`],
            runningSummary: event.summary ?? `${subagentId} 正在返修`,
            stepId: event.stepId,
            title: event.stepId === 'revise-plan' ? 'Plan Worker 返修' : 'Task Worker 返修',
        }
    }

    if (event.stepId === 'synthesize-report') {
        return {
            ...getReportProgressStepDefinition(),
            title: 'Manager 汇总报告',
        }
    }

    // v0.4.1: Review Group 并行评审使用独立 step，保留 event 中的详细信息
    if (event.stepId === 'delegate-review-group') {
        return {
            details: event.details ?? ['Manager 并行调用评审子 Agent：方案评审、风险评估、边界检查'],
            runningSummary: event.summary ?? 'Manager 正在并行调用评审子 Agent：方案评审、风险评估、边界检查',
            stepId: 'delegate-review-group',
            title: 'Manager 并行评审',
        }
    }

    const subagentId =
        event.stepId === 'delegate-plan' ? 'plan-subagent' : event.stepId === 'delegate-task' ? 'task-subagent' : 'review-subagent'
    const definition = getSubagentProgressStepDefinition(subagentId)

    return {
        ...definition,
        title:
            event.stepId === 'delegate-plan'
                ? 'Manager 委派 Plan Subagent'
                : event.stepId === 'delegate-task'
                  ? 'Manager 委派 Task Subagent'
                  : 'Manager 委派 Review Subagent',
    }
}

function resolveProjectRoot() {
    let currentDir = process.cwd()

    for (let depth = 0; depth < 6; depth += 1) {
        if (existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
            return currentDir
        }

        const parentDir = path.dirname(currentDir)

        if (parentDir === currentDir) {
            break
        }

        currentDir = parentDir
    }

    return process.cwd()
}

function isInsideDirectory(parentDir: string, childPath: string) {
    const relativePath = path.relative(parentDir, childPath)

    return relativePath === '' || (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

async function readLocalDemoResource(uri: string) {
    const resourcePath = assertSafeDocsResourcePath(uri)
    const demoRoot = path.join(resolveProjectRoot(), 'examples', 'agent-demo')
    const absolutePath = path.resolve(demoRoot, resourcePath)
    const relativePath = path.relative(demoRoot, absolutePath)

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('demo resource 不允许越界读取。')
    }

    const linkStat = await lstat(absolutePath).catch(() => null)

    if (!linkStat) {
        throw new Error(`demo workspace 下未找到资源：${resourcePath}`)
    }

    if (linkStat.isSymbolicLink()) {
        throw new Error('demo resource 不允许读取符号链接。')
    }

    const [realDemoRoot, realFilePath] = await Promise.all([realpath(demoRoot), realpath(absolutePath)])

    if (!isInsideDirectory(realDemoRoot, realFilePath)) {
        throw new Error('demo resource 不允许通过真实路径越界读取。')
    }

    const fileStat = await stat(absolutePath)

    if (!fileStat.isFile()) {
        throw new Error(`demo workspace 下未找到资源：${resourcePath}`)
    }

    if (fileStat.size > MAX_PROJECT_DOCS_RESOURCE_BYTES) {
        throw new Error(`demo resource 过大，当前最多支持 ${MAX_PROJECT_DOCS_RESOURCE_BYTES} 字节。`)
    }

    const rawContent = await readFile(absolutePath, 'utf8')
    const content = rawContent.slice(0, MAX_PROJECT_DOCS_RESOURCE_CONTENT_CHARS)

    return {
        content,
        contentPreview: createDocsResourcePreview(content),
        previewChars: MAX_PROJECT_DOCS_RESOURCE_PREVIEW_CHARS,
        resourceName: resourcePath,
        serverId: PROJECT_DOCS_SERVER_ID,
        truncated: rawContent.length > MAX_PROJECT_DOCS_RESOURCE_CONTENT_CHARS,
        uri: createDocsResourceUri(resourcePath),
    }
}

async function readDemoResource(options: {
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
        source: 'internal',
        uri: options.uri,
    })

    try {
        const resource = await readLocalDemoResource(options.uri)

        options.writeChunk({
            type: 'resource-end',
            partId,
            contentPreview: resource.contentPreview,
            isTruncated: resource.truncated,
            location: 'local',
            previewChars: resource.previewChars,
            resourceName: resource.resourceName,
            serverId: resource.serverId,
            source: 'internal',
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

async function loadDeliveryChainContext(input: DeliveryChainInput, options: { writeChunk: WriteChunk }) {
    const warnings: string[] = []
    const planRubricText =
        (await readDemoResource({
            fallbackText: PLAN_RUBRIC_FALLBACK,
            label: 'plan-rubric.md',
            optional: true,
            uri: 'demo://rubrics/plan-rubric.md',
            warnings,
            writeChunk: options.writeChunk,
        })) ?? PLAN_RUBRIC_FALLBACK
    const taskRubricText =
        (await readDemoResource({
            fallbackText: TASK_RUBRIC_FALLBACK,
            label: 'task-rubric.md',
            optional: true,
            uri: 'demo://rubrics/task-rubric.md',
            warnings,
            writeChunk: options.writeChunk,
        })) ?? TASK_RUBRIC_FALLBACK
    const reviewRubricText =
        (await readDemoResource({
            fallbackText: REVIEW_RUBRIC_FALLBACK,
            label: 'review-rubric.md',
            optional: true,
            uri: 'demo://rubrics/review-rubric.md',
            warnings,
            writeChunk: options.writeChunk,
        })) ?? REVIEW_RUBRIC_FALLBACK
    const deliveryBoundariesText =
        (await readDemoResource({
            fallbackText: GOVERNANCE_FALLBACK,
            label: 'delivery-boundaries.md',
            optional: true,
            uri: 'demo://governance/delivery-boundaries.md',
            warnings,
            writeChunk: options.writeChunk,
        })) ?? GOVERNANCE_FALLBACK
    const engineeringRulesText =
        (await readDemoResource({
            fallbackText: GOVERNANCE_FALLBACK,
            label: 'engineering-rules.md',
            optional: true,
            uri: 'demo://governance/engineering-rules.md',
            warnings,
            writeChunk: options.writeChunk,
        })) ?? GOVERNANCE_FALLBACK

    if (input.source === 'inline_requirement') {
        if (input.requirementText.length < MIN_INLINE_REQUIREMENT_CHARS) {
            warnings.push('inline requirement 较短，以下结果会带默认假设和待补充信息。')
        }

        return {
            governanceText: [deliveryBoundariesText, engineeringRulesText].join('\n\n'),
            planRubricText,
            requirementText: input.requirementText,
            reviewRubricText,
            sourceRefs: [],
            taskRubricText,
            warnings,
        } satisfies DeliveryChainResourceBundle
    }

    const requirementText = await readDemoResource({
        label: `${input.scenarioId}/requirement.md`,
        uri: input.requirementRef,
        warnings,
        writeChunk: options.writeChunk,
    })
    const contextText = await readDemoResource({
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
    } satisfies DeliveryChainResourceBundle
}

async function appendCompletedDeliveryTurn(options: {
    assistantMessageId?: string
    assistantText: string
    conversationId: string
    context: ChatExecutionContext
    request: ChatRequest
    status: 'blocked' | 'completed'
    userMessageId?: string
    writeChunk: WriteChunk
}) {
    if (!options.context.sessionId || options.context.signal?.aborted) {
        return
    }

    const userText = getLastUserMessageText(options.request)

    if (!userText) {
        return
    }

    await chatMemoryService.appendCompletedTurn(
        buildChatConversationThreadId(options.context.sessionId, options.conversationId),
        {
            assistantMessageId: options.assistantMessageId,
            assistantText: options.assistantText,
            completionStatus: options.status === 'blocked' ? 'blocked' : 'completed',
            source: 'delivery-chain',
            userMessageId: options.userMessageId,
            userText,
        },
        {
            onStatus(event: ThreadMemoryStatusEvent) {
                options.writeChunk({
                    type: 'thread-memory-status',
                    status: event.status,
                    message: event.message,
                    ...(typeof event.summaryLength === 'number' ? { summaryLength: event.summaryLength } : {}),
                    ...(typeof event.pinnedDecisionCount === 'number' ? { pinnedDecisionCount: event.pinnedDecisionCount } : {}),
                })
            },
            promotionContext: {
                sessionId: options.context.sessionId,
                sourceConversationId: options.conversationId,
            },
        }
    )
    await conversationRegistryService.touchConversation(options.context.sessionId, options.conversationId, {
        hasMessages: true,
    })
}

function buildUnexpectedFailureReport(input: DeliveryChainInput, failureMessage: string, warnings: string[] = []) {
    return buildDeliveryManagerFailureReport({
        failureMessage,
        input,
        warnings,
    })
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
        const scenarioId = entryMatch[1] ?? 'unknown-scenario'

        return {
            expectedPreDecision: DELIVERY_CHAIN_SCENARIO_EXPECTED_PRE_DECISIONS[scenarioId],
            inlineRequirementText: inlineRequirementText || undefined,
            kind: 'ready-scenario',
            requirementReference: normalizedReference,
            scenarioId,
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

    const input = createDeliveryChainInput(invocation)
    const workflowProgress = createDeliveryChainWorkflowProgressRuntime()

    emitWorkflowProgressStart(options.writeChunk, workflowProgress)
    emitWorkflowProgressStep(options.writeChunk, workflowProgress, LOAD_STEP_DEFINITION, 'running')

    let resources: DeliveryChainResourceBundle

    try {
        resources = await loadDeliveryChainContext(input, {
            writeChunk: options.writeChunk,
        })
    } catch {
        emitWorkflowProgressStep(options.writeChunk, workflowProgress, LOAD_STEP_DEFINITION, 'failed', {
            failureMessage: '读取上下文未完成，当前交付计划已安全停止。',
            summary: '读取上下文未完成',
        })
        emitWorkflowProgressEnd(options.writeChunk, workflowProgress, 'failed', undefined, '交付计划未完整生成，请稍后重试。')

        writeStaticTextPart(options.writeChunk, buildUnexpectedFailureReport(input, '当前交付链路读取上下文失败，请稍后重试。'))
        return true
    }

    emitWorkflowProgressStep(options.writeChunk, workflowProgress, LOAD_STEP_DEFINITION, 'completed', {
        details: buildLoadStepDetails(input, resources),
        summary: buildLoadCompletedSummary(input, resources),
    })

    try {
        const result = await runControlledDeliveryManager({
            context: options.context,
            input,
            modelHandle: options.modelHandle,
            onProgress(event) {
                const definition = mapManagerProgressEvent(event)

                emitWorkflowProgressStep(options.writeChunk, workflowProgress, definition, event.status, {
                    details: event.details,
                    failureMessage: event.failureMessage,
                    summary: event.summary,
                })
            },
            resolvedModelSelection: options.resolvedModelSelection,
            resources,
            signal: options.context.signal,
            workflowId: workflowProgress.workflowId,
            writeChunk: options.writeChunk,
        })

        emitWorkflowProgressEnd(
            options.writeChunk,
            workflowProgress,
            result.status === 'failed' ? 'failed' : 'completed',
            result.status === 'failed' ? undefined : '交付计划报告已生成。',
            result.status === 'failed' ? '交付计划未完整生成，已输出安全报告。' : undefined
        )

        writeStaticTextPart(options.writeChunk, result.reportMarkdown)

        if (result.status === 'completed' || result.status === 'blocked') {
            try {
                await appendCompletedDeliveryTurn({
                    assistantMessageId: `${workflowProgress.workflowId}:assistant`,
                    assistantText: result.reportMarkdown,
                    conversationId: options.request.conversationId,
                    context: options.context,
                    request: options.request,
                    status: result.status,
                    userMessageId: `${workflowProgress.workflowId}:user`,
                    writeChunk: options.writeChunk,
                })
            } catch {
                // chat memory 是可降级能力，失败不影响 Delivery 最终报告返回。
            }
        }

        return true
    } catch (error) {
        const capabilityFailure = error instanceof DeliveryChainModelCapabilityError
        const failureMessage = capabilityFailure
            ? 'Delivery Chain 的固定 Contract 模型不支持结构化 JSON 输出，当前交付计划已安全停止。'
            : 'Delivery Manager 执行异常，请稍后重试。'

        emitWorkflowProgressStep(options.writeChunk, workflowProgress, getReportProgressStepDefinition(), 'failed', {
            failureMessage: capabilityFailure ? failureMessage : 'Delivery Manager 执行异常，当前交付计划已安全停止。',
            summary: capabilityFailure ? '当前模型缺少结构化输出能力' : 'Delivery Manager 执行异常',
        })
        emitWorkflowProgressEnd(options.writeChunk, workflowProgress, 'failed', undefined, '交付计划未完整生成，请稍后重试。')

        writeStaticTextPart(options.writeChunk, buildUnexpectedFailureReport(input, failureMessage, resources.warnings))
        return true
    }
}
