import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
    type CallToolRequest,
    ErrorCode,
    type GetPromptRequest,
    McpError,
    type ReadResourceRequest,
} from '@modelcontextprotocol/sdk/types.js'

import { MCPHostError, type MCPHostErrorCode, toErrorMessage } from '@/lib/ai/mcp/protocol/errors'
import {
    isMCPStdioServerDefinition,
    isMCPStreamableHttpServerDefinition,
    MCP_CLIENT_CAPABILITIES,
    MCP_CLIENT_INFO,
    MCP_CLIENT_TIMEOUTS,
    type MCPCallToolResponse,
    type MCPConnectionState,
    type MCPGetPromptResponse,
    type MCPInitializeResult,
    type MCPListPromptsResult,
    type MCPListResourcesResult,
    type MCPListToolsResult,
    type MCPReadResourceResponse,
    type MCPServerDefinition,
} from '@/lib/ai/mcp/protocol/types'
import { createStdioClientTransport } from '@/lib/ai/mcp/transport/stdio-transport'
import { createStreamableHttpClientTransport } from '@/lib/ai/mcp/transport/streamable-http-transport'

type MCPRequestOptions = Parameters<Client['callTool']>[2]
type MCPClientTransport = ReturnType<typeof createStdioClientTransport> | ReturnType<typeof createStreamableHttpClientTransport>

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
 * Streamable HTTP 的 session 可能因为 remote 服务重启而失效。
 * 这类错误适合重建连接后重试一次；其他业务错误不能自动吞掉。
 */
function isRecoverableSessionError(error: unknown) {
    const message = toErrorMessage(error).toLowerCase()

    return message.includes('session not found') || message.includes('no valid session id')
}

/**
 * 把底层 SDK / 传输层异常统一翻译成 MCP Host 层错误码。
 * 这里的目标是沉淀稳定语义，避免上层依赖错误文案字符串。
 */
function resolveHostErrorCode(error: unknown, fallback: MCPHostErrorCode): MCPHostErrorCode {
    if (error instanceof MCPHostError) {
        return error.code
    }

    if (error instanceof StreamableHTTPError) {
        if (error.code === 401) {
            return 'UNAUTHORIZED'
        }

        if (error.code === 403) {
            return 'FORBIDDEN'
        }

        if (error.code === 404) {
            return 'NOT_FOUND'
        }
    }

    if (error instanceof McpError) {
        if (error.code === ErrorCode.RequestTimeout) {
            return 'TIMEOUT'
        }

        if (error.code === ErrorCode.MethodNotFound) {
            return 'NOT_FOUND'
        }
    }

    const message = toErrorMessage(error).toLowerCase()

    if (message.includes('unauthorized') || message.includes('未授权')) {
        return 'UNAUTHORIZED'
    }

    if (message.includes('forbidden') || message.includes('禁止访问') || message.includes('不允许') || message.includes('只允许')) {
        return 'FORBIDDEN'
    }

    if (message.includes('not found') || message.includes('未找到')) {
        return 'NOT_FOUND'
    }

    if (message.includes('timeout') || message.includes('timed out') || message.includes('超时')) {
        return 'TIMEOUT'
    }

    return fallback
}

/**
 * `MCPClient` 只封装单个 MCP Server 的连接、状态与请求生命周期。
 * 它不处理 Skill、Tool Adapter 或业务语义，只负责：
 * 1. 初始化连接
 * 2. 调用官方 SDK 能力
 * 3. 翻译超时和底层错误
 * 4. 输出统一的 Host 层结构
 */
export class MCPClient {
    private client: Client

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

    private transport: MCPClientTransport

    constructor(private readonly serverDefinition: MCPServerDefinition) {
        this.client = this.createClient()
        this.transport = this.createTransport()
        this.bindTransportHandlers()
    }

    /**
     * 创建官方 SDK Client，并把底层错误同步到 Host 层状态。
     * session 失效重连时需要重新创建 Client，避免旧 session 状态残留。
     */
    private createClient() {
        const client = new Client(MCP_CLIENT_INFO, {
            capabilities: MCP_CLIENT_CAPABILITIES,
        })

        client.onerror = error => {
            this.lastError = error
            this.state = 'error'
        }

        return client
    }

