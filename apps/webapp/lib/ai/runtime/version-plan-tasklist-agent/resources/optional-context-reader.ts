import type { StreamErrorCode } from '@ai-mind/stream-core/protocol'

import { createId } from '@/lib/ai/create-id'
import { projectDocsResourceAdapter } from '@/lib/ai/mcp/adapters'
import { PROJECT_DOCS_SERVER_ID } from '@/lib/ai/mcp/adapters/docs-resource-shared'
import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'
import { MCPHostError, toErrorMessage } from '@/lib/ai/mcp/protocol/errors'

import { throwIfAborted, writeStreamErrorChunk } from '../../stream-errors'
import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { VersionPlanTasklistOptionalContextResourceUri } from '../contract/types'
import type { VersionPlanTasklistGraphStateAnnotationState, VersionPlanTasklistGraphStatePatch } from '../graph/graph-state'
import { applyVersionPlanTasklistGraphAction } from '../state/state-machine'

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
    success: boolean
    update: VersionPlanTasklistGraphStatePatch
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
        resourceName: resourceUri.replace(/^demo:\/\//, ''),
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

function createOptionalContextFailurePlanningPatch(
    state: VersionPlanTasklistGraphStateAnnotationState,
    options: {
        errorMessage: string
        location: 'local' | 'remote'
        resourceName: string
        resourceUri: VersionPlanTasklistOptionalContextResourceUri
        serverId: string
    }
) {
    return {
        manualReviewItems: [
            ...state.planning.manualReviewItems,
            {
                detail: `${options.resourceUri} 读取失败：${options.errorMessage}。本轮已降级为仅基于 version plan 继续生成。`,
                severity: 'warning' as const,
                title: '补充上下文读取失败',
            },
        ],
        optionalContext: {
            errorMessage: options.errorMessage,
            location: options.location,
            resourceName: options.resourceName,
            serverId: options.serverId,
            status: 'failed' as const,
            uri: options.resourceUri,
        },
    }
}

export async function readOptionalContextForTasklistAgent(
    state: VersionPlanTasklistGraphStateAnnotationState,
    options: ReadOptionalContextOptions
): Promise<OptionalContextReadResult> {
    const resourcePartId = createId()
    const metadata = getOptionalContextResourceMetadata(options.resourceUri)
    const advancedUpdate = applyVersionPlanTasklistGraphAction(state, {
        reason: '读取规划决策指定的白名单补充上下文。',
        resourceUri: options.resourceUri,
        type: 'read_resource',
    })

    options.writeChunk({
        location: metadata.location,
        partId: resourcePartId,
        resourceName: metadata.resourceName,
        serverId: metadata.serverId,
        source: 'mcp',
        type: 'resource-start',
        uri: options.resourceUri,
    })

    try {
        throwIfAborted(options.context.signal)
        const resource = await readOptionalContextContent(options.resourceUri)
        const update: VersionPlanTasklistGraphStatePatch = {
            ...advancedUpdate,
            planning: {
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
        }

        options.writeChunk({
            contentPreview: resource.contentPreview,
            isTruncated: resource.truncated,
            location: metadata.location,
            partId: resourcePartId,
            previewChars: resource.previewChars,
            resourceName: resource.resourceName,
            serverId: resource.serverId,
            source: 'mcp',
            type: 'resource-end',
            uri: resource.uri,
        })

        return {
            success: true,
            update,
        }
    } catch (error) {
        if (options.context.signal?.aborted) {
            throw error
        }

        const errorMessage = toErrorMessage(error)
        const update: VersionPlanTasklistGraphStatePatch = {
            ...advancedUpdate,
            planning: createOptionalContextFailurePlanningPatch(state, {
                errorMessage,
                location: metadata.location,
                resourceName: metadata.resourceName,
                resourceUri: options.resourceUri,
                serverId: metadata.serverId,
            }),
        }

        writeStreamErrorChunk(options.writeChunk, {
            errorCode: toMCPStreamErrorCode(error),
            location: metadata.location,
            message: errorMessage,
            partId: resourcePartId,
            resourceName: metadata.resourceName,
            retryable: true,
            scope: 'resource',
            serverId: metadata.serverId,
            source: 'mcp',
            stage: 'runtime',
            uri: options.resourceUri,
        })

        return {
            success: false,
            update,
        }
    }
}
