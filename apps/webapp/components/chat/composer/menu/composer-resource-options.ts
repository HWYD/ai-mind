import type { ComposerResourceOption, DocsResourceCatalogItem, DocsResourceCatalogResponse } from '../composer-types'

const remoteResourceOptions: ComposerResourceOption[] = [
    {
        id: 'remote:project-assistant-service:latest-context',
        type: 'resource',
        label: 'latest-context',
        uri: 'project://latest-context',
        source: 'remote',
        serverId: 'project-assistant-service',
        description: 'Project Assistant Service 提供的项目聚合上下文',
    },
]

const API_SUCCESS_CODE = 0

let cachedDocsResourceOptions: ComposerResourceOption[] | null = null
let docsResourceOptionsRequest: Promise<ComposerResourceOption[]> | null = null

function isDocsResourceCatalogItem(value: unknown): value is DocsResourceCatalogItem {
    if (!value || typeof value !== 'object') {
        return false
    }

    const record = value as Record<string, unknown>

    return (
        typeof record.description === 'string' &&
        typeof record.fileName === 'string' &&
        (record.group === 'architecture' || record.group === 'readme' || record.group === 'version-plan') &&
        typeof record.label === 'string' &&
        typeof record.uri === 'string'
    )
}

async function getDocsResourceOptions() {
    if (cachedDocsResourceOptions) {
        return cachedDocsResourceOptions
    }

    docsResourceOptionsRequest ??= fetch('/api/ai/resources/docs-catalog')
        .then(async response => {
            if (!response.ok) {
                throw new Error('Docs resource catalog request failed.')
            }

            const payload = (await response.json()) as DocsResourceCatalogResponse
            if (payload.code !== API_SUCCESS_CODE) {
                throw new Error(payload.message || 'Docs resource catalog request failed.')
            }

            const options = payload.data.resources.filter(isDocsResourceCatalogItem).map<ComposerResourceOption>(resource => ({
                id: `docs:${resource.group}:${resource.fileName}`,
                type: 'resource',
                label: resource.label,
                uri: resource.uri,
                source: 'local',
                description: resource.description,
            }))

            cachedDocsResourceOptions = options

            return options
        })
        .catch(() => {
            return []
        })
        .finally(() => {
            docsResourceOptionsRequest = null
        })

    return docsResourceOptionsRequest
}

export async function getFilteredComposerResources(query: string) {
    const docsResourceOptions = await getDocsResourceOptions()
    const composerResourceOptions = [...docsResourceOptions, ...remoteResourceOptions]
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
        return composerResourceOptions
    }

    return composerResourceOptions.filter(resource => {
        const searchableText =
            `${resource.label} ${resource.uri} ${resource.source} ${resource.serverId ?? ''} ${resource.description}`.toLowerCase()

        return searchableText.includes(normalizedQuery)
    })
}
