import type {
    CallToolResult,
    ClientCapabilities,
    GetPromptResult,
    Implementation,
    ListPromptsResult,
    ListResourcesResult,
    ListToolsResult,
    ReadResourceResult,
    ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js'

/**
 * MCP 协议层公共类型定义。
 * 该文件负责统一 server 定义、client 返回结构与 host 默认配置。
 */
export type MCPServerId = 'project-assistant-service' | 'project-docs-server' | 'weather-server'

export type MCPTransportKind = 'stdio' | 'streamable-http'
export type MCPProviderKind = 'mcp'
export type MCPServerLocation = 'local' | 'remote'

export type MCPConnectionState = 'closed' | 'connecting' | 'error' | 'idle' | 'ready'

export interface MCPServerCapabilityFlags {
    prompts: boolean
    resources: boolean
    tools: boolean
}

/**
 * MCP Host 的默认超时配置。
 * 使用分场景超时，避免长请求拖慢整个聊天主链。
 */
export interface MCPClientTimeoutConfig {
    closeMs: number
    initializeMs: number
    listMs: number
    requestMs: number
}

export interface MCPNoAuthConfig {
    type: 'none'
}

export interface MCPBearerTokenAuthConfig {
    type: 'bearer-token'
    token?: string
    tokenEnv?: string
    requireExplicitTokenInProduction?: boolean
    headerName?: string
}

export type MCPAuthConfig = MCPBearerTokenAuthConfig | MCPNoAuthConfig

/**
 * server definition 基础字段。
 * 不区分本地/远端 transport，统一能力与来源描述。
 */
interface MCPBaseServerDefinition {
    auth?: MCPAuthConfig
    capabilities: MCPServerCapabilityFlags
    displayName: string
    location: MCPServerLocation
    providerKind: MCPProviderKind
    serverId: MCPServerId
}

export interface MCPStdioServerDefinition extends MCPBaseServerDefinition {
    args: string[]
    command: string
    cwd: string
    env?: Record<string, string>
    stderr?: 'ignore' | 'inherit' | 'pipe'
    transport: 'stdio'
}

export interface MCPStreamableHttpServerDefinition extends MCPBaseServerDefinition {
    baseUrl: string
    headers?: Record<string, string>
    timeoutMs?: number
    transport: 'streamable-http'
}

export type MCPServerDefinition = MCPStdioServerDefinition | MCPStreamableHttpServerDefinition

/**
 * Tool adapter 对外消费的标准结果结构。
 */
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

/**
 * Prompt adapter 对外消费的标准结果结构。
 */
export interface MCPPromptAdapterResult {
    description?: string
    messages: GetPromptResult['messages']
    promptName: string
    serverId: MCPServerId
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

/**
 * MCP prompts/list 响应的 Host 层收敛结果。
 */
export interface MCPListPromptsResult {
    prompts: ListPromptsResult['prompts']
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

/**
 * MCP prompts/get 响应的 Host 层收敛结果。
 */
export interface MCPGetPromptResponse {
    result: GetPromptResult
    serverDefinition: MCPServerDefinition
}

export function isMCPStdioServerDefinition(serverDefinition: MCPServerDefinition): serverDefinition is MCPStdioServerDefinition {
    return serverDefinition.transport === 'stdio'
}

export function isMCPStreamableHttpServerDefinition(
    serverDefinition: MCPServerDefinition
): serverDefinition is MCPStreamableHttpServerDefinition {
    return serverDefinition.transport === 'streamable-http'
}

/**
 * MCP Client 的固定身份信息。
 */
export const MCP_CLIENT_INFO: Implementation = {
    name: 'ai-mind-mcp-host',
    version: '0.1.1',
}

export const MCP_CLIENT_CAPABILITIES: ClientCapabilities = {}

/**
 * 当前 Host 默认超时策略（毫秒）。
 */
export const MCP_CLIENT_TIMEOUTS: MCPClientTimeoutConfig = {
    closeMs: 2000,
    initializeMs: 5000,
    listMs: 5000,
    requestMs: 15000,
}
