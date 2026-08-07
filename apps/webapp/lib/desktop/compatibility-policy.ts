export const MINIMUM_SUPPORTED_DESKTOP_VERSION = '0.5.0'

type DesktopCompatibilityResponseV1 =
    | {
          contractVersion: 1
          status: 'compatible'
      }
    | {
          contractVersion: 1
          minimumDesktopVersion: string
          status: 'manual_upgrade_required'
      }

export type DesktopCompatibilityPolicyResult = DesktopCompatibilityResponseV1 | { kind: 'invalid_desktop_version' }

type ParsedSemver = {
    major: number
    minor: number
    patch: number
    prerelease: string[]
}

const strictSemverPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|(?=[0-9A-Za-z-]*[A-Za-z-])[0-9A-Za-z-]+)(?:\.(?:0|[1-9]\d*|(?=[0-9A-Za-z-]*[A-Za-z-])[0-9A-Za-z-]+))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

const minimumSupportedDesktopRelease = parseStrictSemver(MINIMUM_SUPPORTED_DESKTOP_VERSION)

if (!minimumSupportedDesktopRelease) {
    throw new Error('Minimum supported desktop version must be strict semver.')
}

export function resolveDesktopCompatibility(version: string | null | undefined): DesktopCompatibilityPolicyResult {
    const desktopRelease = parseStrictSemver(version)

    if (!desktopRelease) {
        return { kind: 'invalid_desktop_version' }
    }

    if (compareSemver(desktopRelease, minimumSupportedDesktopRelease) < 0) {
        return {
            contractVersion: 1,
            status: 'manual_upgrade_required',
            minimumDesktopVersion: MINIMUM_SUPPORTED_DESKTOP_VERSION,
        }
    }

    return {
        contractVersion: 1,
        status: 'compatible',
    }
}

function parseStrictSemver(version: string | null | undefined): ParsedSemver | undefined {
    if (typeof version !== 'string') {
        return undefined
    }

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
