import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { app, BrowserWindow, clipboard, dialog, ipcMain, WebContentsView } from 'electron'

import type { DesktopChromeMenu } from '../desktop-chrome-contract'
import { RECOVERY_STATE_CHANNEL, type RecoveryViewState } from '../recovery-bridge-contract'
import { showApplicationMenu } from './application-menu'
import { installDesktopChromeBridge } from './desktop-chrome-bridge'
import { DESKTOP_CHROME_HEIGHT, getDesktopChromeWindowPolicy } from './desktop-chrome-policy'
import {
    copyDesktopSupportDiagnostic,
    createDesktopSupportDiagnostic,
    type DesktopSupportDiagnostic,
    exportDesktopSupportDiagnostic,
} from './diagnostics'
import { createDesktopHostRuntime } from './host-runtime'
import { isRecoveryProtocolUrl, LOCAL_CHROME_PROTOCOL_URL, LOCAL_PROTOCOL_ORIGIN } from './local-protocol'
import { installRecoveryBridge } from './recovery-bridge'
import { installWorkspaceSecurityPolicy } from './security-policy'

declare const RECOVERY_PRELOAD_WEBPACK_ENTRY: string
declare const CHROME_PRELOAD_WEBPACK_ENTRY: string

type DesktopShell = {
    browserWindow: Electron.BrowserWindow
    contentWebContents: Electron.WebContents
    destroy: () => void
    focus: () => void
    loadURL: (url: string) => Promise<unknown>
    show: () => void
    whenChromeReady: () => Promise<void>
}

function currentDesktopRuntime(): Pick<DesktopSupportDiagnostic, 'architecture' | 'platform'> {
    if (process.platform === 'win32' && process.arch === 'x64') {
        return { architecture: 'x64', platform: 'win32' }
    }
    if (process.platform === 'darwin' && process.arch === 'arm64') {
        return { architecture: 'arm64', platform: 'darwin' }
    }

    throw new Error('AI Mind Desktop v0.5.0 only supports Windows x64 and macOS arm64.')
}

export function createWorkspaceWindow(input: { session: Electron.Session; trustedOrigin: string }): Electron.BrowserWindow {
    const workspaceWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            allowRunningInsecureContent: false,
            contextIsolation: true,
            experimentalFeatures: false,
            nodeIntegration: false,
            sandbox: true,
            session: input.session,
            webSecurity: true,
            webviewTag: false,
        },
    })

    installWorkspaceSecurityPolicy({
        session: input.session,
        trustedOrigin: input.trustedOrigin,
        webContents: workspaceWindow.webContents,
    })

    return workspaceWindow
}

function createDesktopShell(input: {
    contentPreferences: Electron.WebPreferences
    chromeSession: Electron.Session
    onChromeWindowClosed: (window: Electron.BrowserWindow) => void
    onChromeWindowCreated: (window: Electron.BrowserWindow) => void
}): DesktopShell {
    const browserWindow = new BrowserWindow({
        autoHideMenuBar: true,
        height: 800,
        icon: !app.isPackaged && process.platform === 'win32' ? path.join(app.getAppPath(), 'assets', 'icons', 'ai-mind.ico') : undefined,
        minHeight: 480,
        minWidth: 720,
        show: false,
        ...getDesktopChromeWindowPolicy(process.platform),
        width: 1280,
        webPreferences: {
            allowRunningInsecureContent: false,
            contextIsolation: true,
            experimentalFeatures: false,
            nodeIntegration: false,
            preload: typeof CHROME_PRELOAD_WEBPACK_ENTRY === 'string' ? CHROME_PRELOAD_WEBPACK_ENTRY : undefined,
            sandbox: true,
            session: input.chromeSession,
            webSecurity: true,
            webviewTag: false,
        },
    })
    const contentView = new WebContentsView({ webPreferences: input.contentPreferences })

    browserWindow.contentView.addChildView(contentView)
    browserWindow.setMenuBarVisibility(false)
    browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    browserWindow.webContents.on('will-navigate', (event, url) => {
        if (url !== LOCAL_CHROME_PROTOCOL_URL) {
            event.preventDefault()
        }
    })
    browserWindow.webContents.on('will-redirect', (event, url) => {
        if (url !== LOCAL_CHROME_PROTOCOL_URL) {
            event.preventDefault()
        }
    })
    browserWindow.on('closed', () => input.onChromeWindowClosed(browserWindow))
    browserWindow.on('resize', () => {
        const [width = 0, height = 0] = browserWindow.getContentSize()

        contentView.setBounds({
            height: Math.max(0, height - DESKTOP_CHROME_HEIGHT),
            width,
            x: 0,
            y: DESKTOP_CHROME_HEIGHT,
        })
    })

    const [width = 0, height = 0] = browserWindow.getContentSize()
    contentView.setBounds({
        height: Math.max(0, height - DESKTOP_CHROME_HEIGHT),
        width,
        x: 0,
        y: DESKTOP_CHROME_HEIGHT,
    })
    input.onChromeWindowCreated(browserWindow)
    const chromeReady = browserWindow.loadURL(LOCAL_CHROME_PROTOCOL_URL).then(() => undefined)

    return {
        browserWindow,
        contentWebContents: contentView.webContents,
        destroy: () => browserWindow.destroy(),
        focus: () => browserWindow.focus(),
        loadURL: url => contentView.webContents.loadURL(url),
        show: () => browserWindow.show(),
        whenChromeReady: () => chromeReady,
    }
}

