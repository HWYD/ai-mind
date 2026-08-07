import './styles.css'

import type { RecoveryActionResult } from '../recovery-bridge-contract'

const elements = {
    actionResult: document.querySelector<HTMLOutputElement>('#action-result'),
    copyDiagnostic: document.querySelector<HTMLButtonElement>('#copy-diagnostic'),
    desktopVersion: document.querySelector<HTMLElement>('#desktop-version'),
    exportDiagnostic: document.querySelector<HTMLButtonElement>('#export-diagnostic'),
    minimumVersion: document.querySelector<HTMLElement>('#minimum-version'),
    resetProfile: document.querySelector<HTMLButtonElement>('#reset-profile'),
    retry: document.querySelector<HTMLButtonElement>('#retry'),
    safeErrorCode: document.querySelector<HTMLElement>('#safe-error-code'),
    upgradeInstruction: document.querySelector<HTMLElement>('#upgrade-instruction'),
}

const actionResultLabels: Record<RecoveryActionResult, string> = {
    already_in_progress: '操作正在进行中，请稍候。',
    cancelled: '已取消。',
    copied: '诊断信息已复制。',
    denied: '操作被拒绝。',
    failed: '操作失败，请稍后重试。',
    invalid_request: '请求无效。',
    saved: '诊断信息已导出。',
    started: '已开始处理。',
}

function showResult(result: RecoveryActionResult): void {
    if (elements.actionResult) {
        elements.actionResult.textContent = actionResultLabels[result]
    }
}

elements.retry?.addEventListener('click', async () => {
    showResult(await window.aiMindRecovery.retry())
})

elements.resetProfile?.addEventListener('click', async () => {
    if (!window.confirm('确定要重置受信工作区的本地桌面数据吗？')) {
        showResult('cancelled')
        return
    }

    showResult(await window.aiMindRecovery.confirmResetProfile({ confirmed: true }))
})

elements.copyDiagnostic?.addEventListener('click', async () => {
    showResult(await window.aiMindRecovery.copyDiagnostic())
})

elements.exportDiagnostic?.addEventListener('click', async () => {
    showResult(await window.aiMindRecovery.exportDiagnostic())
})

window.addEventListener('ai-mind-recovery-state', event => {
    const state = (
        event as CustomEvent<{
            currentDesktopVersion: string
            errorCode?: string
            kind: string
            minimumDesktopVersion?: string
        }>
    ).detail

    if (elements.safeErrorCode) {
        elements.safeErrorCode.textContent = state.errorCode ?? state.kind.toUpperCase()
    }
    if (elements.desktopVersion) {
        elements.desktopVersion.textContent = state.currentDesktopVersion
    }
    if (elements.minimumVersion) {
        elements.minimumVersion.textContent = state.minimumDesktopVersion ?? '无需指定'
    }
    if (elements.upgradeInstruction) {
        elements.upgradeInstruction.hidden = state.kind !== 'manual_upgrade_required'
    }
})
