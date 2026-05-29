import { resolve } from 'node:path'

import type { MCPServerDefinition, MCPServerId } from '@/lib/ai/mcp/protocol/types'

/**
 * 把 server 脚本文件名解析成可直接交给 Node 进程启动的绝对路径。
 */
function createServerScriptPath(filename: string) {
    return resolve(process.cwd(), 'lib/ai/mcp/servers', filename)
}

function createProjectAssistantServiceMcpBaseUrl() {
    return process.env.PROJECT_ASSISTANT_SERVICE_MCP_BASE_URL?.trim() || 'http://127.0.0.1:8788/mcp'
}

function createProjectAssistantServiceMcpToken() {
    return process.env.PROJECT_ASSISTANT_SERVICE_MCP_TOKEN?.trim() || 'project-assistant-service-dev-token'
}

/**
 * `project-docs-server` 只暴露 docs/ 项目知识区相关的 Resource 与 Prompt 能力。
 */
const projectDocsServerDefinition: MCPServerDefinition = {
    transport: 'stdio',
    args: [createServerScriptPath('project-docs-server.mjs')],
    capabilities: {
        prompts: true,
        resources: true,
        tools: false,
    },
    command: process.execPath,
    cwd: process.cwd(),
    displayName: '项目文档 MCP Server',
    providerKind: 'mcp',
    location: 'local',
    serverId: 'project-docs-server',
    stderr: 'pipe',
    auth: {
        type: 'none',
    },
}

/**
 * `weather-server` 当前只暴露 Tool 能力。
 */
const weatherServerDefinition: MCPServerDefinition = {
    transport: 'stdio',
    args: [createServerScriptPath('weather-server.mjs')],
    capabilities: {
        prompts: false,
        resources: false,
        tools: true,
    },
    command: process.execPath,
    cwd: process.cwd(),
    displayName: '天气 MCP Server',
    providerKind: 'mcp',
    location: 'local',
    serverId: 'weather-server',
    stderr: 'pipe',
    auth: {
        type: 'none',
    },
}

/**
 * `project-assistant-service` 代表当前 remote MCP 能力来源。
 * 当前通过 Streamable HTTP 接入，先验证单 server 的 Resource / Prompt / Tool 最小闭环。
 */
const projectAssistantServiceDefinition: MCPServerDefinition = {
    transport: 'streamable-http',
    baseUrl: createProjectAssistantServiceMcpBaseUrl(),
    timeoutMs: 15000,
    capabilities: {
        prompts: true,
        resources: true,
        tools: true,
    },
    displayName: 'Project Assistant Service',
    providerKind: 'mcp',
    location: 'remote',
    serverId: 'project-assistant-service',
    auth: {
        type: 'bearer-token',
        token: createProjectAssistantServiceMcpToken(),
        headerName: 'Authorization',
    },
}

/**
 * 所有静态 MCP Server 定义的单一导出入口。
 * 当前版本先固定为数组，后续如果要接配置文件或动态开关，再从这里往外扩。
 */
export const MCP_SERVER_DEFINITIONS: MCPServerDefinition[] = [
    weatherServerDefinition,
    projectDocsServerDefinition,
    projectAssistantServiceDefinition,
]

const serverDefinitionMap = new Map(MCP_SERVER_DEFINITIONS.map(definition => [definition.serverId, definition]))

/**
 * 按 `serverId` 读取单个 MCP Server 定义。
 * registry 层与 manager 层都只依赖这个查询入口，不直接感知底层数组结构。
 */
export function getMcpServerDefinition(serverId: MCPServerId) {
    return serverDefinitionMap.get(serverId)
}
