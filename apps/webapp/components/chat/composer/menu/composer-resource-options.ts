import type { ComposerCommandName, ComposerResourceOption, DocsResourceCatalogItem, DocsResourceCatalogResponse } from '../composer-types'

const API_SUCCESS_CODE = 0
type PublicDemoCatalogItem = DocsResourceCatalogItem & {
    group: 'scenario' | 'version-plan'
}

let cachedDocsResourceOptions: ComposerResourceOption[] | null = null
let docsResourceOptionsRequest: Promise<ComposerResourceOption[]> | null = null

function isDocsResourceCatalogItem(value: unknown): value is PublicDemoCatalogItem {
    if (!value || typeof value !== 'object') {
        return false
    }

    const record = value as Record<string, unknown>

    return (
        (record.badgeLabel === undefined || record.badgeLabel === '示例' || record.badgeLabel === '测试') &&
        typeof record.description === 'string' &&
        typeof record.fileName === 'string' &&
        (record.group === 'scenario' || record.group === 'version-plan') &&
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
                description: resource.description,
                fileName: resource.fileName,
                group: resource.group,
                id: `demo:${resource.group}:${resource.fileName}`,
                type: 'resource',
                label: resource.label,
                uri: resource.uri,
                source: 'local',
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

export async function getFilteredComposerResources(query: string, commandName?: ComposerCommandName) {
    const docsResourceOptions = await getDocsResourceOptions()
    const visibleResources =
        commandName === 'delivery-chain'
            ? docsResourceOptions.filter(resource => resource.group === 'scenario')
            : docsResourceOptions.filter(resource => resource.group === 'version-plan')
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
        return visibleResources
    }

    return visibleResources.filter(resource => {
        const searchableText =
            `${resource.label} ${resource.uri} ${resource.group} ${resource.source} ${resource.serverId ?? ''} ${resource.description} ${resource.badgeLabel ?? ''}`.toLowerCase()

        return searchableText.includes(normalizedQuery)
    })
}
