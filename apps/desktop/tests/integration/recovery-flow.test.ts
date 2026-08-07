import { expect, test } from '@playwright/test'

import { createDesktopBuildConfig } from '../../src/main/build-config'
import { createDesktopHostRuntime } from '../../src/main/host-runtime'
import type { RecoveryViewState } from '../../src/recovery-bridge-contract'

function createConfig() {
    return createDesktopBuildConfig({
        desktopVersion: '0.5.0',
        developmentOrigin: 'http://localhost:3000',
        isPackaged: false,
    })
}

function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
    return new Response(JSON.stringify(body), { headers: { 'content-type': contentType }, status })
}

function createRuntime(input: { fetch: () => Promise<Response>; loadWorkspace?: () => Promise<void>; now?: () => number }) {
    const recoveryStates: Array<Record<string, unknown>> = []
    const nativeSafeDialogCodes: string[] = []
    const loadedUrls: string[] = []
    const workspace = {
        destroyCalls: 0,
        focusCalls: 0,
        loadedUrls,
        loadURL: async (url: string) => {
            loadedUrls.push(url)
            await (input.loadWorkspace ?? (async () => undefined))()
        },
        showCalls: 0,
        destroy() {
            this.destroyCalls += 1
        },
        focus() {
            this.focusCalls += 1
        },
        show() {
            this.showCalls += 1
        },
    }
    const recovery = {
        focusCalls: 0,
        showCalls: 0,
        focus() {
            this.focusCalls += 1
        },
        show() {
            this.showCalls += 1
        },
    }
    const runtime = createDesktopHostRuntime({
        config: createConfig(),
        createRecoveryWindow: state => {
            recoveryStates.push(state)
            return recovery
        },
        createWorkspaceWindow: () => workspace,
        now: input.now,
        showNativeSafeDialog: code => {
            nativeSafeDialogCodes.push(code)
        },
        updateRecoveryWindow: (_window, state) => {
            recoveryStates.push(state)
        },
        workspaceSession: {
            clearData: async () => undefined,
            fetch: input.fetch,
        },
    })

    return { nativeSafeDialogCodes, recovery, recoveryStates, runtime, workspace }
}

test('loads a workspace only after a compatible response and otherwise shows local recovery', async () => {
    const compatible = createRuntime({ fetch: async () => jsonResponse({ contractVersion: 1, status: 'compatible' }) })

    await expect(compatible.runtime.start()).resolves.toBe('started')
    expect(compatible.workspace.showCalls).toBe(1)
    expect(compatible.workspace.loadedUrls).toEqual(['http://localhost:3000/instant-mind'])
    expect(compatible.recovery.showCalls).toBe(0)

    const upgrade = createRuntime({
        fetch: async () => jsonResponse({ contractVersion: 1, minimumDesktopVersion: '0.5.1', status: 'manual_upgrade_required' }),
    })

    await expect(upgrade.runtime.start()).resolves.toBe('started')
    expect(upgrade.workspace.showCalls).toBe(0)
    expect(upgrade.recoveryStates).toContainEqual(
        expect.objectContaining({ kind: 'manual_upgrade_required', minimumDesktopVersion: '0.5.1' })
    )
})

test('maps invalid contracts and secure network failures to local recovery without creating a workspace', async () => {
    const cases = [
        {
            errorCode: 'COMPATIBILITY_CONTRACT_INVALID',
            fetch: async () => jsonResponse({ contractVersion: 1, minimumDesktopVersion: '0.5.0', status: 'manual_upgrade_required' }),
        },
        {
            errorCode: 'COMPATIBILITY_CONTRACT_INVALID',
            fetch: async () => jsonResponse({ contractVersion: 1, status: 'compatible', unexpected: true }),
        },
        {
            errorCode: 'COMPATIBILITY_HTTP_FAILED',
            fetch: async () => jsonResponse({ error: 'unavailable' }, 503),
        },
        {
            errorCode: 'TLS_VALIDATION_FAILED',
            fetch: async () => {
                throw new Error('net::ERR_CERT_AUTHORITY_INVALID')
            },
        },
        {
            errorCode: 'NETWORK_UNAVAILABLE',
            fetch: async () => {
                throw new Error('net::ERR_NAME_NOT_RESOLVED')
            },
        },
    ]

    for (const scenario of cases) {
        const runtime = createRuntime({ fetch: scenario.fetch })

        await expect(runtime.runtime.start()).resolves.toBe('started')
        expect(runtime.workspace.showCalls).toBe(0)
        expect(runtime.recoveryStates).toContainEqual(expect.objectContaining({ errorCode: scenario.errorCode }))
    }
})

