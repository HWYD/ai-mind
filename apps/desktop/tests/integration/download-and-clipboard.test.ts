import path from 'node:path'

import type { ElectronApplication, Page } from '@playwright/test'
import { _electron as electron, expect, test } from '@playwright/test'

let application: ElectronApplication
let page: Page

test.beforeEach(async () => {
    application = await electron.launch({
        args: [path.join(__dirname, 'fixtures', 'download-and-clipboard-main.mjs')],
    })
    await expect.poll(async () => (await application.windows()).some(window => window.url().startsWith('http://127.0.0.1:'))).toBe(true)
    page = (await application.windows()).find(window => window.url().startsWith('http://127.0.0.1:'))!
    await expect(page.locator('#clipboard-read')).toBeVisible()
})

test.afterEach(async () => {
    await application.close()
})

test('allows only the trusted image Blob save-dialog path and denies unsafe downloads and clipboard reads', async () => {
    const downloadResults = await application.evaluate(({ BrowserWindow, session }) => {
        const window = BrowserWindow.getAllWindows()[0]
        if (!window) {
            throw new Error('Download policy fixture workspace window is unavailable.')
        }
        const workspace = window.contentView.children
            .map(view => (view as unknown as { webContents: Electron.WebContents }).webContents)
            .find(contents => contents.getURL().startsWith('http://127.0.0.1:'))
        if (!workspace) {
            throw new Error('Download policy fixture workspace view is unavailable.')
        }

        const workspaceSession = session.fromPartition('persist:ai-mind-desktop')
        const run = (item: Record<string, unknown>) => {
            let prevented = false
            workspaceSession.emit('will-download', { preventDefault: () => (prevented = true) }, item, workspace)
            return { prevented, saveOptions: item.saveOptions ?? null, setSavePathCalls: item.setSavePathCalls ?? 0 }
        }
        const trustedOrigin = new URL(workspace.getURL()).origin
        const trustedBlob = `blob:${trustedOrigin}/image-result`

        const allowedItem = {
            getFilename: () => 'image-result.png',
            getMimeType: () => 'image/png',
            getURLChain: () => [trustedBlob],
            hasUserGesture: () => true,
            setSaveDialogOptions: (options: unknown) => (allowedItem.saveOptions = options),
            setSavePath: () => (allowedItem.setSavePathCalls += 1),
            saveOptions: null as unknown,
            setSavePathCalls: 0,
        }
        const automaticItem = {
            ...allowedItem,
            getURLChain: () => [trustedBlob, trustedBlob],
            hasUserGesture: () => false,
            saveOptions: null,
            setSavePathCalls: 0,
        }
        const externalItem = {
            ...allowedItem,
            getURLChain: () => ['https://evil.example/image.png'],
            saveOptions: null,
            setSavePathCalls: 0,
        }

        return {
            allowed: run(allowedItem),
            automatic: run(automaticItem),
            external: run(externalItem),
        }
    })

    expect(downloadResults.allowed).toEqual({
        prevented: false,
        saveOptions: {
            defaultPath: 'image-result.png',
            filters: [{ extensions: ['png'], name: '图像文件' }],
        },
        setSavePathCalls: 0,
    })
    expect(downloadResults.automatic.prevented).toBe(true)
    expect(downloadResults.external.prevented).toBe(true)

    await page.locator('#clipboard-read').click()
    await expect(page.locator('#clipboard-result')).toHaveText('denied')
    await page.locator('#media-request').click()
    await expect(page.locator('#media-result')).toHaveText('denied')
})
