/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ThreadMemoryStatusHint } from '@/components/instamind/thread-memory-status-hint'

afterEach(() => {
    cleanup()
})

describe('ThreadMemoryStatusHint', () => {
    it('renders nothing when there is no hint', () => {
        const { container } = render(<ThreadMemoryStatusHint hint={null} />)

        expect(container.firstChild).toBeNull()
    })

    it.each([
        {
            status: 'started' as const,
            message: '上下自动压缩中',
        },
        {
            status: 'succeeded' as const,
            message: '上下文已自动压缩',
        },
        {
            status: 'failed' as const,
            message: '上下文自动压缩失败',
        },
    ])('renders a subtle status line for $status', hint => {
        render(<ThreadMemoryStatusHint hint={hint} />)

        const status = screen.getByRole('status')

        expect(status.textContent).toContain(hint.message)
    })
})