function createWorkspaceShell(input: {
    chromeSession: Electron.Session
    onChromeWindowClosed: (window: Electron.BrowserWindow) => void
    onChromeWindowCreated: (window: Electron.BrowserWindow) => void
    session: Electron.Session
    trustedOrigin: string
}): DesktopShell {
    const shell = createDesktopShell({
        chromeSession: input.chromeSession,
        contentPreferences: {
            allowRunningInsecureContent: false,
            contextIsolation: true,
            experimentalFeatures: false,
            nodeIntegration: false,
            sandbox: true,
            session: input.session,
            webSecurity: true,
            webviewTag: false,
        },
        onChromeWindowClosed: input.onChromeWindowClosed,
        onChromeWindowCreated: input.onChromeWindowCreated,
    })

    installWorkspaceSecurityPolicy({
        session: input.session,
        trustedOrigin: input.trustedOrigin,
        webContents: shell.contentWebContents,
    })

    return shell
}

async function createRecoveryWindow(input: {
    chromeSession: Electron.Session
    onChromeWindowClosed: (window: Electron.BrowserWindow) => void
    onChromeWindowCreated: (window: Electron.BrowserWindow) => void
    session: Electron.Session
}): Promise<DesktopShell> {
    const recoveryWindow = createDesktopShell({
        chromeSession: input.chromeSession,
        contentPreferences: {
            allowRunningInsecureContent: false,
            contextIsolation: true,
            experimentalFeatures: false,
            nodeIntegration: false,
            preload: RECOVERY_PRELOAD_WEBPACK_ENTRY,
            sandbox: true,
            session: input.session,
            webSecurity: true,
            webviewTag: false,
        },
        onChromeWindowClosed: input.onChromeWindowClosed,
        onChromeWindowCreated: input.onChromeWindowCreated,
    })

    recoveryWindow.contentWebContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    recoveryWindow.contentWebContents.on('will-navigate', event => {
        if (!isRecoveryProtocolUrl(event.url)) {
            event.preventDefault()
        }
    })
    recoveryWindow.contentWebContents.on('will-redirect', (event, url) => {
        if (!isRecoveryProtocolUrl(url)) {
            event.preventDefault()
        }
    })
    input.session.setPermissionCheckHandler(() => false)
    input.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    input.session.on('will-download', event => event.preventDefault())

    try {
        await recoveryWindow.whenChromeReady()
        await recoveryWindow.loadURL(LOCAL_PROTOCOL_ORIGIN)

        return recoveryWindow
    } catch {
        recoveryWindow.destroy()
        throw new Error('Local recovery window could not be initialized')
    }
}

