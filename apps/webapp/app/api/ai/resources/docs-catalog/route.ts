import { existsSync } from 'node:fs'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { createDocsResourceUri, MAX_PROJECT_DOCS_RESOURCE_BYTES } from '@/lib/ai/mcp/adapters/docs-resource-shared'

export const runtime = 'nodejs'

type DocsResourceGroup = 'scenario' | 'version-plan'

interface DocsResourceCatalogItem {
    badgeLabel: '示例' | '测试'
    description: string
    fileName: string
    group: DocsResourceGroup
    label: string
    uri: string
}

interface DemoManifest {
    resourceRoot?: string
    scenarios?: Array<{
        entry?: string
        id?: string
    }>
    versionPlans?: string[]
}

const DOCS_RESOURCE_CATALOG_ERROR_CODE = 500100
const DOCS_RESOURCE_CATALOG_SUCCESS_CODE = 0
const DEMO_VERSION_PRESENTATION: Record<string, { badgeLabel: '示例' | '测试'; description: string }> = {
    'v034-langsmith-observability.md': {
        badgeLabel: '示例',
        description: '生成 v0.3.4 可观测性版本任务清单',
    },
    'v030-hitl-checkpoint-resume.md': {
        badgeLabel: '示例',
        description: '体验 HITL 暂停与恢复流程',
    },
    'v020-controlled-agent-graph.md': {
        badgeLabel: '示例',
        description: '体验 Graph Agent 执行链路',
    },
    'test-over-scoped-runtime-change.md': {
        badgeLabel: '测试',
        description: '用于测试范围过大时的边界提示',
    },
    'test-missing-non-goals.md': {
        badgeLabel: '测试',
        description: '用于测试版本方案信息缺失',
    },
}
const DEMO_SCENARIO_PRESENTATION: Record<string, { description: string; label: string }> = {
    'register-login': {
        label: '注册登录系统',
        description: '为注册登录系统生成方案、任务拆解和评审报告',
    },
    'guangzhou-3-day-trip': {
        label: '广州三天旅行计划',
        description: '为广州三天旅行生成行程方案、任务清单和评审报告',
    },
    'frontend-learning-plan': {
        label: '前端学习计划',
        description: '为前端学习路线生成阶段方案、任务拆解和评审报告',
    },
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

function toManifest(value: unknown): DemoManifest {
    if (!value || typeof value !== 'object') {
        return {}
    }

    return value as DemoManifest
}

function isVersionPlanEntry(value: string) {
    return /^version-plans\/[^/]+\.md$/i.test(value)
}

function isScenarioEntry(value: string) {
    return /^scenarios\/[^/]+\/requirement\.md$/i.test(value)
}

function getDemoVersionPresentation(fileName: string) {
    const explicitPresentation = DEMO_VERSION_PRESENTATION[fileName]

    if (explicitPresentation) {
        return explicitPresentation
    }

    if (fileName.startsWith('test-')) {
        return {
            badgeLabel: '测试' as const,
            description: '用于测试 demo 版本输入边界',
        }
    }

    return {
        badgeLabel: '示例' as const,
        description: '公开 demo 示例版本输入',
    }
}

async function readManifest(manifestPath: string) {
    const rawManifest = await readFile(manifestPath, 'utf8')
    const manifest = toManifest(JSON.parse(rawManifest))
    const versionPlans = Array.isArray(manifest.versionPlans) ? manifest.versionPlans.filter(value => typeof value === 'string') : []
    const scenarios = Array.isArray(manifest.scenarios)
        ? manifest.scenarios
              .map(entry => ({
                  entry: typeof entry?.entry === 'string' ? entry.entry : '',
                  id: typeof entry?.id === 'string' ? entry.id : '',
              }))
              .filter(entry => entry.id && isScenarioEntry(entry.entry))
        : []

    return {
        resourceRoot: typeof manifest.resourceRoot === 'string' ? manifest.resourceRoot : 'examples/agent-demo',
        scenarios,
        versionPlans: versionPlans.filter(isVersionPlanEntry),
    }
}

async function toCatalogItems(projectRoot: string, resourceRoot: string, versionPlans: string[]) {
    const demoRoot = path.join(projectRoot, resourceRoot)
    const realDemoRoot = await realpath(demoRoot)
    const collator = new Intl.Collator('zh-CN', {
        numeric: true,
        sensitivity: 'base',
    })
    const resources: DocsResourceCatalogItem[] = []

    for (const relativePath of [...versionPlans].sort((left, right) => collator.compare(right, left))) {
        const absolutePath = path.join(demoRoot, relativePath)
        const fileStat = await lstat(absolutePath).catch(() => null)

        if (!fileStat?.isFile() || fileStat.isSymbolicLink() || fileStat.size > MAX_PROJECT_DOCS_RESOURCE_BYTES) {
            continue
        }

        const realFilePath = await realpath(absolutePath)

        if (!isInsideDirectory(realDemoRoot, realFilePath)) {
            continue
        }

        const fileName = path.basename(relativePath)
        const versionResourcePath = relativePath.split(path.sep).join('/')
        const presentation = getDemoVersionPresentation(fileName)

        resources.push({
            badgeLabel: presentation.badgeLabel,
            description: presentation.description,
            fileName,
            group: 'version-plan',
            label: fileName,
            uri: createDocsResourceUri(versionResourcePath),
        })
    }

    return resources
}

function getDemoScenarioPresentation(scenarioId: string) {
    return (
        DEMO_SCENARIO_PRESENTATION[scenarioId] ?? {
            label: scenarioId,
            description: '体验公开 demo scenario 的受控交付链路',
        }
    )
}

async function toScenarioCatalogItems(
    projectRoot: string,
    resourceRoot: string,
    scenarios: Array<{
        entry: string
        id: string
    }>
) {
    const demoRoot = path.join(projectRoot, resourceRoot)
    const realDemoRoot = await realpath(demoRoot)
    const resources: DocsResourceCatalogItem[] = []

    for (const scenario of scenarios) {
        const absolutePath = path.join(demoRoot, scenario.entry)
        const fileStat = await lstat(absolutePath).catch(() => null)

        if (!fileStat?.isFile() || fileStat.isSymbolicLink() || fileStat.size > MAX_PROJECT_DOCS_RESOURCE_BYTES) {
            continue
        }

        const realFilePath = await realpath(absolutePath)

        if (!isInsideDirectory(realDemoRoot, realFilePath)) {
            continue
        }

        const presentation = getDemoScenarioPresentation(scenario.id)

        resources.push({
            badgeLabel: '示例',
            description: presentation.description,
            fileName: `${scenario.id}/requirement.md`,
            group: 'scenario',
            label: presentation.label,
            uri: createDocsResourceUri(scenario.entry),
        })
    }

    return resources
}

export async function GET() {
    const projectRoot = resolveProjectRoot()
    const manifestPath = path.join(projectRoot, 'examples', 'agent-demo', 'demo-manifest.json')

    try {
        const { resourceRoot, scenarios, versionPlans } = await readManifest(manifestPath)
        const [versionPlanResources, scenarioResources] = await Promise.all([
            toCatalogItems(projectRoot, resourceRoot, versionPlans),
            toScenarioCatalogItems(projectRoot, resourceRoot, scenarios),
        ])

        return createSuccessResponse([...versionPlanResources, ...scenarioResources])
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Demo resource catalog failed:', error)

        return createErrorResponse('Demo resource catalog failed.')
    }
}