    /**
     * 根据 server definition 创建对应 transport。
     * transport 保存 session / 进程连接等底层状态，因此重连时必须重新创建。
     */
    private createTransport(): MCPClientTransport {
        if (isMCPStdioServerDefinition(this.serverDefinition)) {
            return createStdioClientTransport(this.serverDefinition)
        } else if (isMCPStreamableHttpServerDefinition(this.serverDefinition)) {
            return createStreamableHttpClientTransport(this.serverDefinition)
        } else {
            const unsupportedServerDefinition = this.serverDefinition as { displayName: string; transport: string }

            throw new MCPHostError(
                'UNSUPPORTED_TRANSPORT',
                `${unsupportedServerDefinition.displayName} 使用了当前版本尚未接入的 transport：${unsupportedServerDefinition.transport}`
            )
        }
    }

    /**
     * transport 关闭后清空连接 Promise，下一次请求可以重新 initialize。
     */
    private bindTransportHandlers() {
        this.transport.onerror = error => {
            this.lastError = error
            this.state = 'error'
        }

        this.transport.onclose = () => {
            this.connectPromise = null
            this.state = 'closed'
        }
    }

    /**
     * 一旦底层 transport 已关闭，或上一轮初始化已经进入错误态，
     * 下一次 connect 必须使用全新的 SDK Client / transport。
     * 否则官方 SDK 会把它判定成“同一 Protocol 重复 connect”。
     */
    private rebuildConnectionPrimitives() {
        this.connectPromise = null
        this.state = 'idle'
        this.client = this.createClient()
        this.transport = this.createTransport()
        this.bindTransportHandlers()
    }

    /**
     * 丢弃当前底层连接并创建全新的 SDK Client / transport。
     * 主要用于 remote MCP 服务重启后，旧 mcp-session-id 已经不存在的场景。
     */
    private async resetConnection() {
        try {
            await withTimeout(this.transport.close(), MCP_CLIENT_TIMEOUTS.closeMs, `${this.serverDefinition.serverId} reset`)
        } catch {
            // 旧 session 已失效时 close 也可能失败；这里继续重建，保证下一次请求能重新 initialize。
        }

        this.rebuildConnectionPrimitives()
    }

    /**
     * 执行一次 MCP 请求；如果遇到可恢复的 session 失效错误，则重建连接后只重试一次。
     */
    private async runWithSessionRecovery<T>(operation: () => Promise<T>) {
        try {
            return await operation()
        } catch (error) {
            if (!isMCPStreamableHttpServerDefinition(this.serverDefinition) || !isRecoverableSessionError(error)) {
                throw error
            }

            await this.resetConnection()
            await this.connect()
            return operation()
        }
    }

    /**
     * 按 server definition 返回本次请求应使用的超时。
     * remote streamable-http 可按 server 级别覆盖 request/list/initialize 超时。
     */
    private getTimeoutMs(kind: 'initialize' | 'list' | 'request') {
        const fallbackMap = {
            initialize: MCP_CLIENT_TIMEOUTS.initializeMs,
            list: MCP_CLIENT_TIMEOUTS.listMs,
            request: MCP_CLIENT_TIMEOUTS.requestMs,
        } as const

        if (!isMCPStreamableHttpServerDefinition(this.serverDefinition) || !this.serverDefinition.timeoutMs) {
            return fallbackMap[kind]
        }

        return this.serverDefinition.timeoutMs
    }

    /**
     * 调用 MCP Tool。
     * 如果当前连接还没完成初始化，会先执行 `connect()`。
     */
    async callTool(params: CallToolRequest['params'], options?: MCPRequestOptions): Promise<MCPCallToolResponse> {
        await this.connect()

        try {
            const result = await this.runWithSessionRecovery(() =>
                withTimeout(
                    this.client.callTool(params, undefined, options),
                    this.getTimeoutMs('request'),
                    `${this.serverDefinition.serverId} tools/call`
                )
            )

            return {
                result: result as MCPCallToolResponse['result'],
                serverDefinition: this.serverDefinition,
            }
        } catch (error) {
            throw new MCPHostError(
                resolveHostErrorCode(error, 'EXECUTION_FAILED'),
                `${this.serverDefinition.displayName} Tool 调用失败：${toErrorMessage(error)}`,
                {
                    cause: error,
                }
            )
        }
    }

    /**
     * 获取 MCP Prompt 列表。
     */
    async listPrompts(): Promise<MCPListPromptsResult> {
        await this.connect()

        try {
            const result = await this.runWithSessionRecovery(() =>
                withTimeout(this.client.listPrompts(), this.getTimeoutMs('list'), `${this.serverDefinition.serverId} prompts/list`)
            )

            return {
                prompts: result.prompts,
                serverDefinition: this.serverDefinition,
            }
        } catch (error) {
            throw new MCPHostError(
                resolveHostErrorCode(error, 'LIST_FAILED'),
                `${this.serverDefinition.displayName} Prompt 列表获取失败：${toErrorMessage(error)}`,
                {
                    cause: error,
                }
            )
        }
    }

