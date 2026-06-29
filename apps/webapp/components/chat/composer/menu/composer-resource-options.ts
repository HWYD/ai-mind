import type { ComposerResourceOption, DocsResourceCatalogItem, DocsResourceCatalogResponse } from '../composer-types'

const API_SUCCESS_CODE = 0

let cachedDocsResourceOptions: ComposerResourceOption[] | null = null
let docsResourceOptionsRequest: Promise<ComposerResourceOption[]> | null = null

function isDocsResourceCatalogItem(value: unknown): value is DocsResourceCatalogItem {
    if (!value || typeof value !== 'object') {
        return false
    }

    const record = value as Record<string, unknown>

    return (
        (record.badgeLabel === undefined || record.badgeLabel === '示例' || record.badgeLabel === '测试') &&
        typeof record.description === 'string' &&
        typeof record.fileName === 'string' &&
        record.group === 'version-plan' &&
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
                throw new Error('Demo resource catalog request failed.')
            }

            const payload = (await response.json()) as DocsResourceCatalogResponse

            if (payload.code !== API_SUCCESS_CODE) {
                throw new Error(payload.message || 'Demo resource catalog request failed.')
            }

            const options = payload.data.resources.filter(isDocsResourceCatalogItem).map<ComposerResourceOption>(resource => ({
                badgeLabel: resource.badgeLabel,
                id: `demo:version-plan:${resource.fileName}`,
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
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
        return docsResourceOptions
    }

    return docsResourceOptions.filter(resource => {
        const searchableText =
            `${resource.label} ${resource.uri} ${resource.source} ${resource.serverId ?? ''} ${resource.description} ${resource.badgeLabel ?? ''}`.toLowerCase()

        return searchableText.includes(normalizedQuery)
    })
}
