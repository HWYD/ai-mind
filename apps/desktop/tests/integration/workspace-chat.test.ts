import path from 'node:path'

import type { ElectronApplication, Page } from '@playwright/test'
import { _electron as electron, expect, test } from '@playwright/test'

let application: ElectronApplication
let page: Page

test.beforeEach(async () => {
    application = await electron.launch({
        args: [path.join(__dirname, 'fixtures', 'workspace-chat-main.mjs')],
    })
    await expect.poll(async () => (await application.windows()).some(window => window.url().startsWith('http://127.0.0.1:'))).toBe(true)
    page = (await application.windows()).find(window => window.url().startsWith('http://127.0.0.1:'))!
    await expect(page.locator('#chat-input')).toBeVisible()
})

test.afterEach(async () => {
    await application.close()
})

test('keeps normal chat, streaming, stop, and error feedback in the trusted web workspace', async () => {
    await page.locator('#chat-input').fill('normal chat')
    await page.locator('#send').click()
    await expect(page.locator('#stream-output')).toHaveText('First streaming response')

    await page.locator('#chat-input').fill('stop streaming')
    await page.locator('#send').click()
    await expect(page.locator('#stream-output')).toHaveText('First ')
    await page.locator('#stop').click()
    await expect(page.locator('#status')).toHaveText('Stopped')

    await page.locator('#error').click()
    await expect(page.locator('#status')).toHaveText('Request failed')
    await expect(page.evaluate(() => ({ nodeProcess: typeof process, recoveryBridge: typeof window.aiMindRecovery }))).resolves.toEqual({
        nodeProcess: 'undefined',
        recoveryBridge: 'undefined',
    })
})
