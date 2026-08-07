import type { RecoveryBridgeApi, RecoveryViewState } from '../recovery-bridge-contract'

declare global {
    interface Window {
        aiMindRecovery: RecoveryBridgeApi
    }

    interface WindowEventMap {
        'ai-mind-recovery-state': CustomEvent<RecoveryViewState>
    }
}

export {}