test('fails closed for an expired workspace load and falls back to native safe recovery when local recovery cannot boot', async () => {
    let now = 0
    const timedOut = createRuntime({
        fetch: async () => jsonResponse({ contractVersion: 1, status: 'compatible' }),
        loadWorkspace: async () => {
            now = 5_000
        },
        now: () => now,
    })

    await expect(timedOut.runtime.start()).resolves.toBe('started')
    expect(timedOut.workspace.destroyCalls).toBe(1)
    expect(timedOut.recoveryStates).toContainEqual(expect.objectContaining({ errorCode: 'WORKSPACE_LOAD_TIMEOUT' }))

    const localFailure = createDesktopHostRuntime({
        config: createConfig(),
        createRecoveryWindow: () => {
            throw new Error('recovery unavailable')
        },
        createWorkspaceWindow: () => ({ destroy: () => undefined, loadURL: async () => undefined, show: () => undefined }),
        showNativeSafeDialog: code => {
            expect(code).toBe('LOCAL_RECOVERY_UNAVAILABLE')
        },
        updateRecoveryWindow: () => undefined,
        workspaceSession: {
            clearData: async () => undefined,
            fetch: async () => jsonResponse({ error: 'offline' }, 503),
        },
    })

    await expect(localFailure.start()).resolves.toBe('started')
})

test('lets the native safe dialog either terminate or retry after local recovery bootstrap failure', async () => {
    let exitCalls = 0
    const exitRuntime = createDesktopHostRuntime({
        config: createConfig(),
        createRecoveryWindow: () => {
            throw new Error('recovery unavailable')
        },
        createWorkspaceWindow: () => ({ destroy: () => undefined, loadURL: async () => undefined, show: () => undefined }),
        exitApplication: () => {
            exitCalls += 1
        },
        showNativeSafeDialog: (): 'exit' => 'exit',
        updateRecoveryWindow: () => undefined,
        workspaceSession: {
            clearData: async () => undefined,
            fetch: async () => jsonResponse({ error: 'offline' }, 503),
        },
    })

    await expect(exitRuntime.start()).resolves.toBe('started')
    expect(exitCalls).toBe(1)

    let recoveryAttempts = 0
    let workspaceShowCalls = 0
    const retryWorkspace = {
        destroy: () => undefined,
        loadURL: async () => undefined,
        show: () => {
            workspaceShowCalls += 1
        },
    }
    let fetchCalls = 0
    const retryRuntime = createDesktopHostRuntime({
        config: createConfig(),
        createRecoveryWindow: () => {
            recoveryAttempts += 1
            throw new Error('recovery unavailable')
        },
        createWorkspaceWindow: () => retryWorkspace,
        showNativeSafeDialog: async (): Promise<'exit' | 'retry'> => (recoveryAttempts === 1 ? 'retry' : 'exit'),
        updateRecoveryWindow: () => undefined,
        workspaceSession: {
            clearData: async () => undefined,
            fetch: async () => {
                fetchCalls += 1

                return fetchCalls === 1
                    ? jsonResponse({ error: 'offline' }, 503)
                    : jsonResponse({ contractVersion: 1, status: 'compatible' })
            },
        },
    })

    await expect(retryRuntime.start()).resolves.toBe('started')
    expect(workspaceShowCalls).toBe(1)
})

test('shows local recovery when the local desktop chrome cannot boot before workspace admission', async () => {
    const recoveryStates: RecoveryViewState[] = []
    const runtime = createDesktopHostRuntime({
        config: createConfig(),
        createRecoveryWindow: state => {
            recoveryStates.push(state)
            return { show: () => undefined }
        },
        createWorkspaceWindow: async () => {
            throw new Error('desktop chrome unavailable')
        },
        showNativeSafeDialog: () => 'exit',
        updateRecoveryWindow: (_window, state) => recoveryStates.push(state),
        workspaceSession: {
            clearData: async () => undefined,
            fetch: async () => jsonResponse({ contractVersion: 1, status: 'compatible' }),
        },
    })

    await expect(runtime.start()).resolves.toBe('started')
    expect(recoveryStates).toContainEqual(expect.objectContaining({ errorCode: 'WORKSPACE_LOAD_FAILED' }))
})
