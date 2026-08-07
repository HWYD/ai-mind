import { describe, expect, it } from 'vitest'

import { DESKTOP_CHROME_HEIGHT, getDesktopChromeWindowPolicy } from '../../src/main/desktop-chrome-policy'

describe('desktop chrome window policy', () => {
    it('keeps Windows native controls in a light right-side title bar overlay', () => {
        expect(getDesktopChromeWindowPolicy('win32')).toEqual({
            backgroundColor: '#f7f8fa',
            titleBarOverlay: {
                color: '#f7f8fa',
                height: DESKTOP_CHROME_HEIGHT - 1,
                symbolColor: '#273244',
            },
            titleBarStyle: 'hidden',
        })
    })

    it('keeps macOS traffic lights by using the native hidden inset title bar', () => {
        expect(getDesktopChromeWindowPolicy('darwin')).toEqual({
            backgroundColor: '#f7f8fa',
            titleBarStyle: 'hiddenInset',
        })
    })
})
