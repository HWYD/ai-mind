import { HumanMessage, SystemMessage } from '@langchain/core/messages'

import type { ChatComposerReference } from '@/lib/ai/types/chat'

import { getMessageContentText } from '../../message-content'
import type { ChatSession } from '../../types'
import { parseVersionPlanTasklistPlanningDecisionOutputText, parseVersionPlanTasklistStrategy } from '../contract/planner-output-schema'
import type {
    PlanningDecisionOutput,
    TasklistStrategy,
    VersionPlanTasklistIntermediateArtifacts,
    VersionPlanTasklistPlanningArtifacts,
} from '../contract/types'
import { VERSION_PLAN_TASKLIST_OPTIONAL_CONTEXT_RESOURCE_URIS } from '../contract/types'

export type ControlledPlannerOutputStage = 'planning_decision' | 'tasklist_strategy'

export class ControlledPlannerOutputError extends Error {
    constructor(
        readonly stage: ControlledPlannerOutputStage,
        message: string
    ) {
        super(message)
        this.name = 'ControlledPlannerOutputError'
    }
}

export function isControlledPlannerOutputError(error: unknown): error is ControlledPlannerOutputError {
    return error instanceof ControlledPlannerOutputError
}

const PLANNING_DECISION_SYSTEM_PROMPT = `
你是 AI Mind 的 Controlled Planner Lite，只负责为 Version Plan to Tasklist Agent 做一次有限决策。

硬性规则：
1. 只输出合法 JSON，不要输出 Markdown、解释性前后缀或代码围栏。
2. 只能在 allowedActions 中选择一个 action。
3. 不要请求读取白名单外资源，不要读取源码，不要读取 docs/tasklists，不要扫描 docs/versions。
4. 不要写入文件，不要承诺 pause/resume、审批按钮、Human-in-the-loop 或多 Agent。
5. 如果选择 proceed_to_tasklist_strategy 或 proceed_with_manual_review_items，必须在同一个 JSON 里输出 strategy。
6. 如果选择 read_optional_context、ask_clarification 或 stop_with_boundary_message，本次 JSON 不能输出 strategy。

输出 JSON 形状：
{
  "decision": { "type": "...", "...": "..." },
  "strategy": {
    "granularity": "coarse | medium | detailed",
    "expectedStepRange": [3, 7],
    "grouping": ["..."],
    "priority": ["..."],
    "reason": "..."
  }
}

proceed 示例：
{
  "decision": { "type": "proceed_to_tasklist_strategy", "reason": "版本方案信息完整，可以继续生成 tasklist。" },
  "strategy": {
    "granularity": "medium",
    "expectedStepRange": [3, 6],
    "grouping": ["Runtime", "Validation", "Docs"],
    "priority": ["先保护主链路", "再补结构校验", "最后收口文档"],
    "reason": "版本目标清晰，适合按运行时、验证和文档分组拆分。"
  }
}

ask 示例：
{
  "decision": { "type": "ask_clarification", "question": "请补充这个版本最核心的目标是什么？", "reason": "缺少可拆分的核心目标。" }
}

最终提醒：只输出一个 JSON 对象；不要输出 Markdown 代码围栏、解释文字或额外字段。
`.trim()

const MAX_OPTIONAL_CONTEXT_PROMPT_CHARS = 12_000

const TASKLIST_STRATEGY_SYSTEM_PROMPT = `
你是 AI Mind 的 Controlled Planner Lite，只负责为 tasklist 草稿生成拆分策略。

硬性规则：
1. 只输出合法 JSON，不要输出 Markdown、解释性前后缀或代码围栏。
2. 输出必须是 TasklistStrategy，不要包含 decision 字段。
3. strategy 必须真实影响后续 tasklist：Step 数量、拆分粒度、分组方式和优先级都要可执行。
4. 不要新增 version plan 中没有的能力范围，不要写入文件，不要扫描 docs。

输出 JSON 形状：
{
  "granularity": "coarse | medium | detailed",
  "expectedStepRange": [3, 7],
  "grouping": ["..."],
  "priority": ["..."],
  "reason": "..."
}

合法示例：
{
  "granularity": "medium",
  "expectedStepRange": [3, 6],
  "grouping": ["Runtime", "Validation", "Docs"],
  "priority": ["先保护主链路", "再补结构校验", "最后收口文档"],
  "reason": "版本目标清晰，适合按运行时、验证和文档分组拆分。"
}

最终提醒：只输出一个 JSON 对象；不要输出 Markdown 代码围栏、解释文字或额外字段。
`.trim()

function stripJsonFence(text: string) {
    const trimmedText = text.trim()
    const fenceMatch = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmedText)

    return (fenceMatch?.[1] ?? trimmedText).trim()
}

function formatListForPrompt(title: string, items: string[]) {
    if (items.length === 0) {
        return `${title}：未识别`
    }

    return [title, ...items.map(item => `- ${item}`)].join('\n')
}

export interface PlanningPromptState {
    artifacts: {
        planning: VersionPlanTasklistPlanningArtifacts
        versionPlan?: VersionPlanTasklistIntermediateArtifacts['versionPlan']
    }
    versionPlanReference: ChatComposerReference
}

