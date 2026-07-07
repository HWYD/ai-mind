import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    createPostgresUserMemoryStore,
    getUserMemoryRuntimeConfig,
    getUserMemoryStore,
    resetUserMemoryStoreForTests,
    USER_MEMORY_POSTGRES_SCHEMA,
} from '@/lib/ai/runtime/user-memory'

import { runUserMemoryStoreSetup, USER_MEMORY_SETUP_SUCCESS_MESSAGE } from '../../../../scripts/setup-user-memory-store-lib.mjs'

describe('runtime/user-memory provider', () => {
    afterEach(() => {
        resetUserMemoryStoreForTests()
    })

    it('development 默认使用 memory store', () => {
        expect(getUserMemoryRuntimeConfig({}, 'development').storeMode).toBe('memory')
    })

    it('production 默认使用 postgres store', () => {
        expect(getUserMemoryRuntimeConfig({}, 'production').storeMode).toBe('postgres')
    })

    it('非法 mode 回退到环境默认值', () => {
        expect(getUserMemoryRuntimeConfig({ AI_MIND_USER_MEMORY_STORE: 'invalid' }, 'development').storeMode).toBe('memory')
        expect(getUserMemoryRuntimeConfig({ AI_MIND_USER_MEMORY_STORE: 'invalid' }, 'production').storeMode).toBe('postgres')
    })

    it('memory 在进程内复用同一个实例', () => {
        const first = getUserMemoryStore({ ...getUserMemoryRuntimeConfig({}, 'development'), storeMode: 'memory' }, {})
        const second = getUserMemoryStore({ ...getUserMemoryRuntimeConfig({}, 'development'), storeMode: 'memory' }, {})

        expect(first).toBe(second)
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
        getUserMemoryStore(config, { DATABASE_URL: 'postgres://first' })

        expect(() => getUserMemoryStore(config, { DATABASE_URL: 'postgres://second' })).toThrow(
            'The process-level UserMemory Postgres store cannot switch DATABASE_URL at runtime.'
        )
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
                    DATABASE_URL: 'postgres://user:secret@example.com/db',
                },
                loadEnv: vi.fn(),
                log: vi.fn(),
            })
        ).rejects.toThrow('UserMemory PostgresStore setup failed (Error).')

        expect(stop).toHaveBeenCalledTimes(1)
    })
})
