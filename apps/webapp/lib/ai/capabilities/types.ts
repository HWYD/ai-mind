/**
 * v0.0.11 的 capability model 类型定义。
 * 这层只负责描述“能力是什么”，不承载具体执行链路。
 */
export const capabilityTypes = ['prompt', 'resource', 'tool'] as const
export type CapabilityType = (typeof capabilityTypes)[number]

export const capabilityProviderKinds = ['internal', 'mcp'] as const
export type CapabilityProviderKind = (typeof capabilityProviderKinds)[number]

export const capabilityLocations = ['local', 'remote'] as const
export type CapabilityLocation = (typeof capabilityLocations)[number]

export const capabilityAvailabilityStates = ['available', 'disabled', 'timeout', 'unauthorized', 'unreachable'] as const
export type CapabilityAvailability = (typeof capabilityAvailabilityStates)[number]

/**
 * Capability 的身份字段集合，用于构造 capabilityId 和做筛选匹配。
 */
export interface CapabilityIdentity {
    name: string
    capabilityType: CapabilityType
    providerKind: CapabilityProviderKind
    location: CapabilityLocation
    serverId?: string
}

/**
 * Runtime 可消费的统一 capability 描述对象。
 */
export interface CapabilityDefinition extends CapabilityIdentity {
    capabilityId: string
    title: string
    description: string
    availability: CapabilityAvailability
}
