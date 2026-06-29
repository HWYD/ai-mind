import { afterEach, describe, expect, it, vi } from 'vitest'

import { getFilteredComposerResources } from '@/components/chat/composer/menu/composer-resource-options'

const mockCatalogResponse = {
    code: 0,
    data: {
        resources: [
            {
                badgeLabel: '示例',
                fileName: 'v034-langsmith-observability.md',
                group: 'version-plan',
                label: 'v034-langsmith-observability.md',
                uri: 'demo://version-plans/v034-langsmith-observability.md',
                description: '生成 v0.3.4 可观测性版本任务清单',
            },
        ],
    },
}

describe('getFilteredComposerResources', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        vi.resetModules()
    })

    it('returns only demo version resources from the catalog', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockCatalogResponse,
            })
        )

        const resources = await getFilteredComposerResources('')

        expect(resources).toEqual([
            expect.objectContaining({
                badgeLabel: '示例',
                description: '生成 v0.3.4 可观测性版本任务清单',
                label: 'v034-langsmith-observability.md',
                uri: 'demo://version-plans/v034-langsmith-observability.md',
                source: 'local',
            }),
        ])
        expect(resources.some(resource => resource.uri === 'project://latest-context')).toBe(false)
    })
})
