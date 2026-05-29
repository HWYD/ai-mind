import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module.js'

/**
 * 启动 `project-assistant-service`。
 * 当前只承载 MCP 最小闭环，同时保留普通 HTTP API 扩展位（例如 `/health`）。
 */
async function bootstrap() {
    const app = await NestFactory.create(AppModule)
    const port = Number(process.env.PROJECT_ASSISTANT_SERVICE_PORT ?? 8788)

    await app.listen(port, '127.0.0.1')
}

void bootstrap()
