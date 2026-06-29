import { HumanMessage, SystemMessage } from '@langchain/core/messages'

import type { TasklistValidationResult } from '@/lib/ai/tools/tasklist-structure'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

import { getMessageContentText } from '../../message-content'
import type { ChatSession } from '../../types'
import {
    getTasklistStrategyStepCountBounds,
    type TasklistStrategyGrouping,
    type TasklistStrategyPriorityFocus,
} from '../contract/tasklist-strategy-schema'
import type {
    VersionPlanTasklistDraftArtifact,
    VersionPlanTasklistIntermediateArtifacts,
    VersionPlanTasklistPlanningArtifacts,
} from '../contract/types'

export interface TasklistDraftPromptState {
    artifacts: {
        planning: VersionPlanTasklistPlanningArtifacts
        tasklistDraft?: VersionPlanTasklistDraftArtifact
        versionPlan?: VersionPlanTasklistIntermediateArtifacts['versionPlan']
    }
    versionPlanReference: ChatComposerReference
}

const MAX_PLAN_TEXT_CHARS = 30_000
const DRAFT_SYSTEM_PROMPT = `
你是 AI Mind 的 Version Plan to Tasklist Agent，负责把用户显式引用的版本方案整理成实施 tasklist。

硬性要求：
1. 只输出 Markdown tasklist 草稿，不要输出解释性前后缀。
2. 必须基于提供的 version plan，不要新增方案中没有的功能范围。
3. tasklist 开头必须使用下面的固定元信息格式：
   # v0.x.x Tasklist

   来源方案：demo://version-plans/xxx.md
   目标版本：v0.x.x
   状态：草稿，待人工确认
4. 来源方案必须包含完整 planUri，必须保留 demo:// 前缀，不要改写成普通文件路径、相对路径或文件名。
5. 必须包含 Goals、Non-goals、本版执行纪律、Step 拆解、每个 Step 的 checklist item、每个 Step 的最小验证、工程验证、暂停点、风险 / 人工确认点。
6. 不要声称已经写入文件、数据库或 docs。
7. 不要读取历史 tasklist，不要扫描 examples/agent-demo/version-plans/ 之外的目录，不要引入 RAG、工作流编排或多 Agent。
`.trim()

const REVISE_SYSTEM_PROMPT = `
你正在修正一份 tasklist 草稿。

只允许根据 validation findings 修复结构问题：
- 补充缺失小节
- 补充或修复完整来源方案 URI
- 补充 Goals
- 补充 checklist 格式
- 补充最小验证
- 补充暂停点
- 补充工程验证
- 补充风险 / 人工确认点

禁止：
- 新增 version plan 中没有的功能范围
- 引入 Agent / RAG / 文件写入等非目标能力
- 删除已有合理任务
- 改变来源方案的版本目标

如果 validation findings 包含 missing_plan_uri / 缺少来源方案，必须优先在开头元信息区补充完整来源方案 URI，格式为：
来源方案：<完整 planUri>

修正后 tasklist 开头仍必须保留：
# v0.x.x Tasklist

来源方案：demo://version-plans/xxx.md
目标版本：v0.x.x
状态：草稿，待人工确认

只输出修正后的 Markdown tasklist，不要输出解释性前后缀。
`.trim()

function truncatePlanText(text: string) {
    if (text.length <= MAX_PLAN_TEXT_CHARS) {
        return text
    }

    return `${text.slice(0, MAX_PLAN_TEXT_CHARS)}\n\n<!-- version plan truncated for tasklist drafting -->`
}

function formatListForPrompt(title: string, items: string[]) {
    if (items.length === 0) {
        return `${title}：未识别`
    }

    return [title, ...items.map(item => `- ${item}`)].join('\n')
}

