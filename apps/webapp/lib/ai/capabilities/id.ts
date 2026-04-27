import type { CapabilityIdentity } from './types'

/**
 * 清理 capabilityId 片段中的首尾空白，避免出现不可见字符导致的 ID 不一致。
 */
function normalizeSegment(value: string) {
    return value.trim()
}

/**
 * 统一构造 capabilityId。
 * 规则：providerKind:location:capabilityType:(serverId):name
 */
export function buildCapabilityId(identity: CapabilityIdentity) {
    const segments: string[] = [identity.providerKind, identity.location, identity.capabilityType]

    if (identity.serverId && normalizeSegment(identity.serverId)) {
        segments.push(normalizeSegment(identity.serverId))
    }

    segments.push(normalizeSegment(identity.name))

    return segments.join(':')
}
