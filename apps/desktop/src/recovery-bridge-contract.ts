export const recoveryBridgeChannels = {
    confirmResetProfile: 'ai-mind-desktop:recovery:confirm-reset-profile',
    copyDiagnostic: 'ai-mind-desktop:recovery:copy-diagnostic',
    exportDiagnostic: 'ai-mind-desktop:recovery:export-diagnostic',
    retry: 'ai-mind-desktop:recovery:retry',
} as const

export type RecoveryActionResult =
    | 'already_in_progress'
    | 'cancelled'
    | 'copied'
    | 'denied'
    | 'failed'
    | 'invalid_request'
    | 'saved'
    | 'started'

export type RecoveryViewState = {
    currentDesktopVersion: string
    errorCode?:
        | 'COMPATIBILITY_CONTRACT_INVALID'
        | 'COMPATIBILITY_HTTP_FAILED'
        | 'COMPATIBILITY_TIMEOUT'
        | 'LOCAL_RECOVERY_UNAVAILABLE'
        | 'NETWORK_UNAVAILABLE'
        | 'PROFILE_UNAVAILABLE'
        | 'TLS_VALIDATION_FAILED'
        | 'WORKSPACE_LOAD_FAILED'
        | 'WORKSPACE_LOAD_TIMEOUT'
    kind: 'manual_upgrade_required' | 'unavailable'
    minimumDesktopVersion?: string
}

export type RecoveryBridgeApi = {
    confirmResetProfile: (input: { confirmed: true }) => Promise<RecoveryActionResult>
    copyDiagnostic: () => Promise<RecoveryActionResult>
    exportDiagnostic: () => Promise<RecoveryActionResult>
    retry: () => Promise<RecoveryActionResult>
}

export const RECOVERY_STATE_CHANNEL = 'ai-mind-desktop:recovery:state'
