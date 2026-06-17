import type { StreamErrorCode } from '@ai-mind/stream-core/protocol'

import { createId } from '@/lib/ai/create-id'
import { projectDocsResourceAdapter } from '@/lib/ai/mcp/adapters'
import { PROJECT_DOCS_SERVER_ID } from '@/lib/ai/mcp/adapters/docs-resource-shared'
import { MCPHostError, toErrorMessage } from '@/lib/ai/mcp/protocol/errors'

import { throwIfAborted, writeStreamErrorChunk } from '../../stream-errors'
import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { VersionPlanExtract } from '../contract/types'
import type { VersionPlanTasklistGraphStateAnnotationState, VersionPlanTasklistGraphStatePatch } from '../graph/graph-state'
import { extractVersionPlan } from '../planner/plan-extract'
import { evaluatePlanReadiness } from '../planner/plan-readiness'
import { applyVersionPlanTasklistGraphAction } from '../state/state-machine'

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
          success: true
          update: VersionPlanTasklistGraphStatePatch
      }
    | {
          errorMessage: string
          success: false
      }

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

function writeVersionPlanResourceError(
    writeChunk: WriteChunk,
    partId: string,
    error: unknown,
    state: VersionPlanTasklistGraphStateAnnotationState
) {
    writeStreamErrorChunk(writeChunk, {
        errorCode: toMCPStreamErrorCode(error),
        location: 'local',
        message: toErrorMessage(error),
        partId,
        resourceName: state.source.versionPlanReference.label,
        retryable: true,
        scope: 'resource',
        serverId: PROJECT_DOCS_SERVER_ID,
        source: 'mcp',
        stage: 'runtime',
        uri: state.source.versionPlanReference.uri,
    })
}

export async function readVersionPlanForTasklistAgent(
    state: VersionPlanTasklistGraphStateAnnotationState,
    options: ReadVersionPlanOptions
): Promise<VersionPlanReadResult> {
    const resourcePartId = createId()
    options.writeChunk({
        location: 'local',
        partId: resourcePartId,
        resourceName: state.source.versionPlanReference.label,
        serverId: PROJECT_DOCS_SERVER_ID,
        source: 'mcp',
        type: 'resource-start',
        uri: state.source.versionPlanReference.uri,
    })

    try {
        throwIfAborted(options.context.signal)

        const resource = await projectDocsResourceAdapter.read({
            uri: state.source.versionPlanReference.uri,
        })
        const extract = extractVersionPlan(resource.content, {
            planUri: resource.uri,
            userGoal: options.userGoal,
        })
        const readiness = evaluatePlanReadiness(extract, {
            planContent: resource.content,
            planUri: resource.uri,
        })
        const advancedUpdate = applyVersionPlanTasklistGraphAction(state, {
            reason: '读取用户显式引用的 version plan。',
            resourceUri: resource.uri,
            type: 'read_resource',
        })
        const update: VersionPlanTasklistGraphStatePatch = {
            ...advancedUpdate,
            planning: {
                readiness,
            },
            source: {
                versionPlan: {
                    content: resource.content,
                    extract,
                    reference: state.source.versionPlanReference,
                    resourceName: resource.resourceName,
                    uri: resource.uri,
                },
            },
        }

        options.writeChunk({
            contentPreview: resource.contentPreview,
            isTruncated: resource.truncated,
            location: 'local',
            partId: resourcePartId,
            previewChars: resource.previewChars,
            resourceName: resource.resourceName,
            serverId: resource.serverId,
            source: 'mcp',
            type: 'resource-end',
            uri: resource.uri,
        })

        return {
            extract,
            resourceName: resource.resourceName,
            success: true,
            update,
        }
    } catch (error) {
        if (options.context.signal?.aborted) {
            throw error
        }

        writeVersionPlanResourceError(options.writeChunk, resourcePartId, error, state)

        return {
            errorMessage: toErrorMessage(error),
            success: false,
        }
    }
}
