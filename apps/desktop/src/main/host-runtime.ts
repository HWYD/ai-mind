import type { RecoveryViewState } from '../recovery-bridge-contract'
import type { DesktopBuildConfig } from './build-config'
import { checkDesktopCompatibility, type DesktopCompatibilityCheckResult } from './compatibility'
import { type DesktopHostSnapshot, DesktopHostStateMachine } from './host-state'
import { createConfirmedProfileReset, type ProfileResetResult } from './session-profile'

type WorkspaceWindow = {
    destroy: () => void
    focus?: () => void
    loadURL: (url: string) => Promise<unknown>
    show: () => void
}

type RecoveryWindow = {
    focus?: () => void
    show: () => void
}

type HostRuntimeResult = 'already_in_progress' | 'failed' | 'started'
type NativeSafeDialogAction = 'exit' | 'retry'

export function getDesktopWorkspaceUrl(trustedOrigin: string): string {
    return new URL('/instant-mind', trustedOrigin).toString()
}

export function createDesktopHostRuntime(input: {
    config: DesktopBuildConfig
    createRecoveryWindow: (state: RecoveryViewState) => RecoveryWindow | Promise<RecoveryWindow>
    createWorkspaceWindow: () => WorkspaceWindow | Promise<WorkspaceWindow>
    exitApplication?: () => void
    observeWorkspaceWindow?: (window: WorkspaceWindow, handlers: { closed: () => void; renderProcessGone: () => void }) => void
    now?: () => number
    showNativeSafeDialog: (code: 'LOCAL_RECOVERY_UNAVAILABLE') => NativeSafeDialogAction | Promise<NativeSafeDialogAction> | void
    updateRecoveryWindow: (window: RecoveryWindow, state: RecoveryViewState) => void
    workspaceSession: Pick<Electron.Session, 'clearData' | 'fetch'>
}): {
    focusActiveWindow: () => void
    getState: () => DesktopHostSnapshot
    handleRenderProcessGone: (window?: WorkspaceWindow) => void
    handleSuspend: () => void
    handleResume: () => void
    handleWorkspaceClosed: (window?: WorkspaceWindow) => void
    resetProfile: () => Promise<'failed' | 'started'>
    retry: () => Promise<HostRuntimeResult>
    start: () => Promise<HostRuntimeResult>
} {
    const now = input.now ?? Date.now
    const hostState = new DesktopHostStateMachine(now())
    const activeAttempts = new Set<number>()
    let recoveryWindow: RecoveryWindow | undefined
    let workspaceWindow: WorkspaceWindow | undefined
    let recoveryState: RecoveryViewState | undefined

    const showRecovery = async (state: RecoveryViewState): Promise<void> => {
        if (!hostState.enterRecoveryForCurrentAttempt(hostState.snapshot.attemptId)) {
            return
        }

        recoveryState = state
        workspaceWindow?.destroy()
        workspaceWindow = undefined

        try {
            recoveryWindow ??= await input.createRecoveryWindow(state)
            input.updateRecoveryWindow(recoveryWindow, state)
            recoveryWindow.show()
        } catch {
            const action = await input.showNativeSafeDialog('LOCAL_RECOVERY_UNAVAILABLE')

            if (action === 'retry') {
                await runAttempt(true)
                return
            }

            input.exitApplication?.()
        }
    }

    const showResultRecovery = async (
        attemptId: number,
        result: Exclude<DesktopCompatibilityCheckResult, { kind: 'compatible' }>
    ): Promise<void> => {
        if (!hostState.enterRecoveryForCurrentAttempt(attemptId)) {
            return
        }

        if (result.kind === 'manual_upgrade_required') {
            await showRecovery({
                currentDesktopVersion: input.config.desktopVersion,
                kind: result.kind,
                minimumDesktopVersion: result.minimumDesktopVersion,
            })
            return
        }

        await showRecovery({
            currentDesktopVersion: input.config.desktopVersion,
            errorCode: result.errorCode,
            kind: result.kind,
        })
    }

    const handleWorkspaceClosed = (window?: WorkspaceWindow): void => {
        if (!window || workspaceWindow === window) {
            workspaceWindow = undefined
        }
    }

    const handleRenderProcessGone = (window?: WorkspaceWindow): void => {
        if (window && workspaceWindow !== window) {
            return
        }

        void showRecovery({
            currentDesktopVersion: input.config.desktopVersion,
            errorCode: 'WORKSPACE_LOAD_FAILED',
            kind: 'unavailable',
        })
    }

    const runAttempt = async (force = false): Promise<HostRuntimeResult> => {
        if (!force && activeAttempts.size > 0) {
            return 'already_in_progress'
        }

        const attempt = hostState.startCompatibilityCheck(now())
        activeAttempts.add(attempt.attemptId)

        try {
            const result = await checkDesktopCompatibility({ attempt, config: input.config, now, session: input.workspaceSession })

            if (result.attemptId !== hostState.snapshot.attemptId) {
                return 'started'
            }

            if (result.kind !== 'compatible') {
                await showResultRecovery(attempt.attemptId, result)
                return 'started'
            }

            if (!hostState.beginWorkspaceLoad(attempt.attemptId, now())) {
                return 'started'
            }

            let nextWorkspaceWindow: WorkspaceWindow

            try {
                nextWorkspaceWindow = await input.createWorkspaceWindow()
            } catch {
                await showRecovery({
                    currentDesktopVersion: input.config.desktopVersion,
                    errorCode: 'WORKSPACE_LOAD_FAILED',
                    kind: 'unavailable',
                })
                return 'started'
            }

            workspaceWindow = nextWorkspaceWindow
            input.observeWorkspaceWindow?.(nextWorkspaceWindow, {
                closed: () => handleWorkspaceClosed(nextWorkspaceWindow),
                renderProcessGone: () => handleRenderProcessGone(nextWorkspaceWindow),
            })

            try {
                await nextWorkspaceWindow.loadURL(getDesktopWorkspaceUrl(input.config.trustedOrigin))
            } catch {
                await showRecovery({
                    currentDesktopVersion: input.config.desktopVersion,
                    errorCode: 'WORKSPACE_LOAD_FAILED',
                    kind: 'unavailable',
                })
                return 'started'
            }

            if (!hostState.enterWorkspaceReady(attempt.attemptId, now())) {
                await showRecovery({
                    currentDesktopVersion: input.config.desktopVersion,
                    errorCode: 'WORKSPACE_LOAD_TIMEOUT',
                    kind: 'unavailable',
                })
                return 'started'
            }

            nextWorkspaceWindow.show()
            return 'started'
        } catch {
            if (attempt.attemptId === hostState.snapshot.attemptId) {
                await showRecovery({
                    currentDesktopVersion: input.config.desktopVersion,
                    errorCode: 'NETWORK_UNAVAILABLE',
                    kind: 'unavailable',
                })
            }

            return 'failed'
        } finally {
            activeAttempts.delete(attempt.attemptId)
        }
    }

    const profileReset = createConfirmedProfileReset({
        destroyWorkspace: () => {
            workspaceWindow?.destroy()
            workspaceWindow = undefined
        },
        invalidateAttempt: () => hostState.invalidateAttempt(),
        restartCompatibilityCheck: () => runAttempt(true),
        session: input.workspaceSession,
        trustedOrigin: input.config.trustedOrigin,
    })

    return {
        focusActiveWindow: () => {
            if (profileReset.isInProgress()) {
                recoveryWindow?.focus?.()
                return
            }

            if (hostState.snapshot.activeWindow === 'workspace') {
                workspaceWindow?.focus?.()
                return
            }

            recoveryWindow?.focus?.()
        },
        getState: () => hostState.snapshot,
        handleRenderProcessGone,
        handleSuspend: () => undefined,
        handleResume: () => undefined,
        handleWorkspaceClosed,
        resetProfile: async () => {
            const result: ProfileResetResult = await profileReset.reset()

            return result === 'completed' ? 'started' : 'failed'
        },
        retry: () => runAttempt(),
        start: () => runAttempt(),
    }
}
