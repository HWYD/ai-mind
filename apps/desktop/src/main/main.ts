import { existsSync } from 'node:fs'
import path from 'node:path'

import { app, dialog, Menu, nativeTheme, powerMonitor, protocol, session } from 'electron'
import squirrelStartup from 'electron-squirrel-startup'

import { createApplicationMenu } from './application-menu'
import { createDesktopBuildConfig } from './build-config'
import { createDesktopHost } from './desktop-host'
import { installRecoveryProtocolHandler, LocalProtocolRegistrar } from './local-protocol'
import { createDesktopSessions, resolveDesktopUserDataPath } from './session-profile'
import { startDesktopApplicationLifecycle } from './startup-lifecycle'

const localProtocolRegistrar = new LocalProtocolRegistrar()

let desktopHost: ReturnType<typeof createDesktopHost> | undefined

const lifecycleState = startDesktopApplicationLifecycle({
    app,
    isSquirrelStartup: process.platform === 'win32' && squirrelStartup,
    onReady: async () => {
        try {
            nativeTheme.themeSource = 'light'
            const dockIconPath = path.join(app.getAppPath(), 'assets', 'icons', 'ai-mind-icon.png')
            if (process.platform === 'darwin' && !app.isPackaged && existsSync(dockIconPath)) {
                app.dock?.setIcon(dockIconPath)
            }
            const config = createDesktopBuildConfig({
                desktopVersion: app.getVersion(),
                developmentOrigin: process.env.AI_MIND_DESKTOP_DEV_ORIGIN,
                isPackaged: app.isPackaged,
            })
            app.setPath('userData', resolveDesktopUserDataPath(app.getPath('appData')))
            const { recoverySession, workspaceSession } = createDesktopSessions<Electron.Session>(partition =>
                session.fromPartition(partition)
            )

            app.setAppUserModelId(config.appUserModelId)
            installRecoveryProtocolHandler({
                assetRoot: path.join(app.getAppPath(), '.webpack', 'renderer'),
                protocol: recoverySession.protocol,
            })
            const applicationMenu = createApplicationMenu({
                desktopVersion: config.desktopVersion,
                trustedOrigin: config.trustedOrigin,
            })
            Menu.setApplicationMenu(null)

            desktopHost = createDesktopHost({
                applicationMenu,
                config,
                recoverySession,
                workspaceSession,
            })
            powerMonitor.on('suspend', () => desktopHost?.handleSuspend())
            powerMonitor.on('resume', () => desktopHost?.handleResume())
            await desktopHost.start()
        } catch {
            await dialog.showMessageBox({
                buttons: ['退出'],
                message: '桌面宿主无法安全启动。',
                title: 'AI Mind Desktop',
                type: 'error',
            })
            app.quit()
        }
    },
    onSecondInstance: () => desktopHost?.focusActiveWindow(),
    onWindowAllClosed: () => app.quit(),
})

if (lifecycleState === 'starting') {
    localProtocolRegistrar.registerBeforeReady(protocol)
}
