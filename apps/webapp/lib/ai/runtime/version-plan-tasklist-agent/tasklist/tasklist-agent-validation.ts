import type { ToolCall } from '@langchain/core/messages'

import { createId } from '@/lib/ai/create-id'
import type { ChatToolDefinition } from '@/lib/ai/tools'
import { type TasklistValidationResult, tasklistValidationResultSchema } from '@/lib/ai/tools/tasklist-structure'

import { executeToolCall } from '../../tool-runtime'
import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { VersionPlanTasklistAgentState } from '../contract/types'
import { getVersionPlanTasklistAgentToolDefinitionMap } from '../resources/agent-tools'
import { applyVersionPlanTasklistAgentAction } from '../state/state-machine'

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

    return {
        result: parsedResult.data,
        state: nextState,
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
