import { Module } from '@nestjs/common'

import { AppController } from './app.controller.js'
import { McpModule } from './mcp/mcp.module.js'

/**
 * 应用根模块。
 * 当前只挂载两部分：
 * 1. 普通 HTTP 健康检查
 * 2. MCP Streamable HTTP 端点
 */
@Module({
    imports: [McpModule],
    controllers: [AppController],
})
export class AppModule {}
