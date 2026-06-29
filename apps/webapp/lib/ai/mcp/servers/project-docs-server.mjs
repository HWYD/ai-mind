import { existsSync } from 'node:fs'
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const SERVER_ID = 'project-docs-server'
const MAX_FILE_BYTES = 128 * 1024
const MAX_RESOURCE_CONTENT_CHARS = 12000
const LOCAL_FILE_SUMMARY_TEMPLATE_RELATIVE_PATH = path.join('assets', 'local-prompt', 'local-file-summary.md')
const LOCAL_FILE_SUMMARY_PROMPT_NAME = 'local-file-summary'
const DEMO_RESOURCE_URI_PREFIX = 'demo://'
const LEGACY_DOCS_RESOURCE_URI_PREFIX = 'docs://'
const ALLOWED_SCENARIO_FILES = new Set(['context.md', 'plan.sample.md', 'requirement.md', 'review.expected.md', 'tasks.sample.md'])

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

function isAllowedDemoResourcePath(normalizedPath) {
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

function assertSafeDocsResourcePath(input) {
    const rawValue = String(input ?? '').trim()

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

function createDocsResourceUri(resourcePath) {
    return `${DEMO_RESOURCE_URI_PREFIX}${assertSafeDocsResourcePath(resourcePath)}`
}

function isInsideDirectory(parentDir, childPath) {
    const relativePath = path.relative(parentDir, childPath)

    return relativePath === '' || (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function toMimeType(resourcePath) {
    return resourcePath.endsWith('.json') ? 'application/json' : 'text/markdown'
}

async function walkDemoReadableFiles(dir, baseDir) {
    const entries = await readdir(dir, {
        withFileTypes: true,
    })
    const resources = []

    for (const entry of entries) {
        const absolutePath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
            resources.push(...(await walkDemoReadableFiles(absolutePath, baseDir)))
            continue
        }

        if (!entry.isFile()) {
            continue
        }

        const resourcePath = path.relative(baseDir, absolutePath).split(path.sep).join('/')

        try {
            const safeResourcePath = assertSafeDocsResourcePath(resourcePath)
            const fileStat = await stat(absolutePath)

            if (!fileStat.isFile() || fileStat.size > MAX_FILE_BYTES) {
                continue
            }

            resources.push({
                description: `demo resource: ${safeResourcePath}`,
                mimeType: toMimeType(safeResourcePath),
                name: safeResourcePath,
                size: fileStat.size,
                uri: createDocsResourceUri(safeResourcePath),
            })
        } catch {
            continue
        }
    }

    return resources
}

async function listReadableDocsResources(demoRoot) {
    const resources = await walkDemoReadableFiles(demoRoot, demoRoot)

    return resources.sort((left, right) => left.name.localeCompare(right.name))
}

async function readDocsFile(demoRoot, resourcePath) {
    const safeResourcePath = assertSafeDocsResourcePath(resourcePath)
    const absolutePath = path.resolve(demoRoot, safeResourcePath)
    const relativePath = path.relative(demoRoot, absolutePath)

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('demo resource 不允许越界读取。')
    }

    const linkStat = await lstat(absolutePath).catch(() => null)

    if (!linkStat) {
        throw new Error(`demo workspace 下未找到资源：${safeResourcePath}`)
    }

    if (linkStat.isSymbolicLink()) {
        throw new Error('demo resource 不允许读取符号链接。')
    }

    const [realDemoRoot, realFilePath] = await Promise.all([realpath(demoRoot), realpath(absolutePath)])

    if (!isInsideDirectory(realDemoRoot, realFilePath)) {
        throw new Error('demo resource 不允许通过真实路径越界读取。')
    }

    const fileStat = await stat(absolutePath)

    if (!fileStat.isFile()) {
        throw new Error(`demo workspace 下未找到资源：${safeResourcePath}`)
    }

    if (fileStat.size > MAX_FILE_BYTES) {
        throw new Error(`demo resource 过大，当前最多支持 ${MAX_FILE_BYTES} 字节。`)
    }

    const rawContent = await readFile(absolutePath, 'utf8')
    const truncated = rawContent.length > MAX_RESOURCE_CONTENT_CHARS

    return {
        mimeType: toMimeType(safeResourcePath),
        resourcePath: safeResourcePath,
        sizeBytes: fileStat.size,
        text: rawContent.slice(0, MAX_RESOURCE_CONTENT_CHARS),
        truncated,
        uri: createDocsResourceUri(safeResourcePath),
    }
}

let localFileSummaryTemplateCache = null

async function loadLocalFileSummaryTemplate(projectRoot) {
    if (localFileSummaryTemplateCache) {
        return localFileSummaryTemplateCache
    }

    const templatePath = path.join(projectRoot, LOCAL_FILE_SUMMARY_TEMPLATE_RELATIVE_PATH)
    const template = await readFile(templatePath, 'utf8')

    if (!template.trim()) {
        throw new Error(`Prompt 模板为空：${templatePath}`)
    }

    localFileSummaryTemplateCache = template

    return localFileSummaryTemplateCache
}

function renderLocalFileSummaryPrompt(template, input) {
    const userGoal = input.userGoal?.trim() || '未提供'

    return template.replaceAll('{{filename}}', input.filename).replaceAll('{{content}}', input.content).replaceAll('{{userGoal}}', userGoal)
}

const projectRoot = resolveProjectRoot()
const demoRoot = path.join(projectRoot, 'examples', 'agent-demo')
const server = new McpServer({
    name: SERVER_ID,
    version: '0.3.5',
})
const docsResourceTemplate = new ResourceTemplate('demo://{+resourcePath}', {
    list: async () => ({
        resources: await listReadableDocsResources(demoRoot),
    }),
})

server.registerResource(
    'project-docs',
    docsResourceTemplate,
    {
        description: '读取 examples/agent-demo/ 下公开 demo corpus 的本地资源。',
        mimeType: 'text/markdown',
    },
    async (uri, variables) => {
        const resourcePath = Array.isArray(variables.resourcePath) ? variables.resourcePath[0] : variables.resourcePath
        const result = await readDocsFile(demoRoot, resourcePath)

        return {
            contents: [
                {
                    _meta: {
                        resourcePath: result.resourcePath,
                        sizeBytes: result.sizeBytes,
                        truncated: result.truncated,
                    },
                    mimeType: result.mimeType,
                    text: result.text,
                    uri: uri.toString(),
                },
            ],
        }
    }
)

server.registerPrompt(
    LOCAL_FILE_SUMMARY_PROMPT_NAME,
    {
        description: '对公开 demo corpus 中已读取的单个文档生成结构化摘要提示词。',
        argsSchema: {
            filename: z.string().trim().min(1),
            content: z.string().trim().min(1),
            userGoal: z.string().trim().optional(),
        },
    },
    async input => {
        const template = await loadLocalFileSummaryTemplate(projectRoot)
        const text = renderLocalFileSummaryPrompt(template, input)

        return {
            description: '基于单个 demo 文档生成结构化摘要的 Prompt。',
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text,
                    },
                },
            ],
        }
    }
)

const transport = new StdioServerTransport()

server.connect(transport).catch(error => {
    console.error(`${SERVER_ID} 启动失败:`, error)
    process.exit(1)
})
