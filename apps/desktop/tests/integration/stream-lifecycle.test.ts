import { expect, test } from '@playwright/test'

import { createDesktopBuildConfig } from '../../src/main/build-config'
import { createDesktopHostRuntime } from '../../src/main/host-runtime'

function createConfig() {
    return createDesktopBuildConfig({
        desktopVersion: '0.5.0',
        developmentOrigin: 'http://localhost:3000',
        isPackaged: false,
    })
}

test('does not cancel or fabricate stream state when workspace closes, crashes, suspends, resumes, or receives a second instance', async () => {
    const handlers = new Map<string, () => void>()
    const recoveryStates: Array<Record<string, unknown>> = []
    let cancelCalls = 0
    let fetchCalls = 0
    const workspace = {
        destroyCalls: 0,
        focusCalls: 0,
        loadURL: async () => undefined,
        on(event: string, listener: () => void) {
            handlers.set(event, listener)
        },
        show: () => undefined,
        destroy() {
            workspace.destroyCalls += 1
        },
        focus() {
            workspace.focusCalls += 1
        },
    }
    const recovery = { focus: () => undefined, show: () => undefined }
    const runtime = createDesktopHostRuntime({
        config: createConfig(),
        createRecoveryWindow: state => {
            recoveryStates.push(state)
            return recovery
        },
        createWorkspaceWindow: () => workspace,
        observeWorkspaceWindow: (_window, lifecycleHandlers) => {
            handlers.set('closed', lifecycleHandlers.closed)
            handlers.set('render-process-gone', lifecycleHandlers.renderProcessGone)
        },
        showNativeSafeDialog: () => undefined,
        updateRecoveryWindow: (_window, state) => recoveryStates.push(state),
        workspaceSession: {
            clearData: async () => undefined,
            fetch: async () => {
                fetchCalls += 1
                return new Response(JSON.stringify({ contractVersion: 1, status: 'compatible' }), {
                    headers: { 'content-type': 'application/json' },
                })
            },
        },
    })

    await expect(runtime.start()).resolves.toBe('started')
    const initialFetchCalls = fetchCalls
    workspace.on('cancel', () => {
        cancelCalls += 1
    })
    runtime.handleSuspend()
    runtime.handleResume()
    runtime.focusActiveWindow()
    expect(workspace.focusCalls).toBe(1)
    expect(fetchCalls).toBe(initialFetchCalls)

    handlers.get('render-process-gone')?.()
    expect(recoveryStates).toContainEqual(expect.objectContaining({ errorCode: 'WORKSPACE_LOAD_FAILED' }))
    expect(cancelCalls).toBe(0)

    handlers.get('closed')?.()
    runtime.handleSuspend()
    runtime.handleResume()
    expect(fetchCalls).toBe(initialFetchCalls)
    expect(cancelCalls).toBe(0)
})
