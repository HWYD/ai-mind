import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import type { ChatToolDefinition } from './registry'

const MAX_CHARS = 12000
const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.js', '.ts', '.tsx'])

const localTextReadToolSchema = z.object({
    filename: z.string().trim().min(1).max(200).describe('需要读取的根目录文件名，例如 README.md 或 package.json。'),
})

function resolveProjectRoot() {
    let currentDir = process.cwd()

    for (let depth = 0; depth < 6; depth += 1) {
        if (existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
            return currentDir
        }

        const parentDir = path.dirname(currentDir)

        if (parentDir === currentDir) {
            break
        }

        currentDir = parentDir
    }

    return process.cwd()
}

function normalizeFilename(filename: string) {
    return filename.trim()
}

function assertSafeRootFilename(filename: string) {
    const normalizedFilename = normalizeFilename(filename)

    if (!normalizedFilename) {
        throw new Error('文件名不能为空。')
    }

    if (
        path.isAbsolute(normalizedFilename) ||
        normalizedFilename.includes('/') ||
        normalizedFilename.includes('\\') ||
        normalizedFilename.includes('..')
    ) {
        throw new Error('只允许读取项目根目录的直接文件，不支持路径、子目录或 ../。')
    }

    if (path.basename(normalizedFilename) !== normalizedFilename) {
        throw new Error('只允许读取项目根目录的直接文件。')
    }

    const extension = path.extname(normalizedFilename).toLowerCase()

    if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw new Error('当前只允许读取常见文本文件，例如 md、txt、json、yaml、js、ts、tsx。')
    }

    return normalizedFilename
}

function formatLocalTextReadOutput(filename: string, content: string, size: number, truncated: boolean) {
    return [`文件：${filename}`, `大小：${size} 字节`, `是否截断：${truncated ? '是' : '否'}`, '内容：', content].join('\n')
}

export function normalizeLocalTextReadToolArgs(args: unknown): unknown {
    if (!args || typeof args !== 'object' || !('filename' in args)) {
        return args
    }

    const normalizedArgs = { ...args } as Record<string, unknown>

    if (typeof normalizedArgs.filename === 'string') {
        normalizedArgs.filename = normalizeFilename(normalizedArgs.filename)
    }

    return normalizedArgs
}

export function formatLocalTextReadToolInput(args: unknown): string {
    if (!args || typeof args !== 'object' || !('filename' in args)) {
        return JSON.stringify(args ?? {}, null, 2)
    }

    return `filename=${String((args as Record<string, unknown>).filename ?? '')}`
}

// local-text-read 只负责读取项目根目录的直接文本文件，不开放路径访问或目录浏览。
export const localTextReadTool = tool(
    async ({ filename }) => {
        const safeFilename = assertSafeRootFilename(filename)
        const projectRoot = resolveProjectRoot()
        const absolutePath = path.join(projectRoot, safeFilename)
        const fileStat = await stat(absolutePath).catch(() => null)

        if (!fileStat || !fileStat.isFile()) {
            throw new Error(`根目录下未找到文件：${safeFilename}`)
        }

        const rawContent = await readFile(absolutePath, 'utf8')
        const content = rawContent.slice(0, MAX_CHARS)
        const truncated = rawContent.length > MAX_CHARS

        return formatLocalTextReadOutput(safeFilename, content, fileStat.size, truncated)
    },
    {
        name: 'local-text-read',
        description: '读取项目根目录下的文本文件内容，适用于读取 README.md、package.json、notes.txt 这类明确文件名的请求。',
        schema: localTextReadToolSchema,
    }
)

export const localTextReadToolDefinition: ChatToolDefinition<z.infer<typeof localTextReadToolSchema>> = {
    name: 'local-text-read',
    tool: localTextReadTool,
    schema: localTextReadToolSchema,
    normalizeArgs: normalizeLocalTextReadToolArgs,
    formatInput: formatLocalTextReadToolInput,
    getDisplayConfig: args => ({
        title: 'local-text-read',
        action: 'read',
        inputPreview: formatLocalTextReadToolInput(args),
    }),
}