function formatPlanExtractForPrompt(state: TasklistDraftPromptState) {
    const extract = state.artifacts.versionPlan?.extract

    if (!extract) {
        return '未生成 planExtract。'
    }

    return [
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

function formatTasklistStrategyForPrompt(state: TasklistDraftPromptState) {
    const strategy = state.artifacts.planning.strategy

    if (!strategy) {
        return '未生成 TasklistStrategy。'
    }

    const [minSteps, maxSteps] = getTasklistStrategyStepCountBounds(strategy.stepCountRange)
    const granularityInstructions: Record<typeof strategy.granularity, string> = {
        coarse: '使用粗粒度拆分，Step 数量靠近范围下限，避免生成过多 Step；每个 Step 只保留关键 checklist。',
        detailed: '使用细粒度拆分，Step 数量可以靠近范围上限，checklist 要更具体，但不得新增 version plan 中没有的能力范围。',
        medium: '使用中等粒度拆分，Step 数量尽量落在范围中间区间，保持每个 Step 可实现、可验证。',
    }
    const groupingInstructions: Record<TasklistStrategyGrouping, string> = {
        by_module: '按代码模块和职责边界组织 Step。',
        by_phase: '按实施阶段和依赖顺序组织 Step。',
        by_risk: '按风险优先级组织 Step，先处理高风险主链。',
        by_test_flow: '按验证流程组织 Step，让实现与测试逐步闭环。',
    }
    const priorityFocusLabels: Record<TasklistStrategyPriorityFocus, string> = {
        compatibility: '向后兼容',
        core_runtime: '核心 Runtime',
        deployment: '部署交付',
        docs: '文档资产',
        frontend_ui: '前端交互',
        state_model: '状态模型',
        tests: '测试验证',
    }

    return [
        `granularity：${strategy.granularity}`,
        `stepCountRange：${strategy.stepCountRange}`,
        `grouping：${strategy.grouping}`,
        `groupingInstruction：${groupingInstructions[strategy.grouping]}`,
        formatListForPrompt(
            'priorityFocus（checklist 和执行顺序优先覆盖）',
            strategy.priorityFocus.map(priorityFocus => priorityFocusLabels[priorityFocus])
        ),
        `notes：${strategy.notes ?? '无'}`,
        '',
        '生成约束：',
        `- Step 数量尽量落在 ${minSteps}-${maxSteps} 个之间；如果 version plan 信息不足，不要为了凑数量编造范围。`,
        `- ${groupingInstructions[strategy.grouping]}`,
        '- 每个 Step 内 checklist 的先后顺序优先覆盖 priorityFocus。',
        `- ${granularityInstructions[strategy.granularity]}`,
    ].join('\n')
}

function stripMarkdownFence(text: string) {
    const trimmedText = text.trim()
    const fenceMatch = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(trimmedText)

    return (fenceMatch?.[1] ?? trimmedText).trim()
}

function ensureTasklistSourceMetadata(text: string, options: { planUri: string; targetVersion?: string }) {
    const targetVersion = options.targetVersion ?? 'unknown'
    const lines = text.trim().split(/\r?\n/)
    const firstLine = lines[0]?.trim()
    const hasHeading = firstLine?.startsWith('# ')
    const title = targetVersion === 'unknown' && hasHeading ? firstLine : `# ${targetVersion} Tasklist`
    const bodyLines = hasHeading ? lines.slice(1) : lines
    const bodyStartIndex = bodyLines.findIndex(line => {
        const trimmedLine = line.trim()

        return trimmedLine && !/^(来源方案|目标版本|状态)[：:]/.test(trimmedLine)
    })
    const bodyWithoutLeadingMetadata = bodyStartIndex === -1 ? [] : bodyLines.slice(bodyStartIndex)

    // 本地模型偶尔会漏写或改写来源 URI，这里只补齐头部可追溯元信息，不改动后续任务内容。
    return [
        title,
        '',
        `来源方案：${options.planUri}`,
        `目标版本：${targetVersion}`,
        '状态：草稿，待人工确认',
        '',
        ...bodyWithoutLeadingMetadata,
    ]
        .join('\n')
        .trim()
}

function getModelResponseText(response: unknown) {
    if (response && typeof response === 'object' && 'content' in response) {
        return getMessageContentText((response as { content?: unknown }).content).trim()
    }

    return ''
}

function getVersionPlanContent(state: TasklistDraftPromptState) {
    const content = state.artifacts.versionPlan?.content

    if (!content) {
        throw new Error('缺少 version plan 原文，无法生成 tasklist 草稿。')
    }

    return content
}

/**
 * 基于 version plan 原文和 planExtract 构造 v1 草稿生成提示词，保持生成任务受控。
 */
export function buildDraftTasklistMessages(state: TasklistDraftPromptState, userGoal: string) {
    const versionPlan = state.artifacts.versionPlan

    if (!versionPlan?.uri) {
        throw new Error('缺少 version plan URI，无法生成 tasklist 草稿。')
    }

    return [
        new SystemMessage(DRAFT_SYSTEM_PROMPT),
        new HumanMessage(
            [
                `用户目标：${userGoal || '基于版本方案生成 tasklist 草稿'}`,
                '',
                `来源方案 URI：${versionPlan.uri}`,
                '输出开头必须原样包含：',
                `来源方案：${versionPlan.uri}`,
                '',
                'planExtract：',
                formatPlanExtractForPrompt(state),
                '',
                'TasklistStrategy：',
                formatTasklistStrategyForPrompt(state),
                '',
                'version plan 原文：',
                truncatePlanText(getVersionPlanContent(state)),
            ].join('\n')
        ),
    ]
}

/**
 * 构造 v2 修正提示词，只允许围绕结构校验 findings 修补草稿。
 */
export function buildReviseTasklistMessages(
    state: TasklistDraftPromptState,
    draft: VersionPlanTasklistDraftArtifact,
    validationResult: TasklistValidationResult,
    revisionFeedback?: string
) {
    return [
        new SystemMessage(REVISE_SYSTEM_PROMPT),
        new HumanMessage(
            [
                `来源方案 URI：${draft.planUri}`,
                `目标版本：${draft.targetVersion ?? 'unknown'}`,
                '修正后开头必须原样包含：',
                `来源方案：${draft.planUri}`,
                '',
                'validation findings：',
                JSON.stringify(validationResult, null, 2),
                '',
                'planExtract：',
                formatPlanExtractForPrompt(state),
                '',
                ...(revisionFeedback ? ['人工修订反馈：', revisionFeedback, ''] : []),
                '原始 tasklist 草稿：',
                draft.content,
            ].join('\n')
        ),
    ]
}

/**
 * 调用基础模型生成 tasklist 草稿，并剥离模型可能包裹的 Markdown 代码围栏。
 */
export async function generateTasklistDraft(
    model: ChatSession['baseModel'],
    state: TasklistDraftPromptState,
    userGoal: string,
    signal?: AbortSignal
) {
    const response = await model.invoke(buildDraftTasklistMessages(state, userGoal), { signal })
    const draftText = stripMarkdownFence(getModelResponseText(response))
    const versionPlan = state.artifacts.versionPlan

    if (!draftText) {
        throw new Error('模型未生成 tasklist 草稿。')
    }

    return ensureTasklistSourceMetadata(draftText, {
        planUri: versionPlan?.uri ?? state.versionPlanReference.uri,
        targetVersion: versionPlan?.extract?.targetVersion,
    })
}

/**
 * 调用基础模型修正 tasklist 草稿，最多用于 v1 -> v2 -> v3 的受控结构补全。
 */
export async function reviseTasklistDraft(
    model: ChatSession['baseModel'],
    state: TasklistDraftPromptState,
    draft: VersionPlanTasklistDraftArtifact,
    validationResult: TasklistValidationResult,
    signal?: AbortSignal,
    revisionFeedback?: string
) {
    const response = await model.invoke(buildReviseTasklistMessages(state, draft, validationResult, revisionFeedback), { signal })
    const revisedText = stripMarkdownFence(getModelResponseText(response))

    if (!revisedText) {
        throw new Error('模型未生成修正后的 tasklist 草稿。')
    }

    return ensureTasklistSourceMetadata(revisedText, {
        planUri: draft.planUri,
        targetVersion: draft.targetVersion,
    })
}