    /**
     * 主动关闭当前 transport，并清理这份 client 的连接状态。
     */
    async close() {
        try {
            await withTimeout(this.transport.close(), MCP_CLIENT_TIMEOUTS.closeMs, `${this.serverDefinition.serverId} close`)
        } catch (error) {
            throw new MCPHostError(
                resolveHostErrorCode(error, 'REQUEST_FAILED'),
                `${this.serverDefinition.displayName} 关闭失败：${toErrorMessage(error)}`,
                {
                    cause: error,
                }
            )
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

        if (this.state === 'closed' || this.state === 'error') {
            this.rebuildConnectionPrimitives()
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
            this.getTimeoutMs('initialize'),
            `${this.serverDefinition.serverId} initialize`
        ).catch(error => {
            this.lastError = error instanceof Error ? error : new Error(toErrorMessage(error))
            this.state = 'error'
            this.connectPromise = null

            throw new MCPHostError(
                resolveHostErrorCode(error, 'CONNECT_FAILED'),
                `${this.serverDefinition.displayName} 初始化失败：${toErrorMessage(error)}`,
                {
                    cause: error,
                }
            )
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
            const result = await this.runWithSessionRecovery(() =>
                withTimeout(this.client.listResources(), this.getTimeoutMs('list'), `${this.serverDefinition.serverId} resources/list`)
            )

            return {
                resources: result.resources,
                serverDefinition: this.serverDefinition,
            }
        } catch (error) {
            throw new MCPHostError(
                resolveHostErrorCode(error, 'LIST_FAILED'),
                `${this.serverDefinition.displayName} 资源列表获取失败：${toErrorMessage(error)}`,
                {
                    cause: error,
                }
            )
        }
    }

    /**
     * 获取 MCP Server 暴露的 Tool 列表。
     */
    async listTools(): Promise<MCPListToolsResult> {
        await this.connect()

        try {
            const result = await this.runWithSessionRecovery(() =>
                withTimeout(this.client.listTools(), this.getTimeoutMs('list'), `${this.serverDefinition.serverId} tools/list`)
            )

            return {
                serverDefinition: this.serverDefinition,
                tools: result.tools,
            }
        } catch (error) {
            throw new MCPHostError(
                resolveHostErrorCode(error, 'LIST_FAILED'),
                `${this.serverDefinition.displayName} 工具列表获取失败：${toErrorMessage(error)}`,
                {
                    cause: error,
                }
            )
        }
    }

    /**
     * 获取具体 Prompt 内容。
     */
    async getPrompt(params: GetPromptRequest['params'], options?: MCPRequestOptions): Promise<MCPGetPromptResponse> {
        await this.connect()

        try {
            const result = await this.runWithSessionRecovery(() =>
                withTimeout(
                    this.client.getPrompt(params, options),
                    this.getTimeoutMs('request'),
                    `${this.serverDefinition.serverId} prompts/get`
                )
            )

            return {
                result,
                serverDefinition: this.serverDefinition,
            }
        } catch (error) {
            throw new MCPHostError(
                resolveHostErrorCode(error, 'REQUEST_FAILED'),
                `${this.serverDefinition.displayName} Prompt 获取失败：${toErrorMessage(error)}`,
                {
                    cause: error,
                }
            )
        }
    }

    /**
     * 读取具体 Resource 内容。
     * Host 层只负责调用和错误翻译，真正的内容裁剪与预览放在 Resource adapter。
     */
    async readResource(params: ReadResourceRequest['params'], options?: MCPRequestOptions): Promise<MCPReadResourceResponse> {
        await this.connect()

        try {
            const result = await this.runWithSessionRecovery(() =>
                withTimeout(
                    this.client.readResource(params, options),
                    this.getTimeoutMs('request'),
                    `${this.serverDefinition.serverId} resources/read`
                )
            )

            return {
                result,
                serverDefinition: this.serverDefinition,
            }
        } catch (error) {
            throw new MCPHostError(
                resolveHostErrorCode(error, 'REQUEST_FAILED'),
                `${this.serverDefinition.displayName} 资源读取失败：${toErrorMessage(error)}`,
                {
                    cause: error,
                }
            )
        }
    }
}
