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
                fileName: 'register-login/requirement.md',
                group: 'scenario',
                label: '注册登录系统',
                uri: 'demo://scenarios/register-login/requirement.md',
                description: '体验注册、登录与安全边界的交付规划链路',
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
                description: '体验注册、登录与安全边界的交付规划链路',
                group: 'scenario',
                label: '注册登录系统',
                uri: 'demo://scenarios/register-login/requirement.md',
                source: 'local',
            }),
        ])
    })
})
