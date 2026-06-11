import { AIMessage } from '@langchain/core/messages'
import { describe, expect, it, vi } from 'vitest'

import type { ChatSession } from '@/lib/ai/runtime/types'
import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import { createVersionPlanTasklistGraph } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/create-version-plan-tasklist-graph'

describe('runtime/version-plan-tasklist-agent graph create', () => {
    it('创建包含真实 node / edge 的可编译 StateGraph', () => {
        const model = {
            invoke: vi.fn().mockResolvedValue(new AIMessage({ content: '{}' })),
        } as unknown as ChatSession['baseModel']

        expect(
            createVersionPlanTasklistGraph({
                runtime: {
                    context: {},
                    model,
                    runtimeConfig: getTasklistAgentRuntimeConfig({}, 'development'),
                    userGoal: '生成 v0.2.0 tasklist',
                    writeChunk: vi.fn(),
                },
            })
        ).toBeTruthy()
    })
})
