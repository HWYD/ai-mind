import { existsSync } from 'node:fs'
import path from 'node:path'

export const MAX_LOCAL_TEXT_READ_CHARS = 12000
export const MAX_PROJECT_RESOURCE_BYTES = 128 * 1024
export const MAX_PROJECT_RESOURCE_PREVIEW_CHARS = 3000

export const LOCAL_TEXT_READ_ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.js', '.ts', '.tsx'])

export interface LocalTextReadOutputOptions {
    content: string
    filename: string
    sizeBytes: number
    truncated: boolean
}

export function resolveProjectRoot(startDir = process.cwd()) {
    let currentDir = startDir

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

    return startDir
}

export function normalizeRootFilename(filename: string) {
    return filename.trim()
}

export function assertSafeRootFilename(filename: string) {
    const normalizedFilename = normalizeRootFilename(filename)

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

    if (!LOCAL_TEXT_READ_ALLOWED_EXTENSIONS.has(extension)) {
        throw new Error('当前只允许读取常见文本文件，例如 md、txt、json、yaml、js、ts、tsx。')
    }

    return normalizedFilename
}

export function createProjectResourceUri(filename: string) {
    return `project://${filename}`
}

export function createProjectResourcePreview(content: string) {
    return content.slice(0, MAX_PROJECT_RESOURCE_PREVIEW_CHARS)
}

export function formatLocalTextReadOutput(options: LocalTextReadOutputOptions) {
    const { content, filename, sizeBytes, truncated } = options

    return [`文件：${filename}`, `大小：${sizeBytes} 字节`, `是否截断：${truncated ? '是' : '否'}`, '内容：', content].join('\n')
}
