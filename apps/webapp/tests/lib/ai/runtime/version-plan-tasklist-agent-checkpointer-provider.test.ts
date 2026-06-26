import { describe, expect, it } from 'vitest'

import {
    getVersionPlanTasklistCheckpointer,
    VERSION_PLAN_TASKLIST_CHECKPOINT_SCHEMA,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/checkpoint/checkpointer-provider'

describe('runtime/version-plan-tasklist-agent checkpointer provider', () => {
    it('off 不创建 checkpointer', () => {
        expect(getVersionPlanTasklistCheckpointer('off', {})).toBeUndefined()
    })

    it('memory 在进程内复用同一个实例', () => {
        const first = getVersionPlanTasklistCheckpointer('memory', {})
        const second = getVersionPlanTasklistCheckpointer('memory', {})

        expect(first).toBe(second)
    })

    it('postgres 缺少 DATABASE_URL 时 fail closed', () => {
        expect(() => getVersionPlanTasklistCheckpointer('postgres', {})).toThrow(
            'DATABASE_URL is required when AI_MIND_GRAPH_CHECKPOINT=postgres.'
        )
    })

    it('checkpoint 使用独立 PostgreSQL schema', () => {
        expect(VERSION_PLAN_TASKLIST_CHECKPOINT_SCHEMA).toBe('langgraph_checkpoint')
    })
})
