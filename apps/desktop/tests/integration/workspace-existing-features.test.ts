import path from 'node:path'

import type { ElectronApplication, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { closeElectronApplication, launchDesktopMainFixture } from './electron-application'

let application: ElectronApplication
let page: Page
const requests: string[] = []

test.beforeEach(async () => {
    application = await launchDesktopMainFixture(path.join(__dirname, 'fixtures', 'workspace-existing-features-main.mjs'))
    await expect.poll(async () => (await application.windows()).some(window => window.url().startsWith('http://127.0.0.1:'))).toBe(true)
    page = (await application.windows()).find(window => window.url().startsWith('http://127.0.0.1:'))!
    requests.length = 0
    page.on('request', request => requests.push(new URL(request.url()).pathname))
    await expect(page.locator('#image-generation')).toBeVisible()
})

test.afterEach(async () => {
    await closeElectronApplication(application)
})

test('reuses webapp image, Agent, conversation list, and existing session flows without desktop business IPC', async () => {
    await page.locator('#image-generation').click()
    await expect(page.locator('#image-result')).toHaveAttribute('src', '/api/chat/runs/run-image-1/image')

    await page.locator('#agent').click()
    await expect(page.locator('#agent-result')).toHaveText('Agent completed')

    await page.locator('#conversations').click()
    await expect(page.locator('#conversation-list')).toHaveText('Existing conversation')

    await page.locator('#existing-session').click()
    await expect(page.locator('#session-result')).toHaveText('Existing session opened')

    expect(requests).toEqual(
        expect.arrayContaining(['/api/chat/runs/image', '/api/chat/runs/agent', '/api/chat/conversations', '/api/chat/thread'])
    )
    expect(requests.some(pathname => pathname.startsWith('/api/desktop/'))).toBe(false)
    await expect(page.evaluate(() => ({ nodeProcess: typeof process, recoveryBridge: typeof window.aiMindRecovery }))).resolves.toEqual({
        nodeProcess: 'undefined',
        recoveryBridge: 'undefined',
    })
})
