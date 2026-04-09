import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'
import { MCPHostError } from '@/lib/ai/mcp/protocol/errors'
import type { MCPResourceAdapterResult } from '@/lib/ai/mcp/protocol/types'
import {
    assertSafeRootFilename,
    createProjectResourcePreview,
    createProjectResourceUri,
    MAX_PROJECT_RESOURCE_PREVIEW_CHARS,
} from '@/lib/ai/tools/local-text-read-shared'

import type { MCPResourceAdapter } from './types'

export interface ProjectFileResourceAdapterInput {
    filename: string
}

const PROJECT_FILES_SERVER_ID = 'project-files-server'
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

export const projectFileResourceAdapter: MCPResourceAdapter<ProjectFileResourceAdapterInput> = {
    async read(input): Promise<MCPResourceAdapterResult> {
        const safeFilename = assertSafeRootFilename(input.filename)
        const uri = createProjectResourceUri(safeFilename)
        const response = await mcpClientManager.readResource(PROJECT_FILES_SERVER_ID, {
            uri,
        })
        const textContent = extractTextContent(response.result)

        if (!textContent) {
            throw new MCPHostError('REQUEST_FAILED', '项目文件 MCP Resource 没有返回可用文本内容。')
        }

        const metadata = toMetadataRecord(textContent._meta)

        return {
            content: textContent.text,
            contentPreview: createProjectResourcePreview(textContent.text),
            previewChars: MAX_PROJECT_RESOURCE_PREVIEW_CHARS,
            mimeType: textContent.mimeType,
            resourceName: typeof metadata.filename === 'string' ? metadata.filename : safeFilename,
            serverId: PROJECT_FILES_SERVER_ID,
            sizeBytes: toNumberMetaValue(metadata.sizeBytes),
            status: 'completed',
            truncated: toBooleanMetaValue(metadata.truncated),
            uri,
        }
    },
}
