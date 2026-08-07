import { type RecoveryActionResult, recoveryBridgeChannels } from '../recovery-bridge-contract'
import { LOCAL_PROTOCOL_SCHEME } from './local-protocol'

type RecoveryWebContents = {
    getURL: () => string
}

type RecoveryIpcMain = {
    handle: (
        channel: string,
        listener: (event: { sender: RecoveryWebContents }, ...args: unknown[]) => Promise<RecoveryActionResult>
    ) => void
}

type RecoveryBridgeAction = () => Promise<RecoveryActionResult>

function isCurrentRecoverySender(event: { sender: RecoveryWebContents }, current: RecoveryWebContents | undefined): boolean {
    if (!current || event.sender !== current) {
        return false
    }

    try {
        const url = new URL(event.sender.getURL())

        return (
            url.protocol === `${LOCAL_PROTOCOL_SCHEME}:` &&
            url.hostname === 'local' &&
            !url.username &&
            !url.password &&
            !url.port &&
            !url.search &&
            !url.hash &&
            (url.pathname === '/' || url.pathname === '/index.html')
        )
    } catch {
        return false
    }
}

function registerAction(input: {
    action: RecoveryBridgeAction
    channel: string
    getRecoveryWebContents: () => RecoveryWebContents | undefined
    ipcMain: RecoveryIpcMain
    validateArgs: (args: unknown[]) => boolean
}): void {
    input.ipcMain.handle(input.channel, async (event, ...args) => {
        if (!isCurrentRecoverySender(event, input.getRecoveryWebContents())) {
            return 'denied'
        }

        if (!input.validateArgs(args)) {
            return 'invalid_request'
        }

        try {
            return await input.action()
        } catch {
            return 'failed'
        }
    })
}

export function installRecoveryBridge(input: {
    copyDiagnostic: RecoveryBridgeAction
    exportDiagnostic: RecoveryBridgeAction
    getRecoveryWebContents: () => RecoveryWebContents | undefined
    ipcMain: RecoveryIpcMain
    resetProfile: RecoveryBridgeAction
    retry: RecoveryBridgeAction
}): void {
    let retryInProgress = false
    let resetInProgress = false

    registerAction({
        action: async () => {
            if (retryInProgress || resetInProgress) {
                return 'already_in_progress'
            }

            retryInProgress = true

            try {
                return await input.retry()
            } finally {
                retryInProgress = false
            }
        },
        channel: recoveryBridgeChannels.retry,
        getRecoveryWebContents: input.getRecoveryWebContents,
        ipcMain: input.ipcMain,
        validateArgs: args => args.length === 0,
    })

    registerAction({
        action: async () => {
            if (resetInProgress) {
                return 'already_in_progress'
            }

            resetInProgress = true

            try {
                return await input.resetProfile()
            } finally {
                resetInProgress = false
            }
        },
        channel: recoveryBridgeChannels.confirmResetProfile,
        getRecoveryWebContents: input.getRecoveryWebContents,
        ipcMain: input.ipcMain,
        validateArgs: args => {
            if (args.length !== 1 || typeof args[0] !== 'object' || args[0] === null || Array.isArray(args[0])) {
                return false
            }

            const value = args[0] as Record<string, unknown>

            return value.confirmed === true && Object.keys(value).length === 1
        },
    })

    registerAction({
        action: input.copyDiagnostic,
        channel: recoveryBridgeChannels.copyDiagnostic,
        getRecoveryWebContents: input.getRecoveryWebContents,
        ipcMain: input.ipcMain,
        validateArgs: args => args.length === 0,
    })

    registerAction({
        action: input.exportDiagnostic,
        channel: recoveryBridgeChannels.exportDiagnostic,
        getRecoveryWebContents: input.getRecoveryWebContents,
        ipcMain: input.ipcMain,
        validateArgs: args => args.length === 0,
    })
}
