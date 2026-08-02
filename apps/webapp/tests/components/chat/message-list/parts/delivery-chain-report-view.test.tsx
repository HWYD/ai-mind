/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DeliveryChainReportView } from '@/components/chat/message-list/parts/delivery-chain-report-view'

afterEach(() => {
    cleanup()
})

describe('DeliveryChainReportView', () => {
    it('renders the current structured report sections instead of falling back to one long Markdown block', () => {
        const markdown = [
            '# Delivery Chain Report / 交付计划报告',
            '',
            '> 这是受控规划与评审报告。',
            '',
            '## Canonical Status',
            '- 状态：`pass`',
            '',
            '## 实现方案',
            '### 方案概览',
            '- 交付一个可验证的提醒横幅。',
            '',
            '## 任务拆解',
            '### 任务 TASK-1：实现横幅',
            '- 验收：低配额时显示。',
            '',
            '## 评审观察',
            '- 未发现需要修改的问题。',
            '',
            '## 下一步',
            '- 可进入人工确认。',
        ].join('\n')

        render(<DeliveryChainReportView markdown={markdown} />)

        expect(screen.getByRole('heading', { name: '交付计划报告' })).toBeTruthy()
        expect(screen.getByRole('heading', { name: 'Canonical Status' })).toBeTruthy()
        expect(screen.getByRole('heading', { name: '实现方案' })).toBeTruthy()
        expect(screen.getByRole('heading', { name: '任务拆解' })).toBeTruthy()
    })

    it('不会把内部重复 heading 解析成重复 section，也不会重复渲染任务拆解标题', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const markdown = [
            '# Delivery Chain Report / 交付计划报告',
            '',
            '> 这是受控规划与评审报告。',
            '',
            '## 输入来源',
            '- demo scenario',
            '',
            '## 需求摘要',
            '需要一个请求上限提示 banner。',
            '',
            '## 实现方案',
            '## 需求理解',
            '- 在接近阈值时显示提醒。',
            '',
            '## 实现方案',
            '- 新增轻量提示层。',
            '',
            '## 非目标',
            '- 不改 stream protocol。',
            '',
            '## 风险',
            '- 需要和现有限流状态对齐。',
            '',
            '## 任务拆解',
            '## 任务拆解',
            '- 接入状态判断。',
            '',
            '## 推荐顺序',
            '1. 先补状态判断',
            '',
            '## 交付评审',
            '- 需要人工确认阈值。',
            '',
            '## 风险',
            '- 阈值调整需要人工复核。',
            '',
            '## 非目标',
            '- 不扩展到 artifact handoff。',
            '',
            '## 下一步建议',
            '- 先确认阈值。',
        ].join('\n')

        render(<DeliveryChainReportView markdown={markdown} />)

        expect(screen.getAllByRole('heading', { name: '任务拆解' })).toHaveLength(1)
        expect(consoleErrorSpy.mock.calls.flat().join('\n')).not.toContain('Encountered two children with the same key')

        consoleErrorSpy.mockRestore()
    })
})
