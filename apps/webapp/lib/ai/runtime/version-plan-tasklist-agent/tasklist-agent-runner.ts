import { writeStaticTextPart } from '@ai-mind/stream-core'
import type { ToolCall } from '@langchain/core/messages'

import { createId } from '@/lib/ai/create-id'
import type { ChatToolDefinition } from '@/lib/ai/tools'
import { type TasklistValidationResult, tasklistValidationResultSchema } from '@/lib/ai/tools/tasklist-structure'

import { executeToolCall } from '../tool-runtime'
import type { ChatExecutionContext, ChatSession, WriteChunk } from '../types'
import { getVersionPlanTasklistAgentToolDefinitionMap } from './agent-tools'
import { applyVersionPlanTasklistAgentAction } from './state-machine'
import { generateTasklistDraft, reviseTasklistDraft } from './tasklist-draft-generator'
import type { VersionPlanTasklistAgentAction, VersionPlanTasklistAgentState, VersionPlanTasklistToolName } from './types'

interface RunVersionPlanTasklistAgentOptions {
    context: ChatExecutionContext
    initialState: VersionPlanTasklistAgentState
    model: ChatSession['baseModel']
    userGoal: string
    writeChunk: WriteChunk
}

interface AgentStepOptions {
    actionType: VersionPlanTasklistAgentAction['type']
    state: VersionPlanTasklistAgentState
    stepIndex: number
    title: string
    writeChunk: WriteChunk
}

const VALIDATE_TASKLIST_TOOL_NAME: VersionPlanTasklistToolName = 'validate_tasklist_structure'

function getNextStepIndex(state: VersionPlanTasklistAgentState) {
    return state.counters.steps + 1
}

function startAgentStep(options: AgentStepOptions) {
    const partId = createId()

    options.writeChunk({
        type: 'agent-step-start',
        partId,
        runId: options.state.runId,
        agentName: options.state.agentName,
        stepIndex: options.stepIndex,
        actionType: options.actionType,
        title: options.title,
    })

    return {
        partId,
        startedAt: Date.now(),
    }
}

function endAgentStep(
    options: AgentStepOptions & {
        durationStartedAt: number
        error?: string
        partId: string
        severity?: 'error' | 'info' | 'warning'
        status?: 'completed' | 'failed' | 'skipped'
        summary?: string
        tags?: string[]
    }
) {
    options.writeChunk({
        type: 'agent-step-end',
        partId: options.partId,
        runId: options.state.runId,
        agentName: options.state.agentName,
        stepIndex: options.stepIndex,
        actionType: options.actionType,
        status: options.status ?? 'completed',
        title: options.title,
        summary: options.summary,
        durationMs: Date.now() - options.durationStartedAt,
        severity: options.severity ?? 'info',
        tags: options.tags,
        error: options.error,
    })
}

function createValidateTasklistToolCall(state: VersionPlanTasklistAgentState): ToolCall {
    const draft = state.artifacts.tasklistDraft

    if (!draft) {
        throw new Error('缺少 tasklist 草稿，无法执行结构校验。')
    }

    return {
        id: createId(),
        name: VALIDATE_TASKLIST_TOOL_NAME,
        args: {
            draftText: draft.content,
            planUri: draft.planUri,
            targetVersion: draft.targetVersion,
        },
        type: 'tool_call',
    }
}

function getValidationTags(result: TasklistValidationResult) {
    if (result.status === 'pass') {
        return [`score: ${result.score}`]
    }

    return [
        `score: ${result.score}`,
        ...result.blockingIssues.map(issue => issue.code),
        ...result.weakSections.map(section => {
            const stepMatch = /^step\s*(\d+)/i.exec(section.section.trim())

            return stepMatch ? `Step ${stepMatch[1]} ${section.issue}` : section.section
        }),
    ].slice(0, 3)
}

function getValidationSummary(result: TasklistValidationResult) {
    if (result.status === 'pass') {
        return `结构校验通过，评分 ${result.score}。`
    }

    if (result.status === 'fail') {
        return `结构校验发现 ${result.blockingIssues.length} 个阻塞问题和 ${result.weakSections.length} 个弱项。`
    }

    return `结构校验发现 ${result.weakSections.length} 个可改进弱项。`
}

function shouldReviseTasklist(result: TasklistValidationResult) {
    if (result.status === 'fail') {
        return true
    }

    return result.status === 'warning' && result.weakSections.some(section => section.autoFixable)
}

function attachDraftContent(state: VersionPlanTasklistAgentState, content: string): VersionPlanTasklistAgentState {
    const draft = state.artifacts.tasklistDraft

    if (!draft) {
        throw new Error('缺少 tasklistDraft artifact，无法写入草稿内容。')
    }

    return {
        ...state,
        artifacts: {
            ...state.artifacts,
            tasklistDraft: {
                ...draft,
                content,
            },
        },
    }
}

