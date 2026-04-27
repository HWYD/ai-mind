import { Controller, Get } from '@nestjs/common'

/**
 * 普通 HTTP 健康检查端点。
 * 用于验证这个 NestJS 服务除了 MCP 以外也可承载常规 API。
 */
@Controller()
export class AppController {
    @Get('health')
    getHealth() {
        return {
            service: 'project-assistant-service',
            status: 'ok',
        }
    }
}
