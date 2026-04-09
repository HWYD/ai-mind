import { resolve } from 'node:path'

import type { MCPServerDefinition, MCPServerId } from '@/lib/ai/mcp/protocol/types'

/**
 * 把 server 脚本文件名解析成可直接交给 Node 进程启动的绝对路径。
 */
function createServerScriptPath(filename: string) {
    return resolve(process.cwd(), 'lib/ai/mcp/servers', filename)
}

/**
 * `project-files-server` 当前只暴露 Resource 能力。
 */
const projectFilesServerDefinition: MCPServerDefinition = {
    args: [createServerScriptPath('project-files-server.mjs')],
    capabilities: {
        resources: true,
        tools: false,
    },
    command: process.execPath,
    cwd: process.cwd(),
    displayName: '项目文件 MCP Server',
    serverId: 'project-files-server',
    stderr: 'pipe',
}

/**
 * `weather-server` 当前只暴露 Tool 能力。
 */
const weatherServerDefinition: MCPServerDefinition = {
    args: [createServerScriptPath('weather-server.mjs')],
    capabilities: {
        resources: false,
        tools: true,
    },
    command: process.execPath,
    cwd: process.cwd(),
    displayName: '天气 MCP Server',
    serverId: 'weather-server',
    stderr: 'pipe',
}

/**
 * 所有静态 MCP Server 定义的单一导出入口。
 * 当前版本先固定为数组，后续如果要接配置文件或动态开关，再从这里往外扩。
 */
export const MCP_SERVER_DEFINITIONS: MCPServerDefinition[] = [weatherServerDefinition, projectFilesServerDefinition]

const serverDefinitionMap = new Map(MCP_SERVER_DEFINITIONS.map(definition => [definition.serverId, definition]))

/**
 * 按 `serverId` 读取单个 MCP Server 定义。
 * registry 层与 manager 层都只依赖这个查询入口，不直接感知底层数组结构。
 */
export function getMcpServerDefinition(serverId: MCPServerId) {
    return serverDefinitionMap.get(serverId)
}
