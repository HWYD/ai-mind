import type { StreamErrorCode } from '@ai-mind/stream-core/protocol'

import { createId } from '@/lib/ai/create-id'
import { projectDocsResourceAdapter } from '@/lib/ai/mcp/adapters'
import { PROJECT_DOCS_SERVER_ID } from '@/lib/ai/mcp/adapters/docs-resource-shared'
import { MCPHostError, toErrorMessage } from '@/lib/ai/mcp/protocol/errors'

import { throwIfAborted, writeStreamErrorChunk } from '../../stream-errors'
import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { VersionPlanExtract, VersionPlanTasklistAgentState } from '../contract/types'
import { extractVersionPlan } from '../planner/plan-extract'
import { evaluatePlanReadiness } from '../planner/plan-readiness'
import { applyVersionPlanTasklistAgentAction } from '../state/state-machine'

interface ReadVersionPlanOptions {
    context: ChatExecutionContext
    stepIndex: number
    userGoal: string
    writeChunk: WriteChunk
}

export type VersionPlanReadResult =
    | {
          extract: VersionPlanExtract
          resourceName: string
          state: VersionPlanTasklistAgentState
          success: true
      }
    | {
          errorMessage: string
          state: VersionPlanTasklistAgentState
          success: false
      }

/**
 * 将 MCP Host 的错误码映射成前端 stream-core 已知的资源错误类型。
 */
function toMCPStreamErrorCode(error: unknown): StreamErrorCode {
    if (!(error instanceof MCPHostError)) {
        return 'MCP_EXECUTION_FAILED'
    }

    switch (error.code) {
        case 'UNAUTHORIZED':
            return 'MCP_UNAUTHORIZED'
        case 'FORBIDDEN':
            return 'MCP_FORBIDDEN'
        case 'NOT_FOUND':
        case 'SERVER_NOT_FOUND':
            return 'MCP_NOT_FOUND'
        case 'TIMEOUT':
            return 'MCP_TIMEOUT'
        default:
            return 'MCP_EXECUTION_FAILED'
    }
}

/**
 * 写入版本方案读取失败的资源级错误，让错误归属到 Resource 卡片而不是最终文本。
 */
function writeVersionPlanResourceError(writeChunk: WriteChunk, partId: string, error: unknown, state: VersionPlanTasklistAgentState) {
    // 资源读取失败仍走统一 stream error chunk，让前端可以在 Resource 卡片里归因，而不是只看到最终文本失败。
    writeStreamErrorChunk(writeChunk, {
        scope: 'resource',
        errorCode: toMCPStreamErrorCode(error),
        retryable: true,
        message: toErrorMessage(error),
        stage: 'runtime',
        partId,
        resourceName: state.versionPlanReference.label,
        uri: state.versionPlanReference.uri,
        source: 'mcp',
        location: 'local',
        serverId: PROJECT_DOCS_SERVER_ID,
    })
}

/**
 * 执行 Agent 的 read_resource 步骤：读取用户显式引用的 version plan，并生成本轮内存态的 planExtract。
 */
export async function readVersionPlanForTasklistAgent(
    state: VersionPlanTasklistAgentState,
    options: ReadVersionPlanOptions
): Promise<VersionPlanReadResult> {
    const agentStepPartId = createId()
    const resourcePartId = createId()
    const startedAt = Date.now()

    // 同一次 read_resource 会同时展示 Agent Step 和 Resource 卡片：前者解释流程，后者展示被读取的资源事实。
    options.writeChunk({
        type: 'agent-step-start',
        partId: agentStepPartId,
        runId: state.runId,
        agentName: state.agentName,
        stepIndex: options.stepIndex,
        actionType: 'read_resource',
        title: '读取版本方案',
    })
    options.writeChunk({
        type: 'resource-start',
        partId: resourcePartId,
        resourceName: state.versionPlanReference.label,
        uri: state.versionPlanReference.uri,
        source: 'mcp',
        location: 'local',
        serverId: PROJECT_DOCS_SERVER_ID,
    })

    try {
        throwIfAborted(options.context.signal)

        // 真正的 docs:// 边界校验由 projectDocsResourceAdapter 执行，这里只消费用户已显式引用的 URI。
        const resource = await projectDocsResourceAdapter.read({
            uri: state.versionPlanReference.uri,
        })
        const extract = extractVersionPlan(resource.content, {
            planUri: resource.uri,
            userGoal: options.userGoal,
        })
        const readiness = evaluatePlanReadiness(extract, {
            planContent: resource.content,
            planUri: resource.uri,
        })
        const advancedState = applyVersionPlanTasklistAgentAction(state, {
            type: 'read_resource',
            resourceUri: resource.uri,
            reason: '读取用户显式引用的 version plan。',
        })
        // 状态机只负责合法状态推进；读取到的原文和 planExtract 作为本轮内存 artifact 额外挂回 state。
        const nextState: VersionPlanTasklistAgentState = {
            ...advancedState,
            artifacts: {
                ...advancedState.artifacts,
                planning: {
                    ...advancedState.artifacts.planning,
                    readiness,
                },
                versionPlan: {
                    content: resource.content,
                    extract,
                    reference: state.versionPlanReference,
                    resourceName: resource.resourceName,
                    uri: resource.uri,
                },
            },
        }

        // 先结束 Resource 卡片，再结束 Agent Step，UI 上会先看到读取事实，再看到流程摘要和耗时。
        options.writeChunk({
            type: 'resource-end',
            partId: resourcePartId,
            resourceName: resource.resourceName,
            uri: resource.uri,
            source: 'mcp',
            location: 'local',
            serverId: resource.serverId,
            contentPreview: resource.contentPreview,
            isTruncated: resource.truncated,
            previewChars: resource.previewChars,
        })
        options.writeChunk({
            type: 'agent-step-end',
            partId: agentStepPartId,
            runId: state.runId,
            agentName: state.agentName,
            stepIndex: options.stepIndex,
            actionType: 'read_resource',
            status: 'completed',
            title: '读取版本方案',
            summary: `已读取 ${resource.resourceName}，识别目标版本 ${extract.targetVersion}。`,
            durationMs: Date.now() - startedAt,
            severity: 'info',
            tags: [`targetVersion: ${extract.targetVersion}`, `Goals: ${extract.goals.length}`, `Non-goals: ${extract.nonGoals.length}`],
        })

        return {
            extract,
            resourceName: resource.resourceName,
            state: nextState,
            success: true,
        }
    } catch (error) {
        if (options.context.signal?.aborted) {
            throw error
        }

        const errorMessage = toErrorMessage(error)

        writeVersionPlanResourceError(options.writeChunk, resourcePartId, error, state)
        options.writeChunk({
            type: 'agent-step-end',
            partId: agentStepPartId,
            runId: state.runId,
            agentName: state.agentName,
            stepIndex: options.stepIndex,
            actionType: 'read_resource',
            status: 'failed',
            title: '读取版本方案',
            summary: '版本方案读取失败，Agent 已停止继续生成 tasklist 草稿。',
            durationMs: Date.now() - startedAt,
            severity: 'error',
            error: errorMessage,
        })

        return {
            errorMessage,
            state,
            success: false,
        }
    }
}
