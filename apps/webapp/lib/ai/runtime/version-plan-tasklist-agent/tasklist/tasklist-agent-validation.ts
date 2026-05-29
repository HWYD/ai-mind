import type { ToolCall } from '@langchain/core/messages'

import { createId } from '@/lib/ai/create-id'
import type { ChatToolDefinition } from '@/lib/ai/tools'
import { type TasklistValidationResult, tasklistValidationResultSchema } from '@/lib/ai/tools/tasklist-structure'

import { executeToolCall } from '../../tool-runtime'
import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { VersionPlanTasklistAgentState } from '../contract/types'
import { getVersionPlanTasklistAgentToolDefinitionMap } from '../resources/agent-tools'
import { applyVersionPlanTasklistAgentAction } from '../state/state-machine'
import { endAgentStep, getNextStepIndex, startAgentStep } from '../stream/tasklist-agent-step-stream'

const VALIDATE_TASKLIST_TOOL_NAME = 'validate_tasklist_structure'

function createValidateTasklistToolCall(state: VersionPlanTasklistAgentState): ToolCall {
    const draft = state.artifacts.tasklistDraft

    if (!draft) {
        throw new Error('缺少任务清单草稿，无法执行结构校验。')
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
        ...result.weakSections.map(section => section.code),
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

export function createValidationResultForRevision(result: TasklistValidationResult, fixNow: string[]): TasklistValidationResult {
    const fixNowCodes = new Set(fixNow)
    const blockingIssues = result.blockingIssues.filter(issue => fixNowCodes.has(issue.code))
    const weakSections = result.weakSections.filter(section => fixNowCodes.has(section.code))

    return {
        blockingIssues,
        missingSections: weakSections.map(section => section.section),
        revisionHints: [...blockingIssues.map(issue => issue.suggestion), ...weakSections.map(section => section.suggestion)],
        score: result.score,
        status: blockingIssues.length > 0 ? 'fail' : weakSections.length > 0 ? 'warning' : 'pass',
        weakSections,
    }
}

export async function runValidateTasklistStep(options: {
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
            reason: '执行任务清单结构质量门校验。',
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
            error: error instanceof Error ? error.message : '任务清单结构校验失败。',
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

function attachValidationResult(state: VersionPlanTasklistAgentState, result: TasklistValidationResult): VersionPlanTasklistAgentState {
    const draft = state.artifacts.tasklistDraft

    if (!draft) {
        throw new Error('缺少任务清单草稿 artifact，无法写入结构校验结果。')
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
