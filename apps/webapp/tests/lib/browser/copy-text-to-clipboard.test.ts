/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyTextToClipboard } from '@/lib/browser/copy-text-to-clipboard'

const originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard')
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')

afterEach(() => {
    if (originalClipboard) {
        Object.defineProperty(window.navigator, 'clipboard', originalClipboard)
    } else {
        delete (window.navigator as { clipboard?: Clipboard }).clipboard
    }

    if (originalExecCommand) {
        Object.defineProperty(document, 'execCommand', originalExecCommand)
    } else {
        delete (document as { execCommand?: (command: string) => boolean }).execCommand
    }
    vi.restoreAllMocks()
})

describe('copyTextToClipboard', () => {
    it('returns false when the legacy copy fallback is rejected', async () => {
        Object.defineProperty(window.navigator, 'clipboard', {
            configurable: true,
            value: undefined,
        })
        const execCommand = vi.fn(() => false)
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            value: execCommand,
        })

        await expect(copyTextToClipboard('https://github.com/HWYD/ai-mind')).resolves.toBe(false)
        expect(execCommand).toHaveBeenCalledWith('copy')
    })
})
