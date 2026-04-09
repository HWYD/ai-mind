import type { MCPServerDefinition, MCPServerId } from '@/lib/ai/mcp/protocol/types'

import { getMcpServerDefinition, MCP_SERVER_DEFINITIONS } from './server-definitions'

export interface MCPServerRegistry {
    get(serverId: MCPServerId): MCPServerDefinition | undefined
    list(): MCPServerDefinition[]
}

export const mcpServerRegistry: MCPServerRegistry = {
    get(serverId) {
        return getMcpServerDefinition(serverId)
    },
    list() {
        return MCP_SERVER_DEFINITIONS
    },
}
