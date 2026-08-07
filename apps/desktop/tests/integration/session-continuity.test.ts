import { expect, test } from '@playwright/test'

import {
    createDesktopSessions,
    RECOVERY_SESSION_PARTITION,
    resolveDesktopUserDataPath,
    WORKSPACE_SESSION_PARTITION,
} from '../../src/main/session-profile'

type FakeSession = {
    cookieJar: Map<string, string>
    partition: string
}

test.describe('desktop session continuity boundaries', () => {
    test('reuses the same workspace partition across close and reopen while isolating recovery', () => {
        const sessions = new Map<string, FakeSession>()
        const fromPartition = (partition: string) => {
            const existing = sessions.get(partition)
            if (existing) {
                return existing
            }

            const created = { cookieJar: new Map<string, string>(), partition }
            sessions.set(partition, created)
            return created
        }

        const firstLaunch = createDesktopSessions(fromPartition)
        firstLaunch.workspaceSession.cookieJar.set('ai-mind-session-id', 'server-session-a')
        const secondLaunch = createDesktopSessions(fromPartition)

        expect(secondLaunch.workspaceSession).toBe(firstLaunch.workspaceSession)
        expect(secondLaunch.workspaceSession.cookieJar.get('ai-mind-session-id')).toBe('server-session-a')
        expect(secondLaunch.recoverySession).not.toBe(firstLaunch.workspaceSession)
        expect(secondLaunch.recoverySession.partition).toBe(RECOVERY_SESSION_PARTITION)
        expect(firstLaunch.workspaceSession.partition).toBe(WORKSPACE_SESSION_PARTITION)
    })

    test('keeps different Windows user appData roots from sharing a profile', () => {
        const ada = resolveDesktopUserDataPath('C:\\Users\\Ada\\AppData\\Roaming')
        const bo = resolveDesktopUserDataPath('C:\\Users\\Bo\\AppData\\Roaming')

        expect(ada).not.toBe(bo)
        expect(ada).toContain('cloud.hwyblog.ai-mind.desktop')
        expect(bo).toContain('cloud.hwyblog.ai-mind.desktop')
    })

    test('does not create a client-side identity when the server rejects a cookie', () => {
        const server = {
            deletedSessions: [] as string[],
            resolve(cookie: string | undefined) {
                return cookie === 'expired-session' ? 'new-server-session' : cookie
            },
        }

        const rejectedCookie = 'expired-session'
        expect(server.resolve(rejectedCookie)).toBe('new-server-session')
        expect(server.deletedSessions).toEqual([])
    })
})
