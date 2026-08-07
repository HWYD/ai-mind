export const desktopChromeChannels = {
    openMenu: 'ai-mind-desktop-chrome:open-menu',
} as const

export type DesktopChromeMenu = 'help' | 'view'

export interface DesktopChromeApi {
    openMenu: (menu: DesktopChromeMenu, position: { x: number; y: number }) => Promise<boolean>
}
