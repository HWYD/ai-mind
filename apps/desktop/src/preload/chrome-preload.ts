import { contextBridge, ipcRenderer } from 'electron'

import { type DesktopChromeApi, desktopChromeChannels, type DesktopChromeMenu } from '../desktop-chrome-contract'

const chromeApi: DesktopChromeApi = {
    openMenu: (menu: DesktopChromeMenu, position: { x: number; y: number }) =>
        ipcRenderer.invoke(desktopChromeChannels.openMenu, menu, position),
}

contextBridge.exposeInMainWorld('aiMindDesktopChrome', chromeApi)
