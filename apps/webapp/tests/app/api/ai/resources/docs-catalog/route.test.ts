import { describe, expect, it } from 'vitest'

import { GET } from '@/app/api/ai/resources/docs-catalog/route'

describe('GET /api/ai/resources/docs-catalog', () => {
    it('returns only demo version-plan resources from the public manifest', async () => {
        const response = await GET()
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.code).toBe(0)
        expect(body.data.resources).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    badgeLabel: '示例',
                    description: '体验 Graph Agent 执行链路',
                    fileName: 'v020-controlled-agent-graph.md',
                    group: 'version-plan',
                    uri: 'demo://version-plans/v020-controlled-agent-graph.md',
                }),
                expect.objectContaining({
                    badgeLabel: '示例',
                    description: '体验 HITL 暂停与恢复流程',
                    fileName: 'v030-hitl-checkpoint-resume.md',
                    group: 'version-plan',
                    uri: 'demo://version-plans/v030-hitl-checkpoint-resume.md',
                }),
                expect.objectContaining({
                    badgeLabel: '示例',
                    description: '生成 v0.3.4 可观测性版本任务清单',
                    fileName: 'v034-langsmith-observability.md',
                    group: 'version-plan',
                    uri: 'demo://version-plans/v034-langsmith-observability.md',
                }),
                expect.objectContaining({
                    badgeLabel: '测试',
                    description: '用于测试版本方案信息缺失',
                    fileName: 'test-missing-non-goals.md',
                    group: 'version-plan',
                    uri: 'demo://version-plans/test-missing-non-goals.md',
                }),
                expect.objectContaining({
                    badgeLabel: '测试',
                    description: '用于测试范围过大时的边界提示',
                    fileName: 'test-over-scoped-runtime-change.md',
                    group: 'version-plan',
                    uri: 'demo://version-plans/test-over-scoped-runtime-change.md',
                }),
            ])
        )

        for (const resource of body.data.resources as Array<{ badgeLabel: string; fileName: string; group: string; uri: string }>) {
            expect(resource.group).toBe('version-plan')
            expect(resource.uri.startsWith('demo://version-plans/')).toBe(true)
            expect(resource.uri.includes('docs://')).toBe(false)
            expect(['示例', '测试']).toContain(resource.badgeLabel)
        }
    })
})
