import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module.js'
import { resolveProjectAssistantServiceRuntimeConfig } from './runtime-config.js'

interface ProjectAssistantServiceApp {
    enableShutdownHooks(): void
    listen(port: number, hostname: string): Promise<unknown>
}

type CreateProjectAssistantServiceApp = () => Promise<ProjectAssistantServiceApp>

export async function bootstrapProjectAssistantService(
    env: Record<string, string | undefined> = process.env,
    createApp: CreateProjectAssistantServiceApp = () => NestFactory.create(AppModule)
) {
    const runtimeConfig = resolveProjectAssistantServiceRuntimeConfig(env)
    const app = await createApp()

    app.enableShutdownHooks()
    await app.listen(runtimeConfig.port, runtimeConfig.host)

    return app
}
