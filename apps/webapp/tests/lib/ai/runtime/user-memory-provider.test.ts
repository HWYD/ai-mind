import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    createPostgresUserMemoryStore,
    getUserMemoryRuntimeConfig,
    getUserMemoryStore,
    resetUserMemoryStoreForTests,
    USER_MEMORY_POSTGRES_SCHEMA,
} from '@/lib/ai/runtime/user-memory'
import { createDoubaoEmbeddings, resolveDoubaoEmbeddingsEndpoint } from '@/lib/ai/runtime/user-memory/doubao-embeddings'

import { runUserMemoryStoreSetup, USER_MEMORY_SETUP_SUCCESS_MESSAGE } from '../../../../scripts/setup-user-memory-store-lib.mjs'

describe('runtime/user-memory provider', () => {
    afterEach(() => {
        resetUserMemoryStoreForTests()
    })

    it('formal runtime environments 默认使用 postgres store', () => {
        expect(getUserMemoryRuntimeConfig({}, 'development').storeMode).toBe('postgres')
        expect(getUserMemoryRuntimeConfig({}, 'integration').storeMode).toBe('postgres')
        expect(getUserMemoryRuntimeConfig({}, 'preview').storeMode).toBe('postgres')
        expect(getUserMemoryRuntimeConfig({}, 'staging').storeMode).toBe('postgres')
        expect(getUserMemoryRuntimeConfig({}, 'production').storeMode).toBe('postgres')
    })

    it('legacy memory mode 与非法 mode 都回退到 postgres', () => {
        expect(getUserMemoryRuntimeConfig({ AI_MIND_USER_MEMORY_STORE: 'memory' }, 'development').storeMode).toBe('postgres')
        expect(getUserMemoryRuntimeConfig({ AI_MIND_USER_MEMORY_STORE: 'invalid' }, 'development').storeMode).toBe('postgres')
        expect(getUserMemoryRuntimeConfig({ AI_MIND_USER_MEMORY_STORE: 'invalid' }, 'production').storeMode).toBe('postgres')
    })

    it('runtime config 始终使用真实 embedding provider kind', () => {
        expect(getUserMemoryRuntimeConfig({}, 'test')).toEqual(
            expect.objectContaining({
                semanticEmbeddingProviderKind: 'volcengine-ark-doubao-openai-compatible',
                storeMode: 'postgres',
            })
        )
    })

    it('doubao embedding endpoint 使用配置的 Ark baseURL 直接拼接 embeddings 路径', () => {
        expect(resolveDoubaoEmbeddingsEndpoint('https://ark.cn-beijing.volces.com/api/plan/v3')).toBe(
            'https://ark.cn-beijing.volces.com/api/plan/v3/embeddings'
        )
        expect(resolveDoubaoEmbeddingsEndpoint('https://ark.cn-beijing.volces.com/api/plan/v3/embeddings')).toBe(
            'https://ark.cn-beijing.volces.com/api/plan/v3/embeddings'
        )
    })

    it('doubao embeddings 使用 Ark OpenAI-compatible request shape', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            json: vi.fn().mockResolvedValue({
                data: [
                    {
                        embedding: [0.1, 0.2, 0.3],
                    },
                ],
            }),
            ok: true,
        })
        const embeddings = createDoubaoEmbeddings({
            apiKey: 'test-doubao-key',
            baseURL: 'https://ark.cn-beijing.volces.com/api/plan/v3',
            dimensions: 3,
            fetchImpl: fetchMock,
            model: 'doubao-embedding-vision',
            timeoutMs: 1500,
        })

        await expect(embeddings.embedQuery('用户喜欢吃桃子。')).resolves.toEqual([0.1, 0.2, 0.3])

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0] ?? []

        expect(url).toBe('https://ark.cn-beijing.volces.com/api/plan/v3/embeddings')
        expect(init).toEqual(
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-doubao-key',
                    'Content-Type': 'application/json',
                }),
                method: 'POST',
            })
        )

        const parsedBody = JSON.parse(String(init?.body))
        expect(parsedBody).toEqual({
            dimensions: 3,
            encoding_format: 'float',
            input: ['用户喜欢吃桃子。'],
            model: 'doubao-embedding-vision',
        })
    })

    it('postgres 缺少 DATABASE_URL 时抛错', () => {
        expect(() => getUserMemoryStore({ ...getUserMemoryRuntimeConfig({}, 'production'), storeMode: 'postgres' }, {})).toThrow(
            'DATABASE_URL is required when AI_MIND_USER_MEMORY_STORE=postgres.'
        )
    })

    it('UserMemory 使用独立 postgres schema', () => {
        expect(USER_MEMORY_POSTGRES_SCHEMA).toBe('langgraph_user_memory')
    })

    it('空 connection string 不创建 postgres store', () => {
        expect(() => createPostgresUserMemoryStore(' ')).toThrow('DATABASE_URL is required when AI_MIND_USER_MEMORY_STORE=postgres.')
    })

    it('同进程 postgres store 不允许静默切换 DATABASE_URL', () => {
        const config = { ...getUserMemoryRuntimeConfig({}, 'production'), storeMode: 'postgres' as const }
        getUserMemoryStore(config, {
            AI_MIND_DOUBAO_API_KEY: 'test-doubao-key',
            AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS: '2048',
            DATABASE_URL: 'postgres://first',
        })

        expect(() =>
            getUserMemoryStore(config, {
                AI_MIND_DOUBAO_API_KEY: 'test-doubao-key',
                AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS: '2048',
                DATABASE_URL: 'postgres://second',
            })
        ).toThrow('The process-level UserMemory Postgres store cannot switch DATABASE_URL at runtime.')
    })

    it('同一 DATABASE_URL 下 semantic 配置变化会重建 postgres store', () => {
        const config = { ...getUserMemoryRuntimeConfig({}, 'production'), storeMode: 'postgres' as const }
        const env = {
            AI_MIND_DOUBAO_API_KEY: 'test-doubao-key',
            AI_MIND_DOUBAO_BASE_URL: 'https://ark.cn-beijing.volces.com/api/plan/v3',
            AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS: '1024',
            DATABASE_URL: 'postgres://same',
        }

        const first = getUserMemoryStore(config, env)
        const second = getUserMemoryStore(
            {
                ...config,
                semanticIndexVersion: 'user-memory-semantic.next',
            },
            env
        )

        expect(second).not.toBe(first)
    })

    it('setup helper 在缺少 DATABASE_URL 时失败，并保持安全错误消息', async () => {
        await expect(
            runUserMemoryStoreSetup({
                env: {},
                loadEnv: vi.fn(),
                log: vi.fn(),
            })
        ).rejects.toThrow('DATABASE_URL is required to set up the UserMemory LangGraph Postgres store.')
    })

    it('setup helper 成功后会输出固定成功消息并关闭 store', async () => {
        const setup = vi.fn().mockResolvedValue(undefined)
        const stop = vi.fn().mockResolvedValue(undefined)
        const log = vi.fn()

        await runUserMemoryStoreSetup({
            createStore: vi.fn().mockReturnValue({
                setup,
                stop,
            }),
            env: {
                AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS: '2048',
                DATABASE_URL: 'postgres://user:secret@example.com/db',
            },
            loadEnv: vi.fn(),
            log,
        })

        expect(setup).toHaveBeenCalledTimes(1)
        expect(stop).toHaveBeenCalledTimes(1)
        expect(log).toHaveBeenCalledWith(USER_MEMORY_SETUP_SUCCESS_MESSAGE)
    })

    it('setup helper 在 setup 失败时返回脱敏错误，不泄漏 DATABASE_URL', async () => {
        const stop = vi.fn().mockResolvedValue(undefined)

        await expect(
            runUserMemoryStoreSetup({
                createStore: vi.fn().mockReturnValue({
                    setup: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED postgres://user:secret@example.com/db')),
                    stop,
                }),
                env: {
                    AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS: '2048',
                    DATABASE_URL: 'postgres://user:secret@example.com/db',
                },
                loadEnv: vi.fn(),
                log: vi.fn(),
            })
        ).rejects.toThrow('UserMemory PostgresStore setup failed (Error).')

        expect(stop).toHaveBeenCalledTimes(1)
    })
})
