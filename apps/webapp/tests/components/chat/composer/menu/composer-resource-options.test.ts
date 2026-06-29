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
            {
                badgeLabel: '示例',
                fileName: 'request-limit-banner/requirement.md',
                group: 'scenario',
                label: 'request-limit-banner/requirement.md',
                uri: 'demo://scenarios/request-limit-banner/requirement.md',
                description: '体验需求到 Plan、Task、Review 报告的完整链路',
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

    it('默认只返回 version-plan 资源', async () => {
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
        expect(resources.some(resource => resource.group === 'scenario')).toBe(false)
    })

    it('delivery-chain 模式只返回 scenario requirement 资源', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockCatalogResponse,
            })
        )

        const resources = await getFilteredComposerResources('', 'delivery-chain')

        expect(resources).toEqual([
            expect.objectContaining({
                badgeLabel: '示例',
                description: '体验需求到 Plan、Task、Review 报告的完整链路',
                group: 'scenario',
                label: 'request-limit-banner/requirement.md',
                uri: 'demo://scenarios/request-limit-banner/requirement.md',
                source: 'local',
            }),
        ])
    })
})