function attachValidationResult(state: VersionPlanTasklistAgentState, result: TasklistValidationResult): VersionPlanTasklistAgentState {
    const draft = state.artifacts.tasklistDraft

    if (!draft) {
        throw new Error('缺少 tasklistDraft artifact，无法写入结构校验结果。')
    }

    return {
        ...state,
        artifacts: {
            ...state.artifacts,
            tasklistDraft: {
                ...draft,
                validationV1: draft.version === 1 ? result : draft.validationV1,
                validationV2: draft.version === 2 ? result : draft.validationV2,
            },
        },
    }
}

function buildFinalAnswer(state: VersionPlanTasklistAgentState) {
    const draft = state.artifacts.tasklistDraft
    const validationResult = draft?.validationV2 ?? draft?.validationV1

    if (!draft || !validationResult) {
        throw new Error('缺少 tasklist 草稿或结构校验结果，无法输出最终回答。')
    }

    const revisionCount = state.counters.draftRevisions
    const manualConfirmationItems = [
        draft.targetVersion === 'unknown' ? '- 未能可靠识别目标版本号，请人工确认 tasklist 标题中的版本号。' : null,
        validationResult.status !== 'pass' ? '- 结构校验仍存在 warning / fail，请人工确认是否接受当前草稿。' : null,
        '- 本轮没有写入 docs 文件；如需落盘，请人工复制确认后的 tasklist。',
    ].filter(Boolean)

    return [
        '以下是基于显式引用的 version plan 生成的 tasklist 草稿：',
        '',
        draft.content,
        '',
        '---',
        '',
        '## 结构校验结论',
        '',
        `- 状态：${validationResult.status}`,
        `- 评分：${validationResult.score}`,
        `- 自动修正：${revisionCount > 0 ? `已修正 ${revisionCount} 次` : '未触发修正'}`,
        `- 阻塞问题：${validationResult.blockingIssues.length} 个`,
        `- 弱项：${validationResult.weakSections.length} 个`,
        '',
        '## 人工确认点',
        '',
        manualConfirmationItems.join('\n'),
    ].join('\n')
}

async function runDraftTasklistStep(options: RunVersionPlanTasklistAgentOptions) {
    const stepIndex = getNextStepIndex(options.initialState)
    const step = startAgentStep({
        actionType: 'draft_tasklist',
        state: options.initialState,
        stepIndex,
        title: '生成 tasklist 草稿 v1',
        writeChunk: options.writeChunk,
    })

    try {
        const versionPlan = options.initialState.artifacts.versionPlan
        const draftText = await generateTasklistDraft(options.model, options.initialState, options.userGoal, options.context.signal)
        const advancedState = applyVersionPlanTasklistAgentAction(options.initialState, {
            type: 'draft_tasklist',
            goal: options.userGoal || '基于版本方案生成 tasklist 草稿',
            planUri: versionPlan?.uri ?? options.initialState.versionPlanReference.uri,
            reason: '基于已读取的 version plan 生成 tasklistDraft v1。',
            targetVersion: versionPlan?.extract?.targetVersion,
        })
        const nextState = attachDraftContent(advancedState, draftText)

        endAgentStep({
            actionType: 'draft_tasklist',
            durationStartedAt: step.startedAt,
            partId: step.partId,
            state: nextState,
            stepIndex,
            summary: `已生成 tasklistDraft v1，长度 ${draftText.length} 字符。`,
            tags: [`targetVersion: ${versionPlan?.extract?.targetVersion ?? 'unknown'}`],
            title: '生成 tasklist 草稿 v1',
            writeChunk: options.writeChunk,
        })

        return nextState
    } catch (error) {
        endAgentStep({
            actionType: 'draft_tasklist',
            durationStartedAt: step.startedAt,
            error: error instanceof Error ? error.message : 'tasklist 草稿生成失败。',
            partId: step.partId,
            severity: 'error',
            state: options.initialState,
            status: 'failed',
            stepIndex,
            title: '生成 tasklist 草稿 v1',
            writeChunk: options.writeChunk,
        })
        throw error
    }
}

async function runValidateTasklistStep(options: {
    context: ChatExecutionContext
    state: VersionPlanTasklistAgentState
    title: string
    writeChunk: WriteChunk
}) {
    const stepIndex = getNextStepIndex(options.state)
    const step = startAgentStep({
        actionType: 'call_tool',
        state: options.state,
        stepIndex,
        title: options.title,
        writeChunk: options.writeChunk,
    })

    try {
        const toolCall = createValidateTasklistToolCall(options.state)
        const toolDefinitionMap = new Map<string, ChatToolDefinition>(getVersionPlanTasklistAgentToolDefinitionMap())
        const executedToolResult = await executeToolCall(toolCall, options.context, options.writeChunk, {
            errorStage: 'tool-execution',
            toolDefinitionMap,
        })

        if (!executedToolResult.success) {
            throw new Error(executedToolResult.output)
        }

        const parsedResult = tasklistValidationResultSchema.safeParse(executedToolResult.rawResult)

        if (!parsedResult.success) {
            throw new Error('validate_tasklist_structure 返回结果不符合预期 schema。')
        }

        const advancedState = applyVersionPlanTasklistAgentAction(options.state, {
            type: 'call_tool',
            arguments: toolCall.args as Record<string, unknown>,
            reason: '执行 tasklist 结构质量门校验。',
            toolName: VALIDATE_TASKLIST_TOOL_NAME,
        })
        const nextState = attachValidationResult(advancedState, parsedResult.data)
        const severity = parsedResult.data.status === 'pass' ? 'info' : 'warning'

        endAgentStep({
            actionType: 'call_tool',
            durationStartedAt: step.startedAt,
            partId: step.partId,
            severity,
            state: nextState,
            stepIndex,
            summary: getValidationSummary(parsedResult.data),
            tags: getValidationTags(parsedResult.data),
            title: options.title,
            writeChunk: options.writeChunk,
        })

        return {
            result: parsedResult.data,
            state: nextState,
        }
    } catch (error) {
        endAgentStep({
            actionType: 'call_tool',
            durationStartedAt: step.startedAt,
            error: error instanceof Error ? error.message : 'tasklist 结构校验失败。',
            partId: step.partId,
            severity: 'error',
            state: options.state,
            status: 'failed',
            stepIndex,
            title: options.title,
            writeChunk: options.writeChunk,
        })
        throw error
    }
}

