/**
 * Capability 模块统一导出入口。
 * 业务层只应通过这里读取类型与查询函数，避免跨文件直接耦合内部实现细节。
 */
export {
    getActiveChatCapabilityDefinitions,
    getChatCapabilityDefinitionById,
    getChatCapabilityDefinitions,
    toCapabilityDefinition,
} from './catalog'
export { buildCapabilityId } from './id'
export type {
    CapabilityAvailability,
    CapabilityDefinition,
    CapabilityIdentity,
    CapabilityLocation,
    CapabilityProviderKind,
    CapabilityType,
} from './types'
