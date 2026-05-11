import path from 'node:path'

export const PROJECT_DOCS_SERVER_ID = 'project-docs-server'
export const MAX_PROJECT_DOCS_RESOURCE_BYTES = 128 * 1024
export const MAX_PROJECT_DOCS_RESOURCE_CONTENT_CHARS = 12000
export const MAX_PROJECT_DOCS_RESOURCE_PREVIEW_CHARS = 3000

const DOCS_RESOURCE_URI_PREFIX = 'docs://'

export function createDocsResourcePreview(content: string) {
    return content.slice(0, MAX_PROJECT_DOCS_RESOURCE_PREVIEW_CHARS)
}

export function createDocsResourceUri(resourcePath: string) {
    return `${DOCS_RESOURCE_URI_PREFIX}${assertSafeDocsResourcePath(resourcePath)}`
}

export function assertSafeDocsResourcePath(input: string) {
    const rawValue = input.trim()
    const value = rawValue.startsWith(DOCS_RESOURCE_URI_PREFIX) ? rawValue.slice(DOCS_RESOURCE_URI_PREFIX.length) : rawValue

    if (!value) {
        throw new Error('docs resource 路径不能为空。')
    }

    if (path.isAbsolute(value) || value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
        throw new Error('docs resource 只允许使用相对 docs/ 的安全路径。')
    }

    if (value.split('/').some(segment => segment === '..')) {
        throw new Error('docs resource 不允许使用 ../。')
    }

    const normalizedPath = path.posix.normalize(value)
    const [topLevelSegment] = normalizedPath.split('/')

    if (
        normalizedPath === '.' ||
        normalizedPath === '..' ||
        normalizedPath.startsWith('../') ||
        normalizedPath.includes('/../') ||
        normalizedPath.startsWith('docs/') ||
        topLevelSegment === 'apps' ||
        topLevelSegment === 'packages'
    ) {
        throw new Error('docs resource 不允许越界路径、docs/ 前缀、源码目录或 ../。')
    }

    if (path.posix.extname(normalizedPath).toLowerCase() !== '.md') {
        throw new Error('docs resource 当前只允许读取 Markdown 文档。')
    }

    return normalizedPath
}