export function createDesktopHost(input: {
    applicationMenu: Electron.Menu
    config: Parameters<typeof createDesktopHostRuntime>[0]['config']
    recoverySession: Electron.Session
    workspaceSession: Electron.Session
}): ReturnType<typeof createDesktopHostRuntime> {
    let activeChromeWindow: Electron.BrowserWindow | undefined
    let recoveryWindow: DesktopShell | undefined
    let latestRecoveryState: RecoveryViewState | undefined

    const getDiagnostic = () => {
        const runtime = currentDesktopRuntime()

        return createDesktopSupportDiagnostic({
            architecture: runtime.architecture,
            chromiumVersion: process.versions.chrome ?? 'unknown',
            compatibility: latestRecoveryState
                ? latestRecoveryState.kind === 'manual_upgrade_required'
                    ? {
                          kind: latestRecoveryState.kind,
                          minimumDesktopVersion: latestRecoveryState.minimumDesktopVersion ?? input.config.desktopVersion,
                      }
                    : {
                          errorCode: latestRecoveryState.errorCode ?? 'NETWORK_UNAVAILABLE',
                          kind: latestRecoveryState.kind,
                      }
                : { kind: 'not_checked' },
            desktopRelease: input.config.desktopVersion,
            electronVersion: process.versions.electron ?? 'unknown',
            generatedAt: new Date().toISOString(),
            platform: runtime.platform,
            trustedOrigin: input.config.trustedOrigin,
        })
    }

    const runtime = createDesktopHostRuntime({
        config: input.config,
        createRecoveryWindow: async state => {
            latestRecoveryState = state
            recoveryWindow = await createRecoveryWindow({
                chromeSession: input.recoverySession,
                onChromeWindowClosed: window => {
                    if (activeChromeWindow === window) {
                        activeChromeWindow = undefined
                    }
                },
                onChromeWindowCreated: window => {
                    activeChromeWindow = window
                },
                session: input.recoverySession,
            })
            return recoveryWindow
        },
        createWorkspaceWindow: async () => {
            const workspaceShell = createWorkspaceShell({
                chromeSession: input.recoverySession,
                onChromeWindowClosed: window => {
                    if (activeChromeWindow === window) {
                        activeChromeWindow = undefined
                    }
                },
                onChromeWindowCreated: window => {
                    activeChromeWindow = window
                },
                session: input.workspaceSession,
                trustedOrigin: input.config.trustedOrigin,
            })

            try {
                await workspaceShell.whenChromeReady()
                return workspaceShell
            } catch {
                workspaceShell.destroy()
                throw new Error('Local desktop chrome could not be initialized')
            }
        },
        exitApplication: () => app.quit(),
        observeWorkspaceWindow: (workspaceWindow, handlers) => {
            const shell = workspaceWindow as DesktopShell
            shell.browserWindow.on('closed', handlers.closed)
            shell.contentWebContents.on('render-process-gone', handlers.renderProcessGone)
        },
        showNativeSafeDialog: async code => {
            const result = await dialog.showMessageBox({
                buttons: ['重试', '退出'],
                cancelId: 1,
                defaultId: 0,
                detail: `安全错误代码：${code}`,
                message: '本地恢复不可用。',
                title: 'AI Mind Desktop',
                type: 'error',
            })

            return result.response === 0 ? 'retry' : 'exit'
        },
        updateRecoveryWindow: (window, state) => {
            latestRecoveryState = state
            if (recoveryWindow && !recoveryWindow.browserWindow.isDestroyed()) {
                recoveryWindow.contentWebContents.send(RECOVERY_STATE_CHANNEL, state)
            }
        },
        workspaceSession: input.workspaceSession,
    })

    installDesktopChromeBridge({
        getChromeWebContents: () => activeChromeWindow?.webContents,
        ipcMain,
        showMenu: (menu: DesktopChromeMenu, position) => {
            if (!activeChromeWindow || activeChromeWindow.isDestroyed()) {
                return
            }

            showApplicationMenu({
                menu: input.applicationMenu,
                menuName: menu,
                position,
                window: activeChromeWindow,
            })
        },
    })

    installRecoveryBridge({
        copyDiagnostic: () =>
            copyDesktopSupportDiagnostic({
                diagnostic: getDiagnostic(),
                writeText: text => clipboard.writeText(text),
            }),
        exportDiagnostic: () =>
            exportDesktopSupportDiagnostic({
                diagnostic: getDiagnostic(),
                showSaveDialog: options =>
                    recoveryWindow ? dialog.showSaveDialog(recoveryWindow.browserWindow, options) : dialog.showSaveDialog(options),
                writeFile,
            }),
        getRecoveryWebContents: () => recoveryWindow?.contentWebContents,
        ipcMain,
        resetProfile: runtime.resetProfile,
        retry: runtime.retry,
    })

    return runtime
}
