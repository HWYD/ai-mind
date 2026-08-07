export type DesktopHostPhase = 'bootstrapping' | 'checking_compatibility' | 'loading_workspace' | 'recovery' | 'workspace_ready'

export type DesktopHostSnapshot = {
    activeWindow: 'recovery' | 'workspace' | null
    attemptId: number
    deadlineAt: number
    phase: DesktopHostPhase
}

export type DesktopAttempt = Pick<DesktopHostSnapshot, 'attemptId' | 'deadlineAt'>

const attemptDeadlineMs = 5_000

export class DesktopHostStateMachine {
    #snapshot: DesktopHostSnapshot

    constructor(startedAt: number) {
        this.#snapshot = {
            activeWindow: null,
            attemptId: 0,
            deadlineAt: startedAt,
            phase: 'bootstrapping',
        }
    }

    get snapshot(): DesktopHostSnapshot {
        return { ...this.#snapshot }
    }

    startCompatibilityCheck(startedAt: number): DesktopAttempt {
        const attempt = {
            attemptId: this.#snapshot.attemptId + 1,
            deadlineAt: startedAt + attemptDeadlineMs,
        }

        this.#snapshot = {
            ...this.#snapshot,
            ...attempt,
            phase: 'checking_compatibility',
        }

        return attempt
    }

    canApplyAttempt(attemptId: number, now: number): boolean {
        return this.#snapshot.attemptId === attemptId && now < this.#snapshot.deadlineAt
    }

    enterRecovery(attemptId: number, now: number): boolean {
        if (!this.canApplyAttempt(attemptId, now)) {
            return false
        }

        this.#snapshot = {
            ...this.#snapshot,
            activeWindow: 'recovery',
            phase: 'recovery',
        }

        return true
    }

    enterRecoveryForCurrentAttempt(attemptId: number): boolean {
        if (this.#snapshot.attemptId !== attemptId) {
            return false
        }

        this.#snapshot = {
            ...this.#snapshot,
            activeWindow: 'recovery',
            phase: 'recovery',
        }

        return true
    }

    beginWorkspaceLoad(attemptId: number, now: number): boolean {
        if (!this.canApplyAttempt(attemptId, now)) {
            return false
        }

        this.#snapshot = {
            ...this.#snapshot,
            activeWindow: 'workspace',
            phase: 'loading_workspace',
        }

        return true
    }

    enterWorkspaceReady(attemptId: number, now: number): boolean {
        if (!this.canApplyAttempt(attemptId, now)) {
            return false
        }

        this.#snapshot = {
            ...this.#snapshot,
            activeWindow: 'workspace',
            phase: 'workspace_ready',
        }

        return true
    }

    invalidateAttempt(): void {
        this.#snapshot = {
            ...this.#snapshot,
            attemptId: this.#snapshot.attemptId + 1,
            deadlineAt: 0,
        }
    }
}
