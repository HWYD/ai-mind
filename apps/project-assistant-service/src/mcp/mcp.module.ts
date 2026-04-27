import { Module } from '@nestjs/common'

import { McpController } from './mcp.controller.js'
import { McpAuthService } from './mcp-auth.service.js'
import { McpCapabilityService } from './mcp-capability.service.js'
import { McpSessionManagerService } from './mcp-session-manager.service.js'

/**
 * MCP 模块：
 * - Controller：HTTP 入口（鉴权 + 分发）
 * - SessionManager：会话生命周期
 * - CapabilityService：三类 capability 注册
 */
@Module({
    controllers: [McpController],
    providers: [McpAuthService, McpCapabilityService, McpSessionManagerService],
})
export class McpModule {}
