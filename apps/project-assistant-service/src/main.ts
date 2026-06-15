import 'reflect-metadata'

import { bootstrapProjectAssistantService } from './bootstrap.js'

/**
 * 启动 `project-assistant-service`。
 * 当前只承载 MCP 最小闭环，同时保留普通 HTTP API 扩展位（例如 `/health`）。
 */
void bootstrapProjectAssistantService().catch(error => {
    console.error('Failed to start project-assistant-service:', error)
    process.exitCode = 1
})
