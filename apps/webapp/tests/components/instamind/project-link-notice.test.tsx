/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectLinkNotice } from '@/components/instamind/project-link-notice'

afterEach(() => {
    vi.useRealTimers()
    cleanup()
})

describe('ProjectLinkNotice', () => {
    it('announces the copied project link and dismisses itself after 2.5 seconds', () => {
        vi.useFakeTimers()
        const onDismiss = vi.fn()

        render(<ProjectLinkNotice notice="copied" onDismiss={onDismiss} />)

        expect(screen.getByRole('status').textContent).toContain('已复制链接，请在浏览器打开')

        act(() => {
            vi.advanceTimersByTime(2499)
        })
        expect(onDismiss).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('announces the fallback message when copying the project link fails', () => {
        render(<ProjectLinkNotice notice="copy-failed" onDismiss={vi.fn()} />)

        expect(screen.getByRole('status').textContent).toContain('复制链接失败，请手动复制')
    })
})
