import { MCPHostError } from '@/lib/ai/mcp/protocol/errors'
import type { MCPConnectionState, MCPServerId, MCPToolCallBatchPolicy } from '@/lib/ai/mcp/protocol/types'
import { mcpServerRegistry } from '@/lib/ai/mcp/registry/mcp-server-registry'

import { MCPClient } from './mcp-client'

interface QueuedToolCall {
    abortListener?: () => void
    operation: () => Promise<unknown>
    reject: (reason?: unknown) => void
    resolve: (value: unknown) => void
    signal?: AbortSignal
}

/**
 * 按单个 server 的静态策略串联批次。每批中的请求同时启动，下一批只在前一批全部结束且
 * 冷却期结束后才启动；这样不会干预 General ReAct 的全局 Tool 并发或重试语义。
 */
class MCPToolCallBatchScheduler {
    private activeBatch = false
    private closed = false
    private cooldownTimer: NodeJS.Timeout | null = null
    private nextBatchAllowedAt = 0
    private queuedCalls: QueuedToolCall[] = []
    private startScheduled = false

    constructor(private readonly policy: MCPToolCallBatchPolicy) {}

    enqueue<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
        if (this.closed) {
            return Promise.reject(new MCPHostError('NOT_CONNECTED', 'MCP Server 已关闭，待执行的 Tool 调用未发送。'))
        }

        if (signal?.aborted) {
            return Promise.reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
        }

        return new Promise<T>((resolve, reject) => {
            const queuedCall: QueuedToolCall = {
                operation,
                reject,
                resolve,
                signal,
            }
            if (signal) {
                queuedCall.abortListener = () => {
                    const index = this.queuedCalls.indexOf(queuedCall)

                    if (index < 0) {
                        return
                    }

                    this.queuedCalls.splice(index, 1)
                    this.removeAbortListener(queuedCall)
                    reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
                }
                signal.addEventListener('abort', queuedCall.abortListener, { once: true })
            }
            this.queuedCalls.push(queuedCall)
            this.scheduleStart()
        })
    }

    close() {
        this.closed = true
        if (this.cooldownTimer) {
            clearTimeout(this.cooldownTimer)
            this.cooldownTimer = null
        }

        const error = new MCPHostError('NOT_CONNECTED', 'MCP Server 已关闭，待执行的 Tool 调用未发送。')
        this.queuedCalls.splice(0).forEach(queuedCall => {
            this.removeAbortListener(queuedCall)
            queuedCall.reject(error)
        })
    }

    private removeAbortListener(queuedCall: QueuedToolCall) {
        if (queuedCall.signal && queuedCall.abortListener) {
            queuedCall.signal.removeEventListener('abort', queuedCall.abortListener)
        }
    }

    private scheduleStart() {
        if (this.closed || this.startScheduled || this.activeBatch || this.queuedCalls.length === 0) {
            return
        }

        this.startScheduled = true
        queueMicrotask(() => {
            this.startScheduled = false
            this.startNextBatch()
        })
    }

    private startNextBatch() {
        if (this.closed || this.activeBatch || this.queuedCalls.length === 0) {
            return
        }

        const remainingCooldownMs = this.nextBatchAllowedAt - Date.now()
        if (remainingCooldownMs > 0) {
            if (!this.cooldownTimer) {
                this.cooldownTimer = setTimeout(() => {
                    this.cooldownTimer = null
                    this.scheduleStart()
                }, remainingCooldownMs)
            }
            return
        }

        const batch = this.queuedCalls.splice(0, this.policy.maxBatchSize)
        this.activeBatch = true
        const operations = batch.map(queuedCall => {
            this.removeAbortListener(queuedCall)
            try {
                return Promise.resolve(queuedCall.operation()).then(queuedCall.resolve, queuedCall.reject)
            } catch (error) {
                queuedCall.reject(error)
                return Promise.resolve()
            }
        })

        void Promise.allSettled(operations).finally(() => {
            this.activeBatch = false
            this.nextBatchAllowedAt = Date.now() + this.policy.cooldownMs
            this.scheduleStart()
        })
    }
}

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
    private toolCallBatchSchedulerMap = new Map<MCPServerId, MCPToolCallBatchScheduler>()

    /**
     * 对外暴露 MCP Tool 调用入口。
     * manager 自己不关心参数内容，只负责找到对应 client 并转发。
     */
    async callTool(serverId: MCPServerId, ...args: Parameters<MCPClient['callTool']>) {
        const client = this.getOrCreateClient(serverId)
        const policy = mcpServerRegistry.get(serverId)?.toolCallBatchPolicy

        if (!policy) {
            return client.callTool(...args)
        }

        return this.getOrCreateToolCallBatchScheduler(serverId, policy).enqueue(() => client.callTool(...args), args[1]?.signal)
    }

    /**
     * 关闭指定 server 对应的 client，并把它从缓存中移除。
     */
    async close(serverId: MCPServerId) {
        this.toolCallBatchSchedulerMap.get(serverId)?.close()
        this.toolCallBatchSchedulerMap.delete(serverId)
        const client = this.clientMap.get(serverId)

        if (!client) {
            this.toolListPromiseMap.delete(serverId)
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
        const serverIds = new Set([...this.clientMap.keys(), ...this.toolCallBatchSchedulerMap.keys()])

        await Promise.all([...serverIds].map(serverId => this.close(serverId)))
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

    private getOrCreateToolCallBatchScheduler(serverId: MCPServerId, policy: MCPToolCallBatchPolicy) {
        const existingScheduler = this.toolCallBatchSchedulerMap.get(serverId)

        if (existingScheduler) {
            return existingScheduler
        }

        const scheduler = new MCPToolCallBatchScheduler(policy)
        this.toolCallBatchSchedulerMap.set(serverId, scheduler)

        return scheduler
    }
}

export const mcpClientManager = new MCPClientManager()
