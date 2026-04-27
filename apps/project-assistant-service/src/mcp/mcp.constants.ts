/**
 * MCP Server 对外标识信息。
 * `name` 与 webapp 里的 `serverId` 保持一致，便于前后端定位同一能力来源。
 */
export const PROJECT_ASSISTANT_MCP_INFO = {
    name: 'project-assistant-service',
    version: '0.0.11',
}

/**
 * MCP 鉴权默认 token。
 * 仅用于本地开发期 mock auth，生产化阶段需要替换成安全的动态鉴权方案。
 */
export const PROJECT_ASSISTANT_MCP_DEFAULT_TOKEN = 'project-assistant-service-dev-token'
