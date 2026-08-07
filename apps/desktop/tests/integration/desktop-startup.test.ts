import path from 'node:path'

import type { ElectronApplication } from '@playwright/test'
import { _electron as electron, expect, test } from '@playwright/test'

import { startDesktopApplicationLifecycle } from '../../src/main/startup-lifecycle'

type LifecycleApp = {
    on: (event: 'second-instance' | 'window-all-closed', listener: () => void) => void
    quit: () => void
    requestSingleInstanceLock: () => boolean
    whenReady: () => Promise<void>
}

function createLifecycleApp(lockGranted = true): {
    app: LifecycleApp
    emitSecondInstance: () => void
    quitCalls: () => number
    requestLockCalls: () => number
} {
    const listeners = new Map<'second-instance' | 'window-all-closed', () => void>()
    let quits = 0
    let lockRequests = 0

    return {
        app: {
            on: (event, listener) => {
                listeners.set(event, listener)
            },
            quit: () => {
                quits += 1
            },
            requestSingleInstanceLock: () => {
                lockRequests += 1
                return lockGranted
            },
            whenReady: async () => undefined,
        },
        emitSecondInstance: () => listeners.get('second-instance')?.(),
        quitCalls: () => quits,
        requestLockCalls: () => lockRequests,
    }
}

test('quits for Squirrel startup and focuses the existing host for a second instance', async () => {
    const squirrel = createLifecycleApp()
    const squirrelReady = await startDesktopApplicationLifecycle({
        app: squirrel.app as unknown as Electron.App,
        isSquirrelStartup: true,
        onReady: async () => {
            throw new Error('Squirrel startup must not start the desktop host.')
        },
        onSecondInstance: () => undefined,
        onWindowAllClosed: () => undefined,
    })

    expect(squirrelReady).toBe('squirrel-startup')
    expect(squirrel.quitCalls()).toBe(1)
    expect(squirrel.requestLockCalls()).toBe(0)

    const primary = createLifecycleApp()
    let readyCalls = 0
    let focusCalls = 0
    const started = await startDesktopApplicationLifecycle({
        app: primary.app as unknown as Electron.App,
        isSquirrelStartup: false,
        onReady: async () => {
            readyCalls += 1
        },
        onSecondInstance: () => {
            focusCalls += 1
        },
        onWindowAllClosed: () => undefined,
    })

    expect(started).toBe('starting')
    await expect.poll(() => readyCalls).toBe(1)
    primary.emitSecondInstance()
    expect(focusCalls).toBe(1)
    expect(primary.quitCalls()).toBe(0)
})

let application: ElectronApplication

async function executeInWorkspace<T>(script: string): Promise<T> {
    return application.evaluate(async ({ BrowserWindow }, source) => {
        const workspace = BrowserWindow.getAllWindows()[0]
            ?.contentView.children.map(
                view =>
                    (
                        view as unknown as {
                            webContents: { executeJavaScript: (script: string) => Promise<unknown>; getURL: () => string }
                        }
                    ).webContents
            )
            .find(contents => contents.getURL().startsWith('http://127.0.0.1:'))

        if (!workspace) {
            throw new Error('Workspace view is unavailable.')
        }

        return workspace.executeJavaScript(source)
    }, script) as Promise<T>
}

async function hasWorkspace(): Promise<boolean> {
    return application.evaluate(
        ({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.contentView.children.some(view =>
                (view as unknown as { webContents: { getURL: () => string } }).webContents.getURL().startsWith('http://127.0.0.1:')
            ) ?? false
    )
}

async function workspaceUrl(): Promise<string | undefined> {
    return application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]
            ?.contentView.children.map(view => (view as unknown as { webContents: { getURL: () => string } }).webContents.getURL())
            .find(url => url.startsWith('http://127.0.0.1:'))
    )
}

test.beforeEach(async () => {
    application = await electron.launch({
        args: [path.join(__dirname, 'fixtures', 'desktop-startup-main.mjs')],
    })
    await application.firstWindow()
})

test.afterEach(async () => {
    await application.close()
})

test('starts one isolated workspace below the local desktop chrome after compatibility', async () => {
    await expect.poll(hasWorkspace).toBe(true)
    await expect.poll(workspaceUrl).toMatch(/\/instant-mind$/)
    expect(await executeInWorkspace<boolean>("Boolean(document.querySelector('#chat-input'))")).toBe(true)
    const startupEvidence = await application.evaluate(() => {
        type StartupEvidence = {
            attemptStartedAt: number
            compatibilityState: string
            desktopRelease: string
            platform: string
            serverVersion: string
        }

        return (globalThis as typeof globalThis & { __aiMindDesktopStartupEvidence?: StartupEvidence }).__aiMindDesktopStartupEvidence
    })

    expect(startupEvidence).toMatchObject({
        compatibilityState: 'compatible',
        desktopRelease: '0.5.0',
        platform: 'win32-x64',
        serverVersion: 'fixture-compatibility-v1',
    })
    expect(Date.now() - (startupEvidence?.attemptStartedAt ?? Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(10_000)
    await executeInWorkspace<void>("document.querySelector('#chat-input').value = 'desktop startup check'")

    const shell = await application.evaluate(({ BrowserWindow, Menu }) => {
        const window = BrowserWindow.getAllWindows()[0]

        return {
            browserWindowCount: BrowserWindow.getAllWindows().length,
            hasApplicationMenu: Menu.getApplicationMenu() !== null,
            menuBarVisible: window?.isMenuBarVisible(),
        }
    })

    expect(shell).toEqual({ browserWindowCount: 1, hasApplicationMenu: false, menuBarVisible: false })
    await expect(application.windows()).toHaveLength(2)
})
