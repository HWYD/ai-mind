import { describe, expect, it } from 'vitest'

import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'

describe('runtime/version-plan-tasklist-agent runtime config', () => {
    it('默认关闭 graph 附加能力', () => {
        expect(getTasklistAgentRuntimeConfig({}, 'development')).toEqual({
            graphCheckpointMode: 'off',
            graphDebugViewEnabled: false,
            graphEventsEnabled: false,
        })
    })

    it('允许独立开启 graph events、checkpoint 和 debug summary', () => {
        expect(
            getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'memory',
                    AI_MIND_GRAPH_DEBUG_VIEW: 'on',
                    AI_MIND_GRAPH_EVENTS: 'on',
                },
                'development'
            )
        ).toEqual({
            graphCheckpointMode: 'memory',
            graphDebugViewEnabled: true,
            graphEventsEnabled: true,
        })
    })

    it('非法 graph 附加配置按受控默认值 fail closed', () => {
        expect(
            getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'disk',
                    AI_MIND_GRAPH_DEBUG_VIEW: 'yes',
                    AI_MIND_GRAPH_EVENTS: 'true',
                },
                'development'
            )
        ).toEqual({
            graphCheckpointMode: 'off',
            graphDebugViewEnabled: false,
            graphEventsEnabled: false,
        })
    })

    it('历史 runtime env 已不参与配置解析，也不影响 Graph Runtime 执行', () => {
        expect(
            getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_EVENTS: 'on',
                    AI_MIND_TASKLIST_AGENT_RUNTIME: 'legacy',
                },
                'development'
            )
        ).toEqual({
            graphCheckpointMode: 'off',
            graphDebugViewEnabled: false,
            graphEventsEnabled: true,
        })
    })

    it('production 下允许显式开启 memory checkpoint', () => {
        expect(
            getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'memory',
                },
                'production'
            ).graphCheckpointMode
        ).toBe('memory')
    })
})
