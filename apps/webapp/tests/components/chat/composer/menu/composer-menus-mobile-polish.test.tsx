/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ComposerCommandMenu } from '@/components/chat/composer/menu/composer-command-menu'
import { ComposerResourceMenu } from '@/components/chat/composer/menu/composer-resource-menu'

describe('Composer popup mobile polish', () => {
    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: () => undefined,
        })
    })

    it('keeps the slash command popup title, badge, and description on the compact mobile classes', () => {
        const { container } = render(
            <ComposerCommandMenu
                command={vi.fn()}
                items={[
                    {
                        name: 'delivery-chain',
                        label: '生成交付计划',
                        badgeLabel: 'Multi-Agent',
                        description: '基于需求生成方案、任务拆解和并行评审报告',
                    },
                    {
                        name: 'tasklist',
                        label: '生成任务清单',
                        badgeLabel: 'Agent',
                        description: '基于 demo version 生成 tasklist 草稿',
                    },
                ]}
            />
        )

        expect(screen.getByText('Multi-Agent')).toBeTruthy()
        expect(screen.getByText('Agent')).toBeTruthy()
        expect(screen.getByText('基于需求生成方案、任务拆解和并行评审报告')).toBeTruthy()
        expect(screen.getByText('生成任务清单').className).toContain('text-sm')
        expect(screen.getByText('生成任务清单').className).toContain('sm:text-base')
        expect(screen.getByText('基于 demo version 生成 tasklist 草稿').className).toContain('text-[11px]')
        expect(screen.getByText('基于 demo version 生成 tasklist 草稿').className).toContain('sm:text-sm')
        expect(container.firstChild).toBeTruthy()
    })

    it('shows example/test badges and compact description classes in the resource popup', () => {
        render(
            <ComposerResourceMenu
                command={vi.fn()}
                items={[
                    {
                        id: 'demo:version-plan:v034',
                        type: 'resource',
                        fileName: 'v034-langsmith-observability.md',
                        group: 'version-plan',
                        label: 'v034-langsmith-observability.md',
                        uri: 'demo://version-plans/v034-langsmith-observability.md',
                        source: 'local',
                        badgeLabel: '示例',
                        description: '生成 v0.3.4 可观测性版本任务清单',
                    },
                    {
                        id: 'demo:version-plan:test-over-scoped',
                        type: 'resource',
                        fileName: 'test-over-scoped-runtime-change.md',
                        group: 'version-plan',
                        label: 'test-over-scoped-runtime-change.md',
                        uri: 'demo://version-plans/test-over-scoped-runtime-change.md',
                        source: 'local',
                        badgeLabel: '测试',
                        description: '用于测试范围过大时的边界提示',
                    },
                ]}
            />
        )

        expect(screen.getByText('示例')).toBeTruthy()
        expect(screen.getByText('测试')).toBeTruthy()
        expect(screen.getByText('v034-langsmith-observability.md').className).toContain('text-sm')
        expect(screen.getByText('v034-langsmith-observability.md').className).toContain('sm:text-base')
        expect(screen.getByText('生成 v0.3.4 可观测性版本任务清单').className).toContain('text-[11px]')
        expect(screen.getByText('生成 v0.3.4 可观测性版本任务清单').className).toContain('sm:text-sm')
    })
})
