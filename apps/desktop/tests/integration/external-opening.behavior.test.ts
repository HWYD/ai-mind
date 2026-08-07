import path from 'node:path'

import type { ElectronApplication, Page } from '@playwright/test'
import { _electron as electron, expect, test } from '@playwright/test'

type ObservedOpen = {
    disposition: string
    postBodyItemCount: number
    postBodyContentType: string | null
    url: string
}

declare global {
    var __aiMindExternalOpeningObservations: ObservedOpen[]
}

let application: ElectronApplication
let page: Page

test.beforeEach(async () => {
    application = await electron.launch({
        args: [path.join(__dirname, 'fixtures', 'external-opening-main.mjs')],
    })
    page = await application.firstWindow()

    await application.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]
        if (!window) {
            throw new Error('External-opening behavior fixture window is unavailable.')
        }
        const observedOpens: ObservedOpen[] = []

        window.webContents.setWindowOpenHandler(details => {
            observedOpens.push({
                disposition: details.disposition,
                postBodyItemCount: details.postBody?.data.length ?? 0,
                postBodyContentType: details.postBody?.contentType ?? null,
                url: details.url,
            })
            return { action: 'deny' }
        })

        globalThis.__aiMindExternalOpeningObservations = observedOpens
    })
})

test.afterEach(async () => {
    await application.close()
})

test('records the Windows window-open fields that constrain the external-opening allowlist', async () => {
    await page.locator('#pointer-link').click()
    await page.locator('#keyboard-link').focus()
    await page.keyboard.press('Enter')
    await page.locator('#window-open').click()
    await page.locator('#synthetic-link').evaluate(element => {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await page.locator('#form-submit').click()

    await expect
        .poll(() =>
            application.evaluate(() =>
                (globalThis.__aiMindExternalOpeningObservations as ObservedOpen[]).map(observation => ({
                    disposition: observation.disposition,
                    postBodyItemCount: observation.postBodyItemCount,
                    postBodyContentType: observation.postBodyContentType,
                    url: observation.url,
                }))
            )
        )
        .toHaveLength(5)

    const observations = await application.evaluate(() => globalThis.__aiMindExternalOpeningObservations as ObservedOpen[])

    expect(observations).toEqual([
        {
            disposition: 'foreground-tab',
            postBodyItemCount: 0,
            postBodyContentType: null,
            url: 'https://example.com/pointer',
        },
        {
            disposition: 'foreground-tab',
            postBodyItemCount: 0,
            postBodyContentType: null,
            url: 'https://example.com/keyboard',
        },
        {
            disposition: 'foreground-tab',
            postBodyItemCount: 0,
            postBodyContentType: null,
            url: 'https://example.com/window-open',
        },
        {
            disposition: 'foreground-tab',
            postBodyItemCount: 0,
            postBodyContentType: null,
            url: 'https://example.com/synthetic',
        },
        {
            disposition: 'foreground-tab',
            postBodyItemCount: 1,
            postBodyContentType: 'application/x-www-form-urlencoded',
            url: 'https://example.com/form',
        },
    ])
    expect(application.windows()).toHaveLength(1)
})
