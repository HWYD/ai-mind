/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ContextUsageIndicator } from '@/components/chat/composer/toolbar/context-usage-indicator'
import { TooltipProvider } from '@/components/ui/tooltip'

class ResizeObserverStub {
    disconnect() {}

    observe() {}

    unobserve() {}
}

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('ContextUsageIndicator', () => {
    it('以无数字圆环和 Tooltip 展示聊天记忆的窗口占用，不提供压缩操作', async () => {
        render(
            <TooltipProvider>
                <ContextUsageIndicator usage={{ effectiveWindowTokens: 128000, usedPercent: 13 }} />
            </TooltipProvider>
        )

        const indicator = screen.getByLabelText('聊天上下文已使用 13%（128K）')

        expect(indicator.textContent).toBe('')
        expect(screen.queryByRole('button', { name: /压缩/ })).toBeNull()

        fireEvent.pointerMove(indicator, { pointerType: 'mouse' })

        await waitFor(() => {
            expect(screen.getByRole('tooltip').textContent).toContain('聊天上下文已使用 13%（128K）')
        })
    })

    it('没有安全的 usage snapshot 时不渲染', () => {
        const { container } = render(
            <TooltipProvider>
                <ContextUsageIndicator usage={null} />
            </TooltipProvider>
        )

        expect(container.innerHTML).toBe('')
    })
})
