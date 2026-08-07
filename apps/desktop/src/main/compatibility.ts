import type { DesktopBuildConfig } from './build-config'
import type { DesktopAttempt } from './host-state'

const compatibilityAccept = 'application/vnd.ai-mind.desktop-compatibility+json; version=1'

export type DesktopCompatibilityCheckResult =
    | {
          attemptId: number
          kind: 'compatible'
      }
    | {
          attemptId: number
          kind: 'manual_upgrade_required'
          minimumDesktopVersion: string
      }
    | {
          attemptId: number
          errorCode:
              | 'COMPATIBILITY_CONTRACT_INVALID'
              | 'COMPATIBILITY_HTTP_FAILED'
              | 'COMPATIBILITY_TIMEOUT'
              | 'NETWORK_UNAVAILABLE'
              | 'TLS_VALIDATION_FAILED'
          kind: 'unavailable'
      }

type CompatibilitySession = Pick<Electron.Session, 'fetch'>

type ParsedSemver = {
    major: number
    minor: number
    patch: number
    prerelease: string[]
}

const strictSemverPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|(?=[0-9A-Za-z-]*[A-Za-z-])[0-9A-Za-z-]+)(?:\.(?:0|[1-9]\d*|(?=[0-9A-Za-z-]*[A-Za-z-])[0-9A-Za-z-]+))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

export async function checkDesktopCompatibility(input: {
    attempt: DesktopAttempt
    config: DesktopBuildConfig
    now?: () => number
    session: CompatibilitySession
}): Promise<DesktopCompatibilityCheckResult> {
    const now = input.now ?? Date.now
    const remainingDeadlineMs = input.attempt.deadlineAt - now()

    if (remainingDeadlineMs <= 0) {
        return unavailable(input.attempt.attemptId, 'COMPATIBILITY_TIMEOUT')
    }

    const signal = AbortSignal.timeout(remainingDeadlineMs)
    let response: Response

    try {
        response = await input.session.fetch(new URL(input.config.compatibilityPath, input.config.trustedOrigin).toString(), {
            credentials: 'omit',
            headers: {
                accept: compatibilityAccept,
                'x-ai-mind-desktop-version': input.config.desktopVersion,
            },
            method: 'GET',
            signal,
        })
    } catch (error) {
        return unavailable(input.attempt.attemptId, resolveFetchErrorCode(error, signal))
    }

    if (now() >= input.attempt.deadlineAt) {
        return unavailable(input.attempt.attemptId, 'COMPATIBILITY_TIMEOUT')
    }

    if (response.status !== 200) {
        return unavailable(input.attempt.attemptId, 'COMPATIBILITY_HTTP_FAILED')
    }

    if (response.headers.get('content-type') !== 'application/json') {
        return unavailable(input.attempt.attemptId, 'COMPATIBILITY_CONTRACT_INVALID')
    }

    let body: unknown

    try {
        body = await response.json()
    } catch {
        return unavailable(input.attempt.attemptId, 'COMPATIBILITY_CONTRACT_INVALID')
    }

    if (now() >= input.attempt.deadlineAt) {
        return unavailable(input.attempt.attemptId, 'COMPATIBILITY_TIMEOUT')
    }

    return parseCompatibilityResponse(input.attempt.attemptId, input.config, body)
}

function parseCompatibilityResponse(attemptId: number, config: DesktopBuildConfig, body: unknown): DesktopCompatibilityCheckResult {
    if (!isRecord(body) || body.contractVersion !== config.compatibilityContractVersion) {
        return unavailable(attemptId, 'COMPATIBILITY_CONTRACT_INVALID')
    }

    if (body.status === 'compatible' && hasOnlyKeys(body, ['contractVersion', 'status'])) {
        return { attemptId, kind: 'compatible' }
    }

    if (
        body.status === 'manual_upgrade_required' &&
        typeof body.minimumDesktopVersion === 'string' &&
        hasOnlyKeys(body, ['contractVersion', 'minimumDesktopVersion', 'status'])
    ) {
        const currentVersion = parseStrictSemver(config.desktopVersion)
        const minimumVersion = parseStrictSemver(body.minimumDesktopVersion)

        if (currentVersion && minimumVersion && compareSemver(minimumVersion, currentVersion) > 0) {
            return {
                attemptId,
                kind: 'manual_upgrade_required',
                minimumDesktopVersion: body.minimumDesktopVersion,
            }
        }
    }

    return unavailable(attemptId, 'COMPATIBILITY_CONTRACT_INVALID')
}

function unavailable(
    attemptId: number,
    errorCode: Extract<DesktopCompatibilityCheckResult, { kind: 'unavailable' }>['errorCode']
): DesktopCompatibilityCheckResult {
    return { attemptId, errorCode, kind: 'unavailable' }
}

function resolveFetchErrorCode(
    error: unknown,
    signal: AbortSignal
): Extract<DesktopCompatibilityCheckResult, { kind: 'unavailable' }>['errorCode'] {
    if (signal.aborted || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
        return 'COMPATIBILITY_TIMEOUT'
    }

    if (error instanceof Error && /(?:ERR_CERT|CERTIFICATE|SSL|TLS)/iu.test(error.message)) {
        return 'TLS_VALIDATION_FAILED'
    }

    return 'NETWORK_UNAVAILABLE'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
    return Object.keys(value).every(key => allowedKeys.includes(key)) && Object.keys(value).length === allowedKeys.length
}

function parseStrictSemver(version: string): ParsedSemver | undefined {
    const match = strictSemverPattern.exec(version)

    if (!match) {
        return undefined
    }

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4]?.split('.') ?? [],
    }
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
    for (const field of ['major', 'minor', 'patch'] as const) {
        if (left[field] !== right[field]) {
            return left[field] - right[field]
        }
    }

    if (left.prerelease.length === 0 && right.prerelease.length === 0) {
        return 0
    }

    if (left.prerelease.length === 0) {
        return 1
    }

    if (right.prerelease.length === 0) {
        return -1
    }

    for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
        const leftIdentifier = left.prerelease[index]
        const rightIdentifier = right.prerelease[index]

        if (leftIdentifier === undefined || rightIdentifier === undefined) {
            return leftIdentifier === undefined ? -1 : 1
        }

        if (leftIdentifier === rightIdentifier) {
            continue
        }

        const leftIsNumeric = /^\d+$/u.test(leftIdentifier)
        const rightIsNumeric = /^\d+$/u.test(rightIdentifier)

        if (leftIsNumeric && rightIsNumeric) {
            return Number(leftIdentifier) - Number(rightIdentifier)
        }

        if (leftIsNumeric || rightIsNumeric) {
            return leftIsNumeric ? -1 : 1
        }

        return leftIdentifier < rightIdentifier ? -1 : 1
    }

    return 0
}
