import { Injectable } from '@nestjs/common'

import { PROJECT_ASSISTANT_MCP_DEFAULT_TOKEN } from './mcp.constants.js'

export type McpAuthResult = 'forbidden' | 'ok' | 'unauthorized'

/**
 * MCP 端点的最小 mock 鉴权服务。
 * 当前只验证 Bearer Token，不引入用户态登录透传与复杂权限模型。
 */
@Injectable()
export class McpAuthService {
    /**
     * 读取当前服务期望的 token：
     * - 优先环境变量 `PROJECT_ASSISTANT_SERVICE_MCP_TOKEN`
     * - 兜底固定开发 token（仅本地调试使用）
     */
    private getExpectedToken() {
        return process.env.PROJECT_ASSISTANT_SERVICE_MCP_TOKEN?.trim() || PROJECT_ASSISTANT_MCP_DEFAULT_TOKEN
    }

    /**
     * 验证 Authorization Header。
     * - 无 token -> unauthorized
     * - token 不匹配 -> forbidden
     * - 匹配 -> ok
     */
    validateAuthorizationHeader(authorizationHeader: string | undefined): McpAuthResult {
        if (!authorizationHeader?.trim()) {
            return 'unauthorized'
        }

        const matched = authorizationHeader.match(/^Bearer\s+(.+)$/i)
        const accessToken = matched?.[1]?.trim()

        if (!accessToken) {
            return 'forbidden'
        }

        return accessToken === this.getExpectedToken() ? 'ok' : 'forbidden'
    }
}
