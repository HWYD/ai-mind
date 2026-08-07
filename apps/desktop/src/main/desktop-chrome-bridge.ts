import type { DesktopChromeMenu } from '../desktop-chrome-contract'
import { desktopChromeChannels } from '../desktop-chrome-contract'
import { LOCAL_CHROME_PROTOCOL_URL } from './local-protocol'

type ChromeWebContents = {
    getURL: () => string
}

type ChromeIpcMain = {
    handle: (channel: string, listener: (event: { sender: ChromeWebContents }, ...args: unknown[]) => boolean) => void
}

function isDesktopChromeMenu(value: unknown): value is DesktopChromeMenu {
    return value === 'view' || value === 'help'
}

function isValidPosition(value: unknown): value is { x: number; y: number } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }

    const position = value as Record<string, unknown>

    return (
        Object.keys(position).length === 2 &&
        typeof position.x === 'number' &&
        Number.isFinite(position.x) &&
        position.x >= 0 &&
        position.x <= 4096 &&
        typeof position.y === 'number' &&
        Number.isFinite(position.y) &&
        position.y >= 0 &&
        position.y <= 256
    )
}

export function installDesktopChromeBridge(input: {
    getChromeWebContents: () => ChromeWebContents | undefined
    ipcMain: ChromeIpcMain
    showMenu: (menu: DesktopChromeMenu, position: { x: number; y: number }) => void
}): void {
    input.ipcMain.handle(desktopChromeChannels.openMenu, (event, ...args) => {
        if (event.sender !== input.getChromeWebContents() || event.sender.getURL() !== LOCAL_CHROME_PROTOCOL_URL) {
            return false
        }

        if (args.length !== 2 || !isDesktopChromeMenu(args[0]) || !isValidPosition(args[1])) {
            return false
        }

        input.showMenu(args[0], args[1])
        return true
    })
}
