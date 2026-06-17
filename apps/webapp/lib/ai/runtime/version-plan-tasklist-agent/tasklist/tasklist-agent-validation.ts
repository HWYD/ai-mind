import type { ToolCall } from '@langchain/core/messages'

import { createId } from '@/lib/ai/create-id'
import type { ChatToolDefinition } from '@/lib/ai/tools'
import { type TasklistValidationResult, tasklistValidationResultSchema } from '@/lib/ai/tools/tasklist-structure'

import { executeToolCall } from '../../tool-runtime'
import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { VersionPlanTasklistGraphStateAnnotationState, VersionPlanTasklistGraphStatePatch } from '../graph/graph-state'
import { getVersionPlanTasklistAgentToolDefinitionMap } from '../resources/agent-tools'
import { applyVersionPlanTasklistGraphAction } from '../state/state-machine'

const VALIDATE_TASKLIST_TOOL_NAME = 'validate_tasklist_structure'

function createValidateTasklistToolCall(state: VersionPlanTasklistGraphStateAnnotationState): ToolCall {
    const draft = state.tasklist.draft

    if (!draft) {
        throw new Error('Missing tasklist draft.')
    }

    return {
        args: {
            draftText: draft.content,
            planUri: draft.planUri,
            targetVersion: draft.targetVersion,
        },
        id: createId(),
        name: VALIDATE_TASKLIST_TOOL_NAME,
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
    state: VersionPlanTasklistGraphStateAnnotationState
    title: string
    writeChunk: WriteChunk
}): Promise<{ result: TasklistValidationResult; update: VersionPlanTasklistGraphStatePatch }> {
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
        throw new Error('validate_tasklist_structure returned an invalid result.')
    }

    const advancedUpdate = applyVersionPlanTasklistGraphAction(options.state, {
        arguments: toolCall.args as Record<string, unknown>,
        reason: '执行任务清单结构质量门校验。',
        toolName: VALIDATE_TASKLIST_TOOL_NAME,
        type: 'call_tool',
    })
    const draft = options.state.tasklist.draft

    if (!draft) {
        throw new Error('Missing tasklist draft.')
    }

    const updatedDraft = {
        ...draft,
        validationV1: draft.version === 1 ? parsedResult.data : draft.validationV1,
        validationV2: draft.version === 2 ? parsedResult.data : draft.validationV2,
    }

    return {
        result: parsedResult.data,
        update: {
            ...advancedUpdate,
            tasklist: {
                draft: updatedDraft,
            },
        },
    }
}
