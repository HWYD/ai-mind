import path from 'node:path'

export const PROJECT_DOCS_SERVER_ID = 'project-docs-server'
export const MAX_PROJECT_DOCS_RESOURCE_BYTES = 128 * 1024
export const MAX_PROJECT_DOCS_RESOURCE_CONTENT_CHARS = 12000
export const MAX_PROJECT_DOCS_RESOURCE_PREVIEW_CHARS = 3000

const DEMO_RESOURCE_URI_PREFIX = 'demo://'
const LEGACY_DOCS_RESOURCE_URI_PREFIX = 'docs://'
const ALLOWED_SCENARIO_FILES = new Set(['context.md', 'plan.sample.md', 'requirement.md', 'review.expected.md', 'tasks.sample.md'])

function isAllowedDemoResourcePath(normalizedPath: string) {
    if (normalizedPath === 'README.md' || normalizedPath === 'demo-manifest.json') {
        return true
    }

    if (/^version-plans\/[^/]+\.md$/i.test(normalizedPath)) {
        return true
    }

    if (/^rubrics\/[^/]+\.md$/i.test(normalizedPath)) {
        return true
    }

    if (/^governance\/[^/]+\.md$/i.test(normalizedPath)) {
        return true
    }

    const scenarioMatch = /^scenarios\/([^/]+)\/([^/]+)$/i.exec(normalizedPath)

    if (!scenarioMatch) {
        return false
    }

    return ALLOWED_SCENARIO_FILES.has(scenarioMatch[2] ?? '')
}

export function createDocsResourcePreview(content: string) {
    return content.slice(0, MAX_PROJECT_DOCS_RESOURCE_PREVIEW_CHARS)
}

export function createDocsResourceUri(resourcePath: string) {
    return `${DEMO_RESOURCE_URI_PREFIX}${assertSafeDocsResourcePath(resourcePath)}`
}

export function assertSafeDocsResourcePath(input: string) {
    const rawValue = input.trim()

    if (rawValue.startsWith(LEGACY_DOCS_RESOURCE_URI_PREFIX)) {
        throw new Error('`@docs://` 已下线，请改用 `@demo://` 下的公开 demo 资源。')
    }

    const value = rawValue.startsWith(DEMO_RESOURCE_URI_PREFIX) ? rawValue.slice(DEMO_RESOURCE_URI_PREFIX.length) : rawValue

    if (!value) {
        throw new Error('demo resource 路径不能为空。')
    }

    if (path.isAbsolute(value) || value.startsWith('/') || value.includes(':') || value.includes('\\') || value.includes('\0')) {
        throw new Error('demo resource 只允许使用相对路径。')
    }

    if (value.split('/').some(segment => segment === '..')) {
        throw new Error('demo resource 不允许使用 `../`。')
    }

    const normalizedPath = path.posix.normalize(value)
    const extension = path.posix.extname(normalizedPath).toLowerCase()

    if (normalizedPath === '.' || normalizedPath === '..' || normalizedPath.startsWith('../') || normalizedPath.includes('/../')) {
        throw new Error('demo resource 不允许越界路径。')
    }

    if (normalizedPath.split('/').some(segment => !segment || segment.startsWith('.'))) {
        throw new Error('demo resource 不允许隐藏路径或空路径段。')
    }

    if (extension !== '.md' && extension !== '.json') {
        throw new Error('demo resource 当前只允许读取 `.md` 或 `demo-manifest.json`。')
    }

    if (!isAllowedDemoResourcePath(normalizedPath)) {
        throw new Error('demo resource 不在公开 demo 白名单内。')
    }

    return normalizedPath
}