function formatPlanningInput(state: PlanningPromptState) {
    const extract = state.artifacts.versionPlan?.extract

    if (!extract) {
        return 'planExtract：未生成'
    }

    return [
        'planExtract：',
        `标题：${extract.title ?? '未识别'}`,
        `目标版本：${extract.targetVersion}`,
        `摘要：${extract.summary ?? '未识别'}`,
        formatListForPrompt('Goals', extract.goals),
        formatListForPrompt('Non-goals', extract.nonGoals),
        formatListForPrompt('Key Changes', extract.keyChanges),
        formatListForPrompt('Interface Changes', extract.interfaceChanges),
        formatListForPrompt('Test Plan', extract.testPlan),
    ].join('\n\n')
}

function formatOptionalContextForPrompt(state: PlanningPromptState) {
    const optionalContext = state.artifacts.planning.optionalContext

    if (!optionalContext) {
        return 'optionalContext：未读取'
    }

    if (optionalContext.status === 'failed') {
        return ['optionalContext：读取失败', `资源：${optionalContext.uri}`, `错误：${optionalContext.errorMessage ?? '未知错误'}`].join(
            '\n'
        )
    }

    const content = optionalContext.content ?? ''
    const truncatedContent =
        content.length > MAX_OPTIONAL_CONTEXT_PROMPT_CHARS
            ? `${content.slice(0, MAX_OPTIONAL_CONTEXT_PROMPT_CHARS)}\n\n<!-- optional context truncated for strategy planning -->`
            : content

    return ['optionalContext：', `资源：${optionalContext.uri}`, truncatedContent].join('\n')
}

function getModelResponseText(response: unknown) {
    if (response && typeof response === 'object' && 'content' in response) {
        return getMessageContentText((response as { content?: unknown }).content).trim()
    }

    return ''
}

export function buildPlanningDecisionMessages(state: PlanningPromptState, userGoal: string) {
    return [
        new SystemMessage(PLANNING_DECISION_SYSTEM_PROMPT),
        new HumanMessage(
            [
                `用户目标：${userGoal || '基于版本方案生成 tasklist 草稿'}`,
                '',
                `来源方案 URI：${state.artifacts.versionPlan?.uri ?? state.versionPlanReference.uri}`,
                '',
                formatPlanningInput(state),
                '',
                'PlanReadinessResult：',
                JSON.stringify(state.artifacts.planning.readiness ?? null, null, 2),
                '',
                'allowedActions：',
                '- proceed_to_tasklist_strategy：version plan 足够完整，可以进入 tasklist 拆分策略。',
                `- read_optional_context：只允许 resourceUri 是 ${VERSION_PLAN_TASKLIST_OPTIONAL_CONTEXT_RESOURCE_URIS.join(', ')}。`,
                '- ask_clarification：缺少一个关键但可补充的信息，本轮输出一个澄清问题后结束。',
                '- proceed_with_manual_review_items：可以继续，但需要把轻度不确定点写入人工复核点。',
                '- stop_with_boundary_message：当前输入越界或不符合 version plan 前提，本轮直接停止。',
            ].join('\n')
        ),
    ]
}

export function buildTasklistStrategyMessages(state: PlanningPromptState, userGoal: string) {
    return [
        new SystemMessage(TASKLIST_STRATEGY_SYSTEM_PROMPT),
        new HumanMessage(
            [
                `用户目标：${userGoal || '基于版本方案生成 tasklist 草稿'}`,
                '',
                `来源方案 URI：${state.artifacts.versionPlan?.uri ?? state.versionPlanReference.uri}`,
                '',
                formatPlanningInput(state),
                '',
                'PlanReadinessResult：',
                JSON.stringify(state.artifacts.planning.readiness ?? null, null, 2),
                '',
                'PlanningDecisionAction：',
                JSON.stringify(state.artifacts.planning.decision ?? null, null, 2),
                '',
                formatOptionalContextForPrompt(state),
            ].join('\n')
        ),
    ]
}

export async function generatePlanningDecisionOutput(
    model: ChatSession['baseModel'],
    state: PlanningPromptState,
    userGoal: string,
    signal?: AbortSignal
): Promise<PlanningDecisionOutput> {
    const response = await model.invoke(buildPlanningDecisionMessages(state, userGoal), { signal })
    const responseText = stripJsonFence(getModelResponseText(response))
    const parsedOutput = parseVersionPlanTasklistPlanningDecisionOutputText(responseText)

    if (!parsedOutput.success || !parsedOutput.output) {
        throw new ControlledPlannerOutputError('planning_decision', parsedOutput.error ?? '规划决策输出不符合预期 schema。')
    }

    return parsedOutput.output
}

export async function generateTasklistStrategy(
    model: ChatSession['baseModel'],
    state: PlanningPromptState,
    userGoal: string,
    signal?: AbortSignal
): Promise<TasklistStrategy> {
    const response = await model.invoke(buildTasklistStrategyMessages(state, userGoal), { signal })
    const responseText = stripJsonFence(getModelResponseText(response))
    let responseJson: unknown

    try {
        responseJson = JSON.parse(responseText)
    } catch {
        throw new ControlledPlannerOutputError('tasklist_strategy', '任务清单拆分策略输出不是合法 JSON。')
    }

    const parsedStrategy = parseVersionPlanTasklistStrategy(responseJson)

    if (!parsedStrategy.success || !parsedStrategy.strategy) {
        throw new ControlledPlannerOutputError('tasklist_strategy', parsedStrategy.error ?? '任务清单拆分策略输出不符合预期 schema。')
    }

    return parsedStrategy.strategy
}
