import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { CallToolRequest, ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js'

import { MCPHostError, toErrorMessage } from '@/lib/ai/mcp/protocol/errors'
import {
    MCP_CLIENT_CAPABILITIES,
    MCP_CLIENT_INFO,
    MCP_CLIENT_TIMEOUTS,
    type MCPCallToolResponse,
    type MCPConnectionState,
    type MCPInitializeResult,
    type MCPListResourcesResult,
    type MCPListToolsResult,
    type MCPReadResourceResponse,
    type MCPServerDefinition,
} from '@/lib/ai/mcp/protocol/types'
import { createStdioClientTransport } from '@/lib/ai/mcp/transport/stdio-transport'

type MCPRequestOptions = Parameters<Client['callTool']>[2]

/**
 * 给单次 MCP SDK 异步调用统一加超时，避免某个 server 卡住后拖慢整条主链。
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined

    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new MCPHostError('TIMEOUT', `${operationName} 超时（${timeoutMs}ms）。`))
        }, timeoutMs)
    })

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
    })
}

/**
 * `MCPClient` 只封装单个 MCP Server 的连接、状态和请求生命周期。
 * 它不处理 Skill、Tool Adapter 或业务语义，只负责：
 * 1. 初始化连接
 * 2. 调用官方 SDK 能力
 * 3. 翻译超时和底层错误
 * 4. 输出统一的 Host 层结果
 */
export class MCPClient {
    private client = new Client(MCP_CLIENT_INFO, {
        capabilities: MCP_CLIENT_CAPABILITIES,
    })

    /**
     * 复用同一轮初始化 Promise，避免并发请求时把同一个 MCP Server 重复拉起。
     */
    private connectPromise: Promise<MCPInitializeResult> | null = null

    /**
     * 保留最近一次底层错误，便于 manager 或调试链路读取。
     */
    private lastError: Error | null = null

    /**
     * 记录当前连接状态，用于调试、观测和上层状态查询。
     */
    private state: MCPConnectionState = 'idle'

    private transport = createStdioClientTransport(this.serverDefinition)

    constructor(private readonly serverDefinition: MCPServerDefinition) {
        this.client.onerror = error => {
            this.lastError = error
            this.state = 'error'
        }

        this.transport.onerror = error => {
            this.lastError = error
            this.state = 'error'
        }

        this.transport.onclose = () => {
            this.state = 'closed'
        }
    }

    /**
     * 调用 MCP Tool。
     * 如果当前连接还没完成初始化，会先执行 `connect()`。
     */
    async callTool(params: CallToolRequest['params'], options?: MCPRequestOptions): Promise<MCPCallToolResponse> {
        await this.connect()

        try {
            const result = await withTimeout(
                this.client.callTool(params, undefined, options),
                MCP_CLIENT_TIMEOUTS.requestMs,
                `${this.serverDefinition.serverId} tools/call`
            )

            return {
                result: result as MCPCallToolResponse['result'],
                serverDefinition: this.serverDefinition,
            }
        } catch (error) {
            throw new MCPHostError('REQUEST_FAILED', `${this.serverDefinition.displayName} Tool 调用失败：${toErrorMessage(error)}`, {
                cause: error,
            })
        }
    }

    /**
     * 主动关闭当前 transport，并清理这份 client 的连接状态。
     */
    async close() {
        try {
            await withTimeout(this.transport.close(), MCP_CLIENT_TIMEOUTS.closeMs, `${this.serverDefinition.serverId} close`)
        } catch (error) {
            throw new MCPHostError('REQUEST_FAILED', `${this.serverDefinition.displayName} 关闭失败：${toErrorMessage(error)}`, {
                cause: error,
            })
        } finally {
            this.connectPromise = null
            this.state = 'closed'
        }
    }

    /**
     * 初始化到单个 MCP Server 的连接。
     * 当前实现保证：
     * 1. 并发初始化可复用
     * 2. 成功后返回统一初始化结果
     * 3. 失败时保留错误和状态
     */
    async connect(): Promise<MCPInitializeResult> {
        if (this.state === 'ready' && this.connectPromise) {
            return this.connectPromise
        }

        if (this.connectPromise) {
            return this.connectPromise
        }

        this.state = 'connecting'

        this.connectPromise = withTimeout(
            this.client.connect(this.transport).then(() => {
                this.state = 'ready'
                this.lastError = null

                return {
                    clientInfo: MCP_CLIENT_INFO,
                    serverCapabilities: this.client.getServerCapabilities(),
                    serverDefinition: this.serverDefinition,
                    serverInstructions: this.client.getInstructions(),
                    serverVersion: this.client.getServerVersion(),
                }
            }),
            MCP_CLIENT_TIMEOUTS.initializeMs,
            `${this.serverDefinition.serverId} initialize`
        ).catch(error => {
            this.lastError = error instanceof Error ? error : new Error(toErrorMessage(error))
            this.state = 'error'
            this.connectPromise = null

            throw new MCPHostError('CONNECT_FAILED', `${this.serverDefinition.displayName} 初始化失败：${toErrorMessage(error)}`, {
                cause: error,
            })
        })

        return this.connectPromise
    }

    /**
     * 读取最近一次底层错误，供 manager 或调试链路做观测。
     */
    getLastError() {
        return this.lastError
    }

    /**
     * 读取当前连接状态，便于上层判断 server 是否已经 ready。
     */
    getState() {
        return this.state
    }

    /**
     * 获取 MCP Server 暴露的 Resource 列表。
     */
    async listResources(): Promise<MCPListResourcesResult> {
        await this.connect()

        try {
            const result = await withTimeout(
                this.client.listResources(),
                MCP_CLIENT_TIMEOUTS.listMs,
                `${this.serverDefinition.serverId} resources/list`
            )

            return {
                resources: result.resources,
                serverDefinition: this.serverDefinition,
            }
        } catch (error) {
            throw new MCPHostError('LIST_FAILED', `${this.serverDefinition.displayName} 资源列表获取失败：${toErrorMessage(error)}`, {
                cause: error,
            })
        }
    }

    /**
     * 获取 MCP Server 暴露的 Tool 列表。
     */
    async listTools(): Promise<MCPListToolsResult> {
        await this.connect()

        try {
            const result = await withTimeout(
                this.client.listTools(),
                MCP_CLIENT_TIMEOUTS.listMs,
                `${this.serverDefinition.serverId} tools/list`
            )

            return {
                serverDefinition: this.serverDefinition,
                tools: result.tools,
            }
        } catch (error) {
            throw new MCPHostError('LIST_FAILED', `${this.serverDefinition.displayName} 工具列表获取失败：${toErrorMessage(error)}`, {
                cause: error,
            })
        }
    }

    /**
     * 读取具体 Resource 内容。
     * Host 层只负责调用和错误翻译，真正的内容裁剪与预览放在 Resource adapter。
     */
    async readResource(params: ReadResourceRequest['params'], options?: MCPRequestOptions): Promise<MCPReadResourceResponse> {
        await this.connect()

        try {
            const result = await withTimeout(
                this.client.readResource(params, options),
                MCP_CLIENT_TIMEOUTS.requestMs,
                `${this.serverDefinition.serverId} resources/read`
            )

            return {
                result,
                serverDefinition: this.serverDefinition,
            }
        } catch (error) {
            throw new MCPHostError('REQUEST_FAILED', `${this.serverDefinition.displayName} 资源读取失败：${toErrorMessage(error)}`, {
                cause: error,
            })
        }
    }
}
