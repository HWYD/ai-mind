import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bootstrapProjectAssistantService } from '../src/bootstrap.js'

describe('bootstrapProjectAssistantService', () => {
    it('监听配置地址并启用 shutdown hooks', async () => {
        let shutdownHooksEnabled = false
        let listenArgs: [number, string] | null = null

        await bootstrapProjectAssistantService(
            {
                PROJECT_ASSISTANT_SERVICE_HOST: '0.0.0.0',
                PROJECT_ASSISTANT_SERVICE_PORT: '8788',
            },
            async () => ({
                enableShutdownHooks() {
                    shutdownHooksEnabled = true
                },
                async listen(port, hostname) {
                    listenArgs = [port, hostname]
                },
            })
        )

        assert.equal(shutdownHooksEnabled, true)
        assert.deepEqual(listenArgs, [8788, '0.0.0.0'])
    })

    it('生产 Token 校验失败时不会创建 Nest 应用', async () => {
        let createAppCalled = false

        await assert.rejects(
            () =>
                bootstrapProjectAssistantService(
                    {
                        NODE_ENV: 'production',
                    },
                    async () => {
                        createAppCalled = true
                        throw new Error('should not create app')
                    }
                ),
            { name: 'ProjectAssistantServiceConfigError' }
        )

        assert.equal(createAppCalled, false)
    })
})
