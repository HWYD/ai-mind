import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'
import { MCPHostError } from '@/lib/ai/mcp/protocol/errors'
import type { MCPResourceAdapterResult } from '@/lib/ai/mcp/protocol/types'

import {
    assertSafeDocsResourcePath,
    createDocsResourcePreview,
    createDocsResourceUri,
    MAX_PROJECT_DOCS_RESOURCE_PREVIEW_CHARS,
    PROJECT_DOCS_SERVER_ID,
} from './docs-resource-shared'
import type { MCPResourceAdapter } from './types'

export interface ProjectDocsResourceAdapterInput {
    resourcePath?: string
    uri?: string
}

const PROJECT_DOCS_RESOURCE_FALLBACK_NAME = 'demo-resource'
type ReadResourceContent = Awaited<ReturnType<typeof mcpClientManager.readResource>>['result']['contents'][number]
type TextResourceContent = ReadResourceContent & {
    _meta?: unknown
    mimeType?: string
    text: string
}

function isTextResourceContents(contentPart: ReadResourceContent): contentPart is TextResourceContent {
    return !!contentPart && typeof contentPart === 'object' && 'text' in contentPart && typeof contentPart.text === 'string'
}

function extractTextContent(result: Awaited<ReturnType<typeof mcpClientManager.readResource>>['result']): TextResourceContent | null {
    for (const contentPart of result.contents ?? []) {
        if (isTextResourceContents(contentPart)) {
            return contentPart
        }
    }

    return null
}

function toBooleanMetaValue(value: unknown) {
    return typeof value === 'boolean' ? value : undefined
}

function toNumberMetaValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toMetadataRecord(value: unknown) {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function resolveResourcePath(input: ProjectDocsResourceAdapterInput) {
    const rawPath = input.resourcePath ?? input.uri

    if (!rawPath) {
        throw new MCPHostError('REQUEST_FAILED', 'demo resource 缺少 resourcePath 或 uri 参数。')
    }

    return assertSafeDocsResourcePath(rawPath)
}

export const projectDocsResourceAdapter: MCPResourceAdapter<ProjectDocsResourceAdapterInput> = {
    async read(input): Promise<MCPResourceAdapterResult> {
        const resourcePath = resolveResourcePath(input)
        const uri = createDocsResourceUri(resourcePath)
        const response = await mcpClientManager.readResource(PROJECT_DOCS_SERVER_ID, {
            uri,
        })
        const textContent = extractTextContent(response.result)

        if (!textContent) {
            throw new MCPHostError('REQUEST_FAILED', 'demo MCP Resource 没有返回可用文本内容。')
        }

        const metadata = toMetadataRecord(textContent._meta)

        return {
            content: textContent.text,
            contentPreview: createDocsResourcePreview(textContent.text),
            previewChars: MAX_PROJECT_DOCS_RESOURCE_PREVIEW_CHARS,
            mimeType: textContent.mimeType,
            resourceName: typeof metadata.resourcePath === 'string' ? metadata.resourcePath : PROJECT_DOCS_RESOURCE_FALLBACK_NAME,
            serverId: PROJECT_DOCS_SERVER_ID,
            sizeBytes: toNumberMetaValue(metadata.sizeBytes),
            status: 'completed',
            truncated: toBooleanMetaValue(metadata.truncated),
            uri,
        }
    },
}
