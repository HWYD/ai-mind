import type { StreamErrorCode } from '@ai-mind/stream-core/protocol'

import { createId } from '@/lib/ai/create-id'
import { projectDocsResourceAdapter } from '@/lib/ai/mcp/adapters'
import { PROJECT_DOCS_SERVER_ID } from '@/lib/ai/mcp/adapters/docs-resource-shared'
import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'
import { MCPHostError, toErrorMessage } from '@/lib/ai/mcp/protocol/errors'

import { throwIfAborted, writeStreamErrorChunk } from '../../stream-errors'
import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { VersionPlanTasklistAgentState, VersionPlanTasklistOptionalContextResourceUri } from '../contract/types'
import { applyVersionPlanTasklistAgentAction } from '../state/state-machine'

const PROJECT_ASSISTANT_SERVER_ID = 'project-assistant-service'
const LATEST_CONTEXT_RESOURCE_NAME = 'latest-context'
const LATEST_CONTEXT_RESOURCE_URI: VersionPlanTasklistOptionalContextResourceUri = 'project://latest-context'
const OPTIONAL_CONTEXT_PREVIEW_CHARS = 3000

interface ReadOptionalContextOptions {
    context: ChatExecutionContext
    resourceUri: VersionPlanTasklistOptionalContextResourceUri
    stepIndex: number
    writeChunk: WriteChunk
}

export interface OptionalContextReadResult {
    state: VersionPlanTasklistAgentState
    success: boolean
}

function extractTextFromContentParts(contentParts: Array<unknown> | undefined) {
    const textParts: string[] = []

    for (const contentPart of contentParts ?? []) {
        if (!contentPart || typeof contentPart !== 'object') {
            continue
        }

        if ('text' in contentPart && typeof contentPart.text === 'string') {
            textParts.push(contentPart.text)
        }
    }

    return textParts.join('\n').trim()
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

function getOptionalContextResourceMetadata(resourceUri: VersionPlanTasklistOptionalContextResourceUri) {
    if (resourceUri === LATEST_CONTEXT_RESOURCE_URI) {
        return {
            location: 'remote' as const,
            resourceName: LATEST_CONTEXT_RESOURCE_NAME,
            serverId: PROJECT_ASSISTANT_SERVER_ID,
        }
    }

    return {
        location: 'local' as const,
        resourceName: resourceUri.replace(/^docs:\/\//, ''),
        serverId: PROJECT_DOCS_SERVER_ID,
    }
}

async function readOptionalContextContent(resourceUri: VersionPlanTasklistOptionalContextResourceUri) {
    if (resourceUri === LATEST_CONTEXT_RESOURCE_URI) {
        const response = await mcpClientManager.readResource(PROJECT_ASSISTANT_SERVER_ID, {
            uri: LATEST_CONTEXT_RESOURCE_URI,
        })
        const content = extractTextFromContentParts(response.result.contents)

        if (!content) {
            throw new MCPHostError('REQUEST_FAILED', 'project://latest-context 没有返回可用文本内容。')
        }

        return {
            content,
            contentPreview: content.length > OPTIONAL_CONTEXT_PREVIEW_CHARS ? content.slice(0, OPTIONAL_CONTEXT_PREVIEW_CHARS) : content,
            previewChars: OPTIONAL_CONTEXT_PREVIEW_CHARS,
            resourceName: LATEST_CONTEXT_RESOURCE_NAME,
            serverId: PROJECT_ASSISTANT_SERVER_ID,
            truncated: content.length > OPTIONAL_CONTEXT_PREVIEW_CHARS,
            uri: LATEST_CONTEXT_RESOURCE_URI,
        }
    }

    return projectDocsResourceAdapter.read({
        uri: resourceUri,
    })
}

function attachOptionalContextFailure(
    state: VersionPlanTasklistAgentState,
    options: {
        errorMessage: string
        location: 'local' | 'remote'
        resourceName: string
        resourceUri: VersionPlanTasklistOptionalContextResourceUri
        serverId: string
    }
): VersionPlanTasklistAgentState {
    return {
        ...state,
        artifacts: {
            ...state.artifacts,
            planning: {
                ...state.artifacts.planning,
                manualReviewItems: [
                    ...state.artifacts.planning.manualReviewItems,
                    {
                        detail: `${options.resourceUri} 读取失败：${options.errorMessage}。本轮已降级为仅基于 version plan 继续生成。`,
                        severity: 'warning',
                        title: '补充上下文读取失败',
                    },
                ],
                optionalContext: {
                    errorMessage: options.errorMessage,
                    location: options.location,
                    resourceName: options.resourceName,
                    serverId: options.serverId,
                    status: 'failed',
                    uri: options.resourceUri,
                },
            },
        },
    }
}

/**
 * Agent 专用 optional context 读取函数，只允许读取 PlanningDecisionAction 指定的 1 个白名单资源。
 */
export async function readOptionalContextForTasklistAgent(
    state: VersionPlanTasklistAgentState,
    options: ReadOptionalContextOptions
): Promise<OptionalContextReadResult> {
    const resourcePartId = createId()
    const metadata = getOptionalContextResourceMetadata(options.resourceUri)
    const advancedState = applyVersionPlanTasklistAgentAction(state, {
        type: 'read_resource',
        resourceUri: options.resourceUri,
        reason: '读取规划决策指定的白名单补充上下文。',
    })

    options.writeChunk({
        type: 'resource-start',
        partId: resourcePartId,
        resourceName: metadata.resourceName,
        uri: options.resourceUri,
        source: 'mcp',
        location: metadata.location,
        serverId: metadata.serverId,
    })

    try {
        throwIfAborted(options.context.signal)
        const resource = await readOptionalContextContent(options.resourceUri)
        const nextState: VersionPlanTasklistAgentState = {
            ...advancedState,
            artifacts: {
                ...advancedState.artifacts,
                planning: {
                    ...advancedState.artifacts.planning,
                    optionalContext: {
                        content: resource.content,
                        contentPreview: resource.contentPreview,
                        location: metadata.location,
                        previewChars: resource.previewChars,
                        resourceName: resource.resourceName,
                        serverId: resource.serverId,
                        status: 'completed',
                        uri: options.resourceUri,
                    },
                },
            },
        }

        options.writeChunk({
            type: 'resource-end',
            partId: resourcePartId,
            resourceName: resource.resourceName,
            uri: resource.uri,
            source: 'mcp',
            location: metadata.location,
            serverId: resource.serverId,
            contentPreview: resource.contentPreview,
            isTruncated: resource.truncated,
            previewChars: resource.previewChars,
        })

        return {
            state: nextState,
            success: true,
        }
    } catch (error) {
        if (options.context.signal?.aborted) {
            throw error
        }

        const errorMessage = toErrorMessage(error)
        const nextState = attachOptionalContextFailure(advancedState, {
            errorMessage,
            location: metadata.location,
            resourceName: metadata.resourceName,
            resourceUri: options.resourceUri,
            serverId: metadata.serverId,
        })

        writeStreamErrorChunk(options.writeChunk, {
            scope: 'resource',
            errorCode: toMCPStreamErrorCode(error),
            retryable: true,
            message: errorMessage,
            stage: 'runtime',
            partId: resourcePartId,
            resourceName: metadata.resourceName,
            uri: options.resourceUri,
            source: 'mcp',
            location: metadata.location,
            serverId: metadata.serverId,
        })

        return {
            state: nextState,
            success: false,
        }
    }
}