async function runReviseTasklistStep(options: RunVersionPlanTasklistAgentOptions & { state: VersionPlanTasklistAgentState }) {
    const draft = options.state.artifacts.tasklistDraft
    const validationResult = draft?.validationV1

    if (!draft || !validationResult) {
        throw new Error('缺少 v1 草稿或校验结果，无法执行自动修正。')
    }

    const stepIndex = getNextStepIndex(options.state)
    const step = startAgentStep({
        actionType: 'revise_tasklist',
        state: options.state,
        stepIndex,
        title: '自动修正 tasklist 草稿 v2',
        writeChunk: options.writeChunk,
    })

    try {
        const revisedDraftText = await reviseTasklistDraft(options.model, options.state, draft, validationResult, options.context.signal)
        const advancedState = applyVersionPlanTasklistAgentAction(options.state, {
            type: 'revise_tasklist',
            reason: '根据结构校验 findings 自动修正一次 tasklist 草稿。',
        })
        const nextState = attachDraftContent(advancedState, revisedDraftText)

        endAgentStep({
            actionType: 'revise_tasklist',
            durationStartedAt: step.startedAt,
            partId: step.partId,
            state: nextState,
            stepIndex,
            summary: `已生成 tasklistDraft v2，长度 ${revisedDraftText.length} 字符。`,
            tags: [`revision: ${nextState.counters.draftRevisions}`],
            title: '自动修正 tasklist 草稿 v2',
            writeChunk: options.writeChunk,
        })

        return nextState
    } catch (error) {
        endAgentStep({
            actionType: 'revise_tasklist',
            durationStartedAt: step.startedAt,
            error: error instanceof Error ? error.message : 'tasklist 自动修正失败。',
            partId: step.partId,
            severity: 'error',
            state: options.state,
            status: 'failed',
            stepIndex,
            title: '自动修正 tasklist 草稿 v2',
            writeChunk: options.writeChunk,
        })
        throw error
    }
}

function runFinalAnswerStep(options: { state: VersionPlanTasklistAgentState; writeChunk: WriteChunk }) {
    const stepIndex = getNextStepIndex(options.state)
    const step = startAgentStep({
        actionType: 'final_answer',
        state: options.state,
        stepIndex,
        title: '输出最终回答',
        writeChunk: options.writeChunk,
    })
    const answer = buildFinalAnswer(options.state)
    const finalState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'final_answer',
        reason: '输出 tasklist 草稿、结构校验结论和人工确认点。',
    })

    writeStaticTextPart(options.writeChunk, answer)
    endAgentStep({
        actionType: 'final_answer',
        durationStartedAt: step.startedAt,
        partId: step.partId,
        state: finalState,
        stepIndex,
        summary: `已输出 tasklistDraft v${finalState.artifacts.tasklistDraft?.version ?? 1} 和结构校验结论。`,
        tags: [`revision: ${finalState.counters.draftRevisions}`],
        title: '输出最终回答',
        writeChunk: options.writeChunk,
    })

    return finalState
}

/**
 * 执行受控 Tasklist Agent 主链路：生成草稿、结构校验、必要时修正一次，并输出最终答案。
 */
export async function runVersionPlanTasklistAgent(options: RunVersionPlanTasklistAgentOptions) {
    let state = await runDraftTasklistStep(options)
    const validationV1 = await runValidateTasklistStep({
        context: options.context,
        state,
        title: '校验 tasklist 结构 v1',
        writeChunk: options.writeChunk,
    })

    state = validationV1.state

    if (shouldReviseTasklist(validationV1.result)) {
        state = await runReviseTasklistStep({
            ...options,
            initialState: state,
            state,
        })
        state = (
            await runValidateTasklistStep({
                context: options.context,
                state,
                title: '再次校验 tasklist 结构 v2',
                writeChunk: options.writeChunk,
            })
        ).state
    }

    return runFinalAnswerStep({
        state,
        writeChunk: options.writeChunk,
    })
}
