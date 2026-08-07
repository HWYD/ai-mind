import { contextBridge, ipcRenderer } from 'electron'

import { RECOVERY_STATE_CHANNEL, type RecoveryBridgeApi, recoveryBridgeChannels, type RecoveryViewState } from '../recovery-bridge-contract'

const recoveryApi: RecoveryBridgeApi = {
    confirmResetProfile: input => ipcRenderer.invoke(recoveryBridgeChannels.confirmResetProfile, input),
    copyDiagnostic: () => ipcRenderer.invoke(recoveryBridgeChannels.copyDiagnostic),
    exportDiagnostic: () => ipcRenderer.invoke(recoveryBridgeChannels.exportDiagnostic),
    retry: () => ipcRenderer.invoke(recoveryBridgeChannels.retry),
}

contextBridge.exposeInMainWorld('aiMindRecovery', recoveryApi)

ipcRenderer.on(RECOVERY_STATE_CHANNEL, (_event, state: RecoveryViewState) => {
    window.dispatchEvent(new CustomEvent('ai-mind-recovery-state', { detail: state }))
})
