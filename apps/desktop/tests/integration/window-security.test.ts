import path from 'node:path'

import type { ElectronApplication, Page } from '@playwright/test'
import { _electron as electron, expect, test } from '@playwright/test'

type SecurityFixtureState = {
    externalOpenCalls: string[]
    trustedOrigin: string
}

type InspectableWorkspaceWebContents = Electron.WebContents & {
    getLastWebPreferences: () => {
        allowRunningInsecureContent?: boolean
        contextIsolation?: boolean
        experimentalFeatures?: boolean
        nodeIntegration?: boolean
        preload?: string
        sandbox?: boolean
        webSecurity?: boolean
        webviewTag?: boolean
    }
}

declare global {
    var __aiMindWindowSecurityState: SecurityFixtureState
}

let application: ElectronApplication
let page: Page

async function getFixtureState(): Promise<SecurityFixtureState> {
    return application.evaluate(() => globalThis.__aiMindWindowSecurityState)
}

test.beforeEach(async () => {
    application = await electron.launch({
        args: [path.join(__dirname, 'fixtures', 'window-security-main.mjs')],
    })
    page = await application.firstWindow()

    await expect.poll(() => application.evaluate(() => globalThis.__aiMindWindowSecurityState?.trustedOrigin)).toBeTruthy()
})

test.afterEach(async () => {
    if (application) await application.close()
})

test('keeps a development workspace window isolated from navigation, popups, permissions, and external opens', async () => {
    const state = await getFixtureState()
    const preferences = await application.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]
        if (!window) {
            throw new Error('Workspace security fixture window is unavailable.')
        }

        const webPreferences = (window.webContents as InspectableWorkspaceWebContents).getLastWebPreferences()

        return {
            allowRunningInsecureContent: webPreferences.allowRunningInsecureContent,
            contextIsolation: webPreferences.contextIsolation,
            experimentalFeatures: webPreferences.experimentalFeatures,
            nodeIntegration: webPreferences.nodeIntegration,
            preload: webPreferences.preload ?? null,
            sandbox: webPreferences.sandbox,
            webSecurity: webPreferences.webSecurity,
            webviewTag: webPreferences.webviewTag,
        }
    })

    expect(preferences).toEqual({
        allowRunningInsecureContent: false,
        contextIsolation: true,
        experimentalFeatures: false,
        nodeIntegration: false,
        preload: null,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
    })
    await expect(page).toHaveURL(`${state.trustedOrigin}/workspace`)
    await expect(page.evaluate(() => typeof process)).resolves.toBe('undefined')

    const navigationDenyResults = await application.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]
        if (!window) {
            throw new Error('Workspace security fixture window is unavailable.')
        }

        const createPreventableEvent = () => ({
            defaultPrevented: false,
            preventDefault() {
                this.defaultPrevented = true
            },
        })

        const navigateEvent = createPreventableEvent()
        const frameEvent = { ...createPreventableEvent(), url: 'https://evil.example/frame' }
        const redirectEvent = createPreventableEvent()

        window.webContents.emit('will-navigate', navigateEvent, 'https://evil.example/navigation')
        window.webContents.emit('will-frame-navigate', frameEvent)
        window.webContents.emit('will-redirect', redirectEvent, 'https://evil.example/redirected')

        return {
            frame: frameEvent.defaultPrevented,
            navigate: navigateEvent.defaultPrevented,
            redirect: redirectEvent.defaultPrevented,
        }
    })

    expect(navigationDenyResults).toEqual({ frame: true, navigate: true, redirect: true })

    await page.locator('#external-popup').click()
    await page.locator('#window-open').click()
    await expect.poll(() => application.windows()).toHaveLength(1)
    expect((await getFixtureState()).externalOpenCalls).toEqual([])

    await page.locator('#clipboard-read').click()
    await expect(page.locator('#clipboard-result')).toHaveText('denied')
    await page.locator('#media-request').click()
    await expect(page.locator('#media-result')).toHaveText('denied')
})
