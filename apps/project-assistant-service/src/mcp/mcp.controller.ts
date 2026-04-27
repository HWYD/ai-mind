import { Body, Controller, Delete, Get, Headers, Inject, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'

import { McpAuthService } from './mcp-auth.service.js'
import { McpSessionManagerService } from './mcp-session-manager.service.js'

/**
 * MCP Streamable HTTP 入口控制器。
 * 只负责三件事：
 * 1. 执行 mock auth
 * 2. 分发 HTTP 方法到会话管理器
 * 3. 兜底返回统一错误状态
 */
@Controller('mcp')
export class McpController {
    constructor(
        @Inject(McpAuthService)
        private readonly authService: McpAuthService,
        @Inject(McpSessionManagerService)
        private readonly sessionManager: McpSessionManagerService
    ) {}

    @Post()
    async handlePost(
        @Req() req: Request,
        @Res() res: Response,
        @Body() body: unknown,
        @Headers('authorization') authorizationHeader?: string
    ) {
        if (!this.ensureAuthorized(authorizationHeader, res)) {
            return
        }

        try {
            await this.sessionManager.handlePost(req, res, body)
        } catch (error) {
            this.writeInternalError(res, error)
        }
    }

    @Get()
    async handleGet(@Req() req: Request, @Res() res: Response, @Headers('authorization') authorizationHeader?: string) {
        if (!this.ensureAuthorized(authorizationHeader, res)) {
            return
        }

        try {
            await this.sessionManager.handleGet(req, res)
        } catch (error) {
            this.writeInternalError(res, error)
        }
    }

    @Delete()
    async handleDelete(@Req() req: Request, @Res() res: Response, @Headers('authorization') authorizationHeader?: string) {
        if (!this.ensureAuthorized(authorizationHeader, res)) {
            return
        }

        try {
            await this.sessionManager.handleDelete(req, res)
        } catch (error) {
            this.writeInternalError(res, error)
        }
    }

    /**
     * 统一执行 Bearer Token 鉴权，并按 tasklist 约定返回 401 / 403。
     */
    private ensureAuthorized(authorizationHeader: string | undefined, res: Response) {
        const authResult = this.authService.validateAuthorizationHeader(authorizationHeader)

        if (authResult === 'ok') {
            return true
        }

        if (authResult === 'unauthorized') {
            res.status(401).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Unauthorized: missing bearer token.',
                },
                id: null,
            })
            return false
        }

        res.status(403).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Forbidden: invalid bearer token.',
            },
            id: null,
        })

        return false
    }

    /**
     * 统一处理 MCP 控制器内部异常。
     * 这里返回 500，语义对应 execution_failed。
     */
    private writeInternalError(res: Response, error: unknown) {
        const message = error instanceof Error ? error.message : String(error)

        if (res.headersSent) {
            return
        }

        res.status(500).json({
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: `Internal server error: ${message}`,
            },
            id: null,
        })
    }
}
