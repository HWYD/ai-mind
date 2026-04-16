import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import { projectFileResourceAdapter } from '@/lib/ai/mcp/adapters'

import {
    assertSafeRootFilename,
    createProjectResourcePreview,
    createProjectResourceUri,
    formatLocalTextReadOutput,
    MAX_PROJECT_RESOURCE_PREVIEW_CHARS,
    normalizeRootFilename,
} from './local-text-read-shared'
import type { ChatToolDefinition, ResourceDisplayConfig, ResourceResultDisplay } from './registry'

const localTextReadToolSchema = z.object({
    filename: z.string().trim().min(1).max(200).describe('需要读取的根目录文件名，例如 README.md 或 package.json。'),
})

interface LocalTextReadToolResult {
    content: string
    contentPreview: string
    filename: string
    sizeBytes: number
    truncated: boolean
    uri: string
}

function isLocalTextReadToolResult(value: unknown): value is LocalTextReadToolResult {
    if (!value || typeof value !== 'object') {
        return false
    }

    const candidate = value as Partial<LocalTextReadToolResult>

    return (
        typeof candidate.content === 'string' &&
        typeof candidate.contentPreview === 'string' &&
        typeof candidate.filename === 'string' &&
        typeof candidate.sizeBytes === 'number' &&
        typeof candidate.truncated === 'boolean' &&
        typeof candidate.uri === 'string'
    )
}

function tryParseLocalTextReadToolResult(value: string) {
    try {
        const parsed = JSON.parse(value)
        return isLocalTextReadToolResult(parsed) ? parsed : null
    } catch {
        return null
    }
}

function extractSerializedToolContent(value: unknown) {
    if (!value || typeof value !== 'object') {
        return null
    }

    const candidate = value as Record<string, unknown>

    if (typeof candidate.content === 'string') {
        return candidate.content
    }

    const kwargs = candidate.kwargs

    if (kwargs && typeof kwargs === 'object' && typeof (kwargs as Record<string, unknown>).content === 'string') {
        return (kwargs as Record<string, unknown>).content as string
    }

    return null
}

function toLocalTextReadToolResult(value: unknown): LocalTextReadToolResult | null {
    if (isLocalTextReadToolResult(value)) {
        return value
    }

    const serializedContent = extractSerializedToolContent(value)

    if (!serializedContent) {
        return null
    }

    return tryParseLocalTextReadToolResult(serializedContent)
}

function createLocalTextReadResourceDisplayConfig(args: unknown): ResourceDisplayConfig {
    const rawFilename = args && typeof args === 'object' && 'filename' in args ? (args as Record<string, unknown>).filename : undefined
    const normalizedFilename = typeof rawFilename === 'string' ? normalizeRootFilename(rawFilename) : ''

    return {
        resourceName: normalizedFilename || '未命名文件',
        uri: normalizedFilename ? createProjectResourceUri(normalizedFilename) : 'project://unknown',
    }
}

function toLocalTextReadResourceResult(result: unknown): ResourceResultDisplay | null {
    const normalizedResult = toLocalTextReadToolResult(result)

    if (!normalizedResult) {
        return null
    }

    return {
        resourceName: normalizedResult.filename,
        uri: normalizedResult.uri,
        contentPreview: createProjectResourcePreview(normalizedResult.content),
        isTruncated: normalizedResult.content.length > MAX_PROJECT_RESOURCE_PREVIEW_CHARS,
        previewChars: MAX_PROJECT_RESOURCE_PREVIEW_CHARS,
    }
}

export function normalizeLocalTextReadToolArgs(args: unknown): unknown {
    if (!args || typeof args !== 'object' || !('filename' in args)) {
        return args
    }

    const normalizedArgs = { ...args } as Record<string, unknown>

    if (typeof normalizedArgs.filename === 'string') {
        normalizedArgs.filename = normalizeRootFilename(normalizedArgs.filename)
    }

    return normalizedArgs
}

export function formatLocalTextReadToolInput(args: unknown): string {
    if (!args || typeof args !== 'object' || !('filename' in args)) {
        return JSON.stringify(args ?? {}, null, 2)
    }

    return `filename=${String((args as Record<string, unknown>).filename ?? '')}`
}

export const localTextReadTool = tool(
    async ({ filename }) => {
        const safeFilename = assertSafeRootFilename(filename)
        const result = await projectFileResourceAdapter.read({
            filename: safeFilename,
        })

        return {
            content: result.content,
            contentPreview: result.contentPreview,
            filename: result.resourceName,
            sizeBytes: result.sizeBytes ?? result.content.length,
            truncated: result.truncated ?? false,
            uri: result.uri,
        } satisfies LocalTextReadToolResult
    },
    {
        description: '读取项目根目录下的文本文件内容，适用于“读取 README.md”“看一下 package.json”这类明确文件名的请求。',
        name: 'local-text-read',
        schema: localTextReadToolSchema,
    }
)

export const localTextReadToolDefinition: ChatToolDefinition<z.infer<typeof localTextReadToolSchema>> = {
    name: 'local-text-read',
    tool: localTextReadTool,
    schema: localTextReadToolSchema,
    normalizeArgs: normalizeLocalTextReadToolArgs,
    formatInput: formatLocalTextReadToolInput,
    formatOutput: result => {
        const normalizedResult = toLocalTextReadToolResult(result)

        if (!normalizedResult) {
            return JSON.stringify(result ?? {}, null, 2)
        }

        return formatLocalTextReadOutput({
            content: normalizedResult.content,
            filename: normalizedResult.filename,
            sizeBytes: normalizedResult.sizeBytes,
            truncated: normalizedResult.truncated,
        })
    },
    getDisplayConfig: args => ({
        title: 'local-text-read',
        action: 'read',
        inputPreview: formatLocalTextReadToolInput(args),
    }),
    getResourceDisplayConfig: args => createLocalTextReadResourceDisplayConfig(args),
    getResourceResult: (_args, result) => toLocalTextReadResourceResult(result),
    resourcePreviewChars: MAX_PROJECT_RESOURCE_PREVIEW_CHARS,
    outputPartType: 'resource',
    source: 'mcp',
    serverId: 'project-files-server',
}
