import { describe, expect, it, vi } from 'vitest'

import {
    clearWorkspaceProfile,
    createDesktopSessions,
    DESKTOP_USER_DATA_DIRECTORY,
    RECOVERY_SESSION_PARTITION,
    resolveDesktopUserDataPath,
    WORKSPACE_SESSION_PARTITION,
} from '../../src/main/session-profile'

describe('desktop session profiles', () => {
    it('creates a stable persistent workspace session and an isolated memory recovery session', () => {
        const fromPartition = vi.fn(partition => ({ partition }))

        const profiles = createDesktopSessions(fromPartition)

        expect(fromPartition).toHaveBeenNthCalledWith(1, WORKSPACE_SESSION_PARTITION)
        expect(fromPartition).toHaveBeenNthCalledWith(2, RECOVERY_SESSION_PARTITION)
        expect(WORKSPACE_SESSION_PARTITION).toBe('persist:ai-mind-desktop')
        expect(RECOVERY_SESSION_PARTITION).not.toMatch(/^persist:/u)
        expect(profiles.workspaceSession).not.toBe(profiles.recoverySession)
    })

    it('clears only declared browser data for the trusted origin', async () => {
        const clearData = vi.fn().mockResolvedValue(undefined)

        await clearWorkspaceProfile({ clearData }, 'https://ai.hwyblog.cloud')

        expect(clearData).toHaveBeenCalledWith({
            dataTypes: ['cache', 'cookies', 'downloads', 'fileSystems', 'indexedDB', 'localStorage', 'serviceWorkers', 'webSQL'],
            origins: ['https://ai.hwyblog.cloud'],
        })
    })

    it('derives one stable absolute userData directory for Windows and POSIX profiles', () => {
        expect(DESKTOP_USER_DATA_DIRECTORY).toBe('cloud.hwyblog.ai-mind.desktop')
        expect(resolveDesktopUserDataPath('C:\\Users\\Ada\\AppData\\Roaming')).toBe(
            'C:\\Users\\Ada\\AppData\\Roaming\\cloud.hwyblog.ai-mind.desktop'
        )
        expect(resolveDesktopUserDataPath('C:\\Users\\Bo\\AppData\\Roaming')).not.toBe(
            resolveDesktopUserDataPath('C:\\Users\\Ada\\AppData\\Roaming')
        )
        expect(resolveDesktopUserDataPath('/Users/Ada/Library/Application Support')).toBe(
            '/Users/Ada/Library/Application Support/cloud.hwyblog.ai-mind.desktop'
        )
        expect(resolveDesktopUserDataPath('/tmp/ai-mind-desktop/app-data')).toBe(
            '/tmp/ai-mind-desktop/app-data/cloud.hwyblog.ai-mind.desktop'
        )
        expect(() => resolveDesktopUserDataPath('relative/app-data')).toThrow('Desktop appData path must be absolute.')
    })
})
