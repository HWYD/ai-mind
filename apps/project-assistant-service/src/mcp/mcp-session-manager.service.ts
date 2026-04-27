import { randomUUID } from 'node:crypto'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import type { Request, Response } from 'express'

import { McpCapabilityService } from './mcp-capability.service.js'

interface McpSessionEntry {
    createdAt: string
    server: ReturnType<McpCapabilityService['createServer']>
    transport: StreamableHTTPServerTransport
}

/**
 * 统一管理 Streamable HTTP 的 MCP 会话。
 * 这里负责 session 生命周期，不负责鉴权与业务能力注册。
 */
@Injectable()
export class McpSessionManagerService implements OnModuleDestroy {
    private sessionMap = new Map<string, McpSessionEntry>()

    constructor(@Inject(McpCapabilityService) private readonly capabilityService: McpCapabilityService) {}

    /**
     * 服务退出时清理全部会话，避免遗留连接。
     */
    async onModuleDestroy() {
        await Promise.all([...this.sessionMap.keys()].map(sessionId => this.removeSession(sessionId)))
    }

    /**
     * 处理 MCP POST：
     * - 带 sessionId：复用已有会话
     * - 不带 sessionId 且是 initialize：创建新会话
     * - 其他情况：返回 400
     */
    async handlePost(req: Request, res: Response, body: unknown) {
        const sessionId = this.getSessionId(req)

        if (sessionId) {
            const existingSession = this.sessionMap.get(sessionId)

            if (!existingSession) {
                this.writeJsonRpcError(res, 404, 'Session not found.')
                return
            }

            await existingSession.transport.handleRequest(req, res, body)
            return
        }

        if (!isInitializeRequest(body)) {
            this.writeJsonRpcError(res, 400, 'No valid session ID and request is not initialize.')
            return
        }

        await this.handleInitialize(req, res, body)
    }

    /**
     * 处理 MCP GET（SSE 链路）。
     * 当前要求必须带有效 sessionId。
     */
    async handleGet(req: Request, res: Response) {
        const sessionId = this.getSessionId(req)

        if (!sessionId) {
            this.writeJsonRpcError(res, 400, 'Missing mcp-session-id header.')
            return
        }

        const existingSession = this.sessionMap.get(sessionId)

        if (!existingSession) {
            this.writeJsonRpcError(res, 404, 'Session not found.')
            return
        }

        await existingSession.transport.handleRequest(req, res)
    }

    /**
     * 处理 MCP DELETE（会话终止）。
     * 成功后额外清理本地会话映射。
     */
    async handleDelete(req: Request, res: Response) {
        const sessionId = this.getSessionId(req)

        if (!sessionId) {
            this.writeJsonRpcError(res, 400, 'Missing mcp-session-id header.')
            return
        }

        const existingSession = this.sessionMap.get(sessionId)

        if (!existingSession) {
            this.writeJsonRpcError(res, 404, 'Session not found.')
            return
        }

        await existingSession.transport.handleRequest(req, res)
        await this.removeSession(sessionId)
    }

    /**
     * 初始化新 MCP 会话：
     * 1. 创建独立 McpServer
     * 2. 创建 Streamable HTTP transport
     * 3. 建立 server 与 transport 连接
     * 4. 回放当前 initialize 请求
     */
    private async handleInitialize(req: Request, res: Response, body: unknown) {
        const server = this.capabilityService.createServer()

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: sessionId => {
                this.sessionMap.set(sessionId, {
                    createdAt: new Date().toISOString(),
                    server,
                    transport,
                })
            },
        })

        transport.onclose = () => {
            const closedSessionId = transport.sessionId

            if (closedSessionId) {
                this.sessionMap.delete(closedSessionId)
            }
        }

        await server.connect(transport)
        await transport.handleRequest(req, res, body)
    }

    /**
     * 读取 MCP Session Header。
     * Header 大小写在 Node 层已归一，这里只兜底数组值场景。
     */
    private getSessionId(req: Request) {
        const rawHeader = req.headers['mcp-session-id']

        if (Array.isArray(rawHeader)) {
            return rawHeader[0]
        }

        return rawHeader
    }

    /**
     * 删除并关闭会话。
     * 先从 Map 删除，再关闭 transport / server，避免关闭回调再次触发重复删除。
     */
    private async removeSession(sessionId: string) {
        const existingSession = this.sessionMap.get(sessionId)

        if (!existingSession) {
            return
        }

        this.sessionMap.delete(sessionId)

        existingSession.transport.onclose = undefined

        await Promise.allSettled([existingSession.transport.close(), existingSession.server.close()])
    }

    /**
     * 返回兼容 JSON-RPC 的错误体，便于 MCP 客户端稳定识别失败。
     */
    private writeJsonRpcError(res: Response, statusCode: number, message: string) {
        res.status(statusCode).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message,
            },
            id: null,
        })
    }
}
