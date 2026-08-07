import type { DesktopChromeApi } from '../desktop-chrome-contract'

declare global {
    interface Window {
        aiMindDesktopChrome: DesktopChromeApi
    }
}

export {}
