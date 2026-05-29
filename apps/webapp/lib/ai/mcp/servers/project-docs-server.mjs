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
const DOCS_RESOURCE_URI_PREFIX = 'docs://'

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

function assertSafeDocsResourcePath(input) {
    const rawValue = String(input ?? '').trim()
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

function createDocsResourceUri(resourcePath) {
    return `${DOCS_RESOURCE_URI_PREFIX}${assertSafeDocsResourcePath(resourcePath)}`
}

function isInsideDirectory(parentDir, childPath) {
    const relativePath = path.relative(parentDir, childPath)

    return relativePath === '' || (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function toMimeType() {
    return 'text/markdown'
}

async function walkDocsMarkdownFiles(dir, baseDir) {
    const entries = await readdir(dir, {
        withFileTypes: true,
    })
    const resources = []

    for (const entry of entries) {
        const absolutePath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
            resources.push(...(await walkDocsMarkdownFiles(absolutePath, baseDir)))
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
                description: `docs 文档：${safeResourcePath}`,
                mimeType: toMimeType(),
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

async function listReadableDocsResources(docsRoot) {
    const resources = await walkDocsMarkdownFiles(docsRoot, docsRoot)

    return resources.sort((left, right) => left.name.localeCompare(right.name))
}

async function readDocsMarkdownFile(docsRoot, resourcePath) {
    const safeResourcePath = assertSafeDocsResourcePath(resourcePath)
    const absolutePath = path.resolve(docsRoot, safeResourcePath)
    const relativePath = path.relative(docsRoot, absolutePath)

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('docs resource 不允许越界读取。')
    }

    const linkStat = await lstat(absolutePath).catch(() => null)

    if (!linkStat) {
        throw new Error(`docs 下未找到文档：${safeResourcePath}`)
    }

    if (linkStat.isSymbolicLink()) {
        throw new Error('docs resource 不允许读取符号链接。')
    }

    const [realDocsRoot, realFilePath] = await Promise.all([realpath(docsRoot), realpath(absolutePath)])

    if (!isInsideDirectory(realDocsRoot, realFilePath)) {
        throw new Error('docs resource 不允许通过符号链接或真实路径越界读取。')
    }

    const fileStat = await stat(absolutePath)

    if (!fileStat.isFile()) {
        throw new Error(`docs 下未找到文档：${safeResourcePath}`)
    }

    if (fileStat.size > MAX_FILE_BYTES) {
        throw new Error(`docs 文档过大，当前最多支持读取 ${MAX_FILE_BYTES} 字节以内的 Markdown 文档。`)
    }

    const rawContent = await readFile(absolutePath, 'utf8')
    const truncated = rawContent.length > MAX_RESOURCE_CONTENT_CHARS

    return {
        mimeType: toMimeType(),
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

    return template
        .replaceAll('{{filename}}', input.filename)
        .replaceAll('{{content}}', input.content)
        .replaceAll('{{userGoal}}', userGoal)
}

const projectRoot = resolveProjectRoot()
const docsRoot = path.join(projectRoot, 'docs')
const server = new McpServer({
    name: SERVER_ID,
    version: '0.1.1',
})
const docsResourceTemplate = new ResourceTemplate('docs://{+resourcePath}', {
    list: async () => ({
        resources: await listReadableDocsResources(docsRoot),
    }),
})

server.registerResource(
    'project-docs',
    docsResourceTemplate,
    {
        description: '读取 docs/ 项目知识区内的 Markdown 文档。',
        mimeType: 'text/markdown',
    },
    async (uri, variables) => {
        const resourcePath = Array.isArray(variables.resourcePath) ? variables.resourcePath[0] : variables.resourcePath
        const result = await readDocsMarkdownFile(docsRoot, resourcePath)

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
        description: '对单个 docs Markdown 文档生成结构化摘要提示词。',
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
            description: '基于单个 docs 文档生成结构化摘要的 Prompt。',
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
