import { MCPHostError } from '@/lib/ai/mcp/protocol/errors'
import type { MCPConnectionState, MCPServerId } from '@/lib/ai/mcp/protocol/types'
import { mcpServerRegistry } from '@/lib/ai/mcp/registry/mcp-server-registry'

import { MCPClient } from './mcp-client'

/**
 * `MCPClientManager` 负责按 `serverId` 复用 `MCPClient`。
 * 它的职责是“管理客户端实例”，不是“执行业务语义”：
 * - 不判断 Skill
 * - 不做 Tool / Resource 适配
 * - 不处理前端协议
 */
export class MCPClientManager {
    /**
     * 同一个 `serverId` 在进程里只保留一个 client，避免重复拉起多个 MCP 子进程。
     */
    private clientMap = new Map<MCPServerId, MCPClient>()
    private toolListPromiseMap = new Map<MCPServerId, Promise<Awaited<ReturnType<MCPClient['listTools']>>>>()

    /**
     * 对外暴露 MCP Tool 调用入口。
     * manager 自己不关心参数内容，只负责找到对应 client 并转发。
     */
    async callTool(serverId: MCPServerId, ...args: Parameters<MCPClient['callTool']>) {
        const client = this.getOrCreateClient(serverId)

        return client.callTool(...args)
    }

    /**
     * 关闭指定 server 对应的 client，并把它从缓存中移除。
     */
    async close(serverId: MCPServerId) {
        const client = this.clientMap.get(serverId)

        if (!client) {
            return
        }

        await client.close()
        this.clientMap.delete(serverId)
        this.toolListPromiseMap.delete(serverId)
    }

    /**
     * 关闭当前 manager 管理的全部 MCP client。
     * 这通常用于进程结束前的统一清理。
     */
    async closeAll() {
        await Promise.all([...this.clientMap.keys()].map(serverId => this.close(serverId)))
    }

    /**
     * 对外暴露单个 server 的初始化入口。
     * Step 1 的 smoke test 主要就是验证这里能否跑通。
     */
    async connect(serverId: MCPServerId) {
        const client = this.getOrCreateClient(serverId)

        return client.connect()
    }

    /**
     * 返回指定 client 最近一次底层错误，便于调试或运行时观测。
     */
    getLastError(serverId: MCPServerId) {
        return this.clientMap.get(serverId)?.getLastError() ?? null
    }

    /**
     * 返回指定 client 当前连接状态。
     */
    getState(serverId: MCPServerId): MCPConnectionState {
        return this.clientMap.get(serverId)?.getState() ?? 'idle'
    }

    /**
     * 对外暴露 Resource 列表读取入口。
     */
    async listResources(serverId: MCPServerId) {
        const client = this.getOrCreateClient(serverId)

        return client.listResources()
    }

    /**
     * 对外暴露 Prompt 列表读取入口。
     */
    async listPrompts(serverId: MCPServerId) {
        const client = this.getOrCreateClient(serverId)

        return client.listPrompts()
    }

    /**
     * 对外暴露 Tool 列表读取入口。
     */
    async listTools(serverId: MCPServerId) {
        const existingToolListPromise = this.toolListPromiseMap.get(serverId)

        if (existingToolListPromise) {
            return existingToolListPromise
        }

        const client = this.getOrCreateClient(serverId)
        const toolListPromise = client.listTools().catch(error => {
            this.toolListPromiseMap.delete(serverId)
            throw error
        })

        this.toolListPromiseMap.set(serverId, toolListPromise)

        return toolListPromise
    }

    /**
     * 对外暴露单个 Prompt 获取入口。
     */
    async getPrompt(serverId: MCPServerId, ...args: Parameters<MCPClient['getPrompt']>) {
        const client = this.getOrCreateClient(serverId)

        return client.getPrompt(...args)
    }

    /**
     * 对外暴露单个 Resource 的读取入口。
     */
    async readResource(serverId: MCPServerId, ...args: Parameters<MCPClient['readResource']>) {
        const client = this.getOrCreateClient(serverId)

        return client.readResource(...args)
    }

    /**
     * 统一创建或复用 `MCPClient`。
     * 这是 manager 最关键的内部方法：
     * 1. 先查缓存
     * 2. 再查静态 registry
     * 3. 找不到 server 定义就直接报错
     * 4. 找到后才创建 client 并写回缓存
     */
    private getOrCreateClient(serverId: MCPServerId) {
        const existingClient = this.clientMap.get(serverId)

        if (existingClient) {
            return existingClient
        }

        const serverDefinition = mcpServerRegistry.get(serverId)

        if (!serverDefinition) {
            throw new MCPHostError('SERVER_NOT_FOUND', `未找到 MCP Server 定义：${serverId}`)
        }

        const client = new MCPClient(serverDefinition)

        this.clientMap.set(serverId, client)

        return client
    }
}

export const mcpClientManager = new MCPClientManager()
