import { describe, expect, it, vi } from 'vitest'

import { desktopChromeChannels } from '../../src/desktop-chrome-contract'
import { installDesktopChromeBridge } from '../../src/main/desktop-chrome-bridge'
import { LOCAL_CHROME_PROTOCOL_URL } from '../../src/main/local-protocol'

describe('desktop chrome bridge', () => {
    it('allows only the current local chrome to open an existing native menu at a bounded position', () => {
        const currentChrome = { getURL: () => LOCAL_CHROME_PROTOCOL_URL }
        const handle = vi.fn()
        const showMenu = vi.fn()

        installDesktopChromeBridge({
            getChromeWebContents: () => currentChrome,
            ipcMain: { handle },
            showMenu,
        })

        expect(handle).toHaveBeenCalledWith(desktopChromeChannels.openMenu, expect.any(Function))
        const listener = handle.mock.calls[0]?.[1] as (event: { sender: typeof currentChrome }, ...args: unknown[]) => boolean

        expect(listener({ sender: currentChrome }, 'view', { x: 18, y: 40 })).toBe(true)
        expect(showMenu).toHaveBeenCalledWith('view', { x: 18, y: 40 })
        expect(listener({ sender: currentChrome }, 'help', { x: 74, y: 40 })).toBe(true)
    })

    it.each([
        [{ getURL: () => LOCAL_CHROME_PROTOCOL_URL }, 'view', { x: 18, y: 40 }],
        [{ getURL: () => 'https://ai.hwyblog.cloud/' }, 'view', { x: 18, y: 40 }],
        [{ getURL: () => LOCAL_CHROME_PROTOCOL_URL }, 'unknown', { x: 18, y: 40 }],
        [{ getURL: () => LOCAL_CHROME_PROTOCOL_URL }, 'view', { x: -1, y: 40 }],
        [{ getURL: () => LOCAL_CHROME_PROTOCOL_URL }, 'view', { x: 4097, y: 40 }],
        [{ getURL: () => LOCAL_CHROME_PROTOCOL_URL }, 'view', { x: 18, y: 257 }],
        [{ getURL: () => LOCAL_CHROME_PROTOCOL_URL }, 'view', { x: 18 }],
    ])('rejects a sender or payload outside the chrome contract', (sender, menu, position) => {
        const currentChrome = { getURL: () => LOCAL_CHROME_PROTOCOL_URL }
        const handle = vi.fn()
        const showMenu = vi.fn()

        installDesktopChromeBridge({
            getChromeWebContents: () => currentChrome,
            ipcMain: { handle },
            showMenu,
        })

        const listener = handle.mock.calls[0]?.[1] as (event: { sender: typeof currentChrome }, ...args: unknown[]) => boolean

        expect(listener({ sender }, menu, position)).toBe(false)
        expect(showMenu).not.toHaveBeenCalled()
    })
})
