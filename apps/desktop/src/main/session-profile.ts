import path from 'node:path'

import type { ClearDataOptions } from 'electron'

import { DESKTOP_PRODUCT_ID } from './build-config'

export const WORKSPACE_SESSION_PARTITION = 'persist:ai-mind-desktop'
export const RECOVERY_SESSION_PARTITION = 'ai-mind-desktop-recovery'
export const DESKTOP_USER_DATA_DIRECTORY = DESKTOP_PRODUCT_ID

export function resolveDesktopUserDataPath(appDataPath: string): string {
    const pathApi = path.win32.isAbsolute(appDataPath) ? path.win32 : path

    return pathApi.join(appDataPath, DESKTOP_USER_DATA_DIRECTORY)
}

const workspaceDataTypes: NonNullable<ClearDataOptions['dataTypes']> = [
    'cache',
    'cookies',
    'downloads',
    'fileSystems',
    'indexedDB',
    'localStorage',
    'serviceWorkers',
    'webSQL',
]

type SessionWithClearData = Pick<Electron.Session, 'clearData'>

export type ProfileResetResult = 'already_in_progress' | 'completed' | 'failed'

export function createDesktopSessions<Session>(fromPartition: (partition: string) => Session): {
    recoverySession: Session
    workspaceSession: Session
} {
    return {
        workspaceSession: fromPartition(WORKSPACE_SESSION_PARTITION),
        recoverySession: fromPartition(RECOVERY_SESSION_PARTITION),
    }
}

export function clearWorkspaceProfile(session: SessionWithClearData, trustedOrigin: string): Promise<void> {
    return session.clearData({
        dataTypes: workspaceDataTypes,
        origins: [trustedOrigin],
    })
}

export function createConfirmedProfileReset(input: {
    destroyWorkspace: () => void
    invalidateAttempt: () => void
    restartCompatibilityCheck: () => Promise<unknown>
    session: SessionWithClearData
    trustedOrigin: string
}): { isInProgress: () => boolean; reset: () => Promise<ProfileResetResult> } {
    let inProgress = false

    return {
        isInProgress: () => inProgress,
        reset: async () => {
            if (inProgress) {
                return 'already_in_progress'
            }

            inProgress = true
            input.invalidateAttempt()
            input.destroyWorkspace()
            let result: ProfileResetResult = 'completed'

            try {
                await clearWorkspaceProfile(input.session, input.trustedOrigin)
            } catch {
                result = 'failed'
            }

            try {
                await input.restartCompatibilityCheck()
            } catch {
                result = 'failed'
            } finally {
                inProgress = false
            }

            return result
        },
    }
}
