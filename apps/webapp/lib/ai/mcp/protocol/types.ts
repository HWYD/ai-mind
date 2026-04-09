import type {
    CallToolResult,
    ClientCapabilities,
    Implementation,
    ListResourcesResult,
    ListToolsResult,
    ReadResourceResult,
    ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js'

export type MCPServerId = 'project-files-server' | 'weather-server'

export type MCPConnectionState = 'closed' | 'connecting' | 'error' | 'idle' | 'ready'

export interface MCPServerCapabilityFlags {
    resources: boolean
    tools: boolean
}

export interface MCPClientTimeoutConfig {
    closeMs: number
    initializeMs: number
    listMs: number
    requestMs: number
}

export interface MCPServerDefinition {
    args: string[]
    capabilities: MCPServerCapabilityFlags
    command: string
    cwd: string
    displayName: string
    env?: Record<string, string>
    serverId: MCPServerId
    stderr?: 'ignore' | 'inherit' | 'pipe'
}

export interface MCPToolAdapterResult {
    action?: string
    inputText: string
    outputText: string
    serverId: MCPServerId
    source: 'mcp'
    title?: string
    toolName: string
}

export interface MCPResourceAdapterResult {
    content: string
    contentPreview: string
    previewChars?: number
    mimeType?: string
    resourceName: string
    serverId: MCPServerId
    sizeBytes?: number
    status: 'completed' | 'failed' | 'loading'
    truncated?: boolean
    uri: string
}

export interface MCPInitializeResult {
    clientInfo: Implementation
    serverCapabilities?: ServerCapabilities
    serverDefinition: MCPServerDefinition
    serverInstructions?: string
    serverVersion?: Implementation
}

export interface MCPListToolsResult {
    serverDefinition: MCPServerDefinition
    tools: ListToolsResult['tools']
}

export interface MCPListResourcesResult {
    resources: ListResourcesResult['resources']
    serverDefinition: MCPServerDefinition
}

export interface MCPCallToolResponse {
    result: CallToolResult
    serverDefinition: MCPServerDefinition
}

export interface MCPReadResourceResponse {
    result: ReadResourceResult
    serverDefinition: MCPServerDefinition
}

export const MCP_CLIENT_INFO: Implementation = {
    name: 'ai-mind-mcp-host',
    version: '0.0.9',
}

export const MCP_CLIENT_CAPABILITIES: ClientCapabilities = {}

export const MCP_CLIENT_TIMEOUTS: MCPClientTimeoutConfig = {
    closeMs: 2000,
    initializeMs: 5000,
    listMs: 5000,
    requestMs: 15000,
}
