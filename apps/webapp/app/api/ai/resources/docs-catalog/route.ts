import { existsSync } from 'node:fs'
import { lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type DocsResourceGroup = 'architecture' | 'readme' | 'version-plan'

interface DocsResourceCatalogItem {
    description: string
    fileName: string
    group: DocsResourceGroup
    label: string
    uri: string
    version?: string
}

const DOCS_RESOURCE_CATALOG_ERROR_CODE = 500100
const DOCS_RESOURCE_CATALOG_SUCCESS_CODE = 0
const VERSION_PATTERN = /(v\d+\.\d+\.\d+)/i

const architectureDescriptions: Record<string, string> = {
    'capability-skill-surface.md': 'Capability、Skill 与 Composer 表面的关系',
    'runtime-boundary.md': 'Runtime 主链路与分层边界说明',
    'stream-core.md': '结构化流式协议与 typed parts 说明',
}

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

function isInsideDirectory(parentDir: string, childPath: string) {
    const relativePath = path.relative(parentDir, childPath)

    return relativePath === '' || (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function isSafeMarkdownFileName(fileName: string) {
    return (
        !!fileName &&
        !fileName.startsWith('.') &&
        !fileName.includes('/') &&
        !fileName.includes('\\') &&
        !path.isAbsolute(fileName) &&
        path.extname(fileName).toLowerCase() === '.md'
    )
}

async function collectMarkdownFiles(rootDir: string) {
    const entries = await readdir(rootDir, {
        withFileTypes: true,
    })
    const fileNames: string[] = []

    for (const entry of entries) {
        if (!entry.isFile() || !isSafeMarkdownFileName(entry.name)) {
            continue
        }

        const absolutePath = path.join(rootDir, entry.name)
        const fileStat = await lstat(absolutePath).catch(() => null)

        if (!fileStat?.isFile() || fileStat.isSymbolicLink()) {
            continue
        }

        fileNames.push(entry.name)
    }

    return fileNames
}

function createErrorResponse(message: string) {
    return NextResponse.json(
        {
            code: DOCS_RESOURCE_CATALOG_ERROR_CODE,
            data: {
                resources: [],
            },
            message,
        },
        {
            status: 500,
        }
    )
}

function createSuccessResponse(resources: DocsResourceCatalogItem[]) {
    return NextResponse.json({
        code: DOCS_RESOURCE_CATALOG_SUCCESS_CODE,
        data: {
            resources,
        },
        message: 'ok',
    })
}

export async function GET() {
    const projectRoot = resolveProjectRoot()
    const docsRoot = path.join(projectRoot, 'docs')
    const readmePath = path.join(docsRoot, 'README.md')
    const architectureRoot = path.join(docsRoot, 'architecture')
    const versionsRoot = path.join(docsRoot, 'versions')

    try {
        const realProjectRoot = await realpath(projectRoot)
        const [realDocsRoot, realArchitectureRoot, realVersionsRoot] = await Promise.all([
            realpath(docsRoot),
            realpath(architectureRoot),
            realpath(versionsRoot),
        ])

        if (
            !isInsideDirectory(realProjectRoot, realDocsRoot) ||
            !isInsideDirectory(realDocsRoot, realArchitectureRoot) ||
            !isInsideDirectory(realDocsRoot, realVersionsRoot)
        ) {
            return createErrorResponse('Docs resource catalog boundary check failed.')
        }

        const collator = new Intl.Collator('zh-CN', {
            numeric: true,
            sensitivity: 'base',
        })
        const versionFileNames = (await collectMarkdownFiles(versionsRoot)).sort((left, right) => collator.compare(right, left))
        const architectureFileNames = (await collectMarkdownFiles(architectureRoot)).sort((left, right) => collator.compare(left, right))
        const resources: DocsResourceCatalogItem[] = []
        const readmeStat = await lstat(readmePath).catch(() => null)

        for (const fileName of versionFileNames) {
            const version = VERSION_PATTERN.exec(fileName)?.[1]

            resources.push({
                description: version ? `${version} 版本方案` : '版本方案',
                fileName,
                group: 'version-plan',
                label: fileName,
                uri: `docs://versions/${fileName}`,
                ...(version ? { version } : {}),
            })
        }

        if (readmeStat?.isFile() && !readmeStat.isSymbolicLink()) {
            resources.push({
                description: '项目公开文档入口与能力概览',
                fileName: 'README.md',
                group: 'readme',
                label: 'README.md',
                uri: 'docs://README.md',
            })
        }

        for (const fileName of architectureFileNames) {
            resources.push({
                description: architectureDescriptions[fileName] ?? '架构文档',
                fileName,
                group: 'architecture',
                label: `architecture/${fileName}`,
                uri: `docs://architecture/${fileName}`,
            })
        }

        return createSuccessResponse(resources)
    } catch (error) {
        // 后端返回统一业务错误；前端再降级为空候选，避免把真实故障伪装成“没有资源”。
        // eslint-disable-next-line no-console
        console.error('Docs resource catalog failed:', error)

        return createErrorResponse('Docs resource catalog failed.')
    }
}
