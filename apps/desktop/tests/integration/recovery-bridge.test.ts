import { expect, test } from '@playwright/test'

import { installRecoveryBridge } from '../../src/main/recovery-bridge'
import { recoveryBridgeChannels } from '../../src/recovery-bridge-contract'

type RecoveryHandler = (event: { sender: FakeWebContents }, ...args: unknown[]) => Promise<unknown>

type FakeWebContents = {
    getURL: () => string
}

class FakeIpcMain {
    readonly handlers = new Map<string, RecoveryHandler>()

    handle(channel: string, handler: RecoveryHandler): void {
        this.handlers.set(channel, handler)
    }

    async invoke(channel: string, sender: FakeWebContents, ...args: unknown[]): Promise<unknown> {
        const handler = this.handlers.get(channel)

        if (!handler) {
            throw new Error(`No recovery handler registered for ${channel}.`)
        }

        return handler({ sender }, ...args)
    }
}

function createFixture() {
    const ipcMain = new FakeIpcMain()
    const recoveryWebContents = { getURL: () => 'ai-mind-desktop://local/' }
    const calls = {
        copyDiagnostic: 0,
        exportDiagnostic: 0,
        resetProfile: 0,
        retry: 0,
    }

    installRecoveryBridge({
        copyDiagnostic: async () => {
            calls.copyDiagnostic += 1
            return 'copied'
        },
        exportDiagnostic: async () => {
            calls.exportDiagnostic += 1
            return 'cancelled'
        },
        getRecoveryWebContents: () => recoveryWebContents,
        ipcMain,
        resetProfile: async () => {
            calls.resetProfile += 1
            return 'started'
        },
        retry: async () => {
            calls.retry += 1
            return 'started'
        },
    })

    return { calls, ipcMain, recoveryWebContents }
}

test('recovery bridge accepts only the current local recovery window and strict action schemas', async () => {
    const { calls, ipcMain, recoveryWebContents } = createFixture()
    const remoteWebContents = { getURL: () => 'https://ai.hwyblog.cloud/' }
    const staleRecoveryWebContents = { getURL: () => 'ai-mind-desktop://local/' }

    await expect(ipcMain.invoke(recoveryBridgeChannels.retry, remoteWebContents)).resolves.toBe('denied')
    await expect(ipcMain.invoke(recoveryBridgeChannels.retry, staleRecoveryWebContents)).resolves.toBe('denied')
    await expect(ipcMain.invoke(recoveryBridgeChannels.retry, recoveryWebContents, { unexpected: true })).resolves.toBe('invalid_request')
    await expect(ipcMain.invoke(recoveryBridgeChannels.confirmResetProfile, recoveryWebContents, { confirmed: false })).resolves.toBe(
        'invalid_request'
    )
    await expect(
        ipcMain.invoke(recoveryBridgeChannels.confirmResetProfile, recoveryWebContents, { confirmed: true, unexpected: true })
    ).resolves.toBe('invalid_request')

    await expect(ipcMain.invoke(recoveryBridgeChannels.retry, recoveryWebContents)).resolves.toBe('started')
    await expect(ipcMain.invoke(recoveryBridgeChannels.confirmResetProfile, recoveryWebContents, { confirmed: true })).resolves.toBe(
        'started'
    )
    await expect(ipcMain.invoke(recoveryBridgeChannels.copyDiagnostic, recoveryWebContents)).resolves.toBe('copied')
    await expect(ipcMain.invoke(recoveryBridgeChannels.exportDiagnostic, recoveryWebContents)).resolves.toBe('cancelled')

    expect(calls).toEqual({ copyDiagnostic: 1, exportDiagnostic: 1, resetProfile: 1, retry: 1 })
    expect([...ipcMain.handlers.keys()]).toHaveLength(Object.values(recoveryBridgeChannels).length)
    expect([...ipcMain.handlers.keys()]).toEqual(expect.arrayContaining(Object.values(recoveryBridgeChannels)))
    expect(JSON.stringify(recoveryBridgeChannels)).not.toContain('upgrade')
})

test('confirmed reset takes precedence over retry and recovery never creates concurrent operations', async () => {
    const ipcMain = new FakeIpcMain()
    const recoveryWebContents = { getURL: () => 'ai-mind-desktop://local/' }
    let resolveRetry: (() => void) | undefined
    let resolveReset: (() => void) | undefined
    const retry = new Promise<void>(resolve => {
        resolveRetry = resolve
    })
    const reset = new Promise<void>(resolve => {
        resolveReset = resolve
    })

    installRecoveryBridge({
        copyDiagnostic: async () => 'copied',
        exportDiagnostic: async () => 'saved',
        getRecoveryWebContents: () => recoveryWebContents,
        ipcMain,
        resetProfile: async () => {
            await reset
            return 'started'
        },
        retry: async () => {
            await retry
            return 'started'
        },
    })

    const retryRequest = ipcMain.invoke(recoveryBridgeChannels.retry, recoveryWebContents)

    await expect(ipcMain.invoke(recoveryBridgeChannels.retry, recoveryWebContents)).resolves.toBe('already_in_progress')
    const resetRequest = ipcMain.invoke(recoveryBridgeChannels.confirmResetProfile, recoveryWebContents, { confirmed: true })
    await expect(ipcMain.invoke(recoveryBridgeChannels.retry, recoveryWebContents)).resolves.toBe('already_in_progress')

    resolveReset?.()
    resolveRetry?.()

    await expect(resetRequest).resolves.toBe('started')
    await expect(retryRequest).resolves.toBe('started')
})
