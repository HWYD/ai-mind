import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const MAX_FILE_BYTES = 128 * 1024
const MAX_RESOURCE_CONTENT_CHARS = 12000
const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.js', '.ts', '.tsx'])
const LOCAL_FILE_SUMMARY_TEMPLATE_RELATIVE_PATH = path.join('assets', 'local-prompt', 'local-file-summary.md')
const LOCAL_FILE_SUMMARY_PROMPT_NAME = 'local-file-summary'

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

function normalizeFilename(filename) {
    return String(filename ?? '').trim()
}

function assertSafeRootFilename(filename) {
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

function createProjectResourceUri(filename) {
    return `project://${filename}`
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

function toMimeType(filename) {
    const extension = path.extname(filename).toLowerCase()

    switch (extension) {
        case '.json':
            return 'application/json'
        case '.md':
            return 'text/markdown'
        case '.yaml':
        case '.yml':
            return 'application/yaml'
        default:
            return 'text/plain'
    }
}

async function listReadableProjectFiles(projectRoot) {
    const entries = await readdir(projectRoot, {
        withFileTypes: true,
    })
    const resources = []

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue
        }

        try {
            const filename = assertSafeRootFilename(entry.name)
            const absolutePath = path.join(projectRoot, filename)
            const fileStat = await stat(absolutePath)

            if (!fileStat.isFile() || fileStat.size > MAX_FILE_BYTES) {
                continue
            }

            resources.push({
                description: `项目根目录文件 ${filename}`,
                mimeType: toMimeType(filename),
                name: filename,
                size: fileStat.size,
                uri: createProjectResourceUri(filename),
            })
        } catch {
            continue
        }
    }

    return resources.sort((left, right) => left.name.localeCompare(right.name))
}

async function readProjectTextFile(projectRoot, filename) {
    const safeFilename = assertSafeRootFilename(filename)
    const absolutePath = path.join(projectRoot, safeFilename)
    const fileStat = await stat(absolutePath).catch(() => null)

    if (!fileStat || !fileStat.isFile()) {
        throw new Error(`根目录下未找到文件：${safeFilename}`)
    }

    if (fileStat.size > MAX_FILE_BYTES) {
        throw new Error(`文件过大，当前最多支持读取 ${MAX_FILE_BYTES} 字节以内的文本文件。`)
    }

    const rawContent = await readFile(absolutePath, 'utf8')
    const truncated = rawContent.length > MAX_RESOURCE_CONTENT_CHARS

    return {
        filename: safeFilename,
        mimeType: toMimeType(safeFilename),
        sizeBytes: fileStat.size,
        text: rawContent.slice(0, MAX_RESOURCE_CONTENT_CHARS),
        truncated,
        uri: createProjectResourceUri(safeFilename),
    }
}

const projectRoot = resolveProjectRoot()
const server = new McpServer({
    name: 'project-files-server',
    version: '0.0.11',
})
const projectFileTemplate = new ResourceTemplate('project://{filename}', {
    list: async () => ({
        resources: await listReadableProjectFiles(projectRoot),
    }),
})

server.registerResource(
    'project-file',
    projectFileTemplate,
    {
        description: '读取项目根目录的直接文本文件内容。',
        mimeType: 'text/plain',
    },
    async (uri, variables) => {
        const filename = Array.isArray(variables.filename) ? variables.filename[0] : variables.filename
        const result = await readProjectTextFile(projectRoot, filename)

        return {
            contents: [
                {
                    _meta: {
                        filename: result.filename,
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
        description: '对单个本地文件生成结构化摘要提示词。',
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
            description: '基于单个本地文件生成结构化摘要的 Prompt。',
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
    console.error('project-files-server 启动失败:', error)
    process.exit(1)
})
