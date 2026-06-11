import { describe, expect, it } from 'vitest'

import type { VersionPlanTasklistAgentInvocation } from '@/lib/ai/runtime/version-plan-tasklist-agent'
import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import { selectTasklistAgentRuntime } from '@/lib/ai/runtime/version-plan-tasklist-agent/runtime/select-tasklist-agent-runtime'

const readyInvocation = {
    kind: 'ready',
    versionPlanReference: {
        id: 'docs://versions/v0.2.0.md',
        label: 'v0.2.0.md',
        source: 'local',
        type: 'resource',
        uri: 'docs://versions/v0.2.0.md',
    },
} satisfies VersionPlanTasklistAgentInvocation

describe('runtime/version-plan-tasklist-agent runtime config', () => {
    it('默认使用迁移期 legacy runtime，graph 附加能力关闭', () => {
        expect(getTasklistAgentRuntimeConfig({}, 'development')).toEqual({
            graphCheckpointMode: 'off',
            graphDebugViewEnabled: false,
            graphEventsEnabled: false,
            runtimeMode: 'legacy',
        })
    })

    it('显式开启 graph runtime 后才允许 graph events、checkpoint 和 debug summary', () => {
        expect(
            getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'memory',
                    AI_MIND_GRAPH_DEBUG_VIEW: 'on',
                    AI_MIND_GRAPH_EVENTS: 'on',
                    AI_MIND_TASKLIST_AGENT_RUNTIME: 'graph',
                },
                'development'
            )
        ).toEqual({
            graphCheckpointMode: 'memory',
            graphDebugViewEnabled: true,
            graphEventsEnabled: true,
            runtimeMode: 'graph',
        })
    })

    it('非法 env 值按受控默认值 fail closed', () => {
        expect(
            getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'disk',
                    AI_MIND_GRAPH_DEBUG_VIEW: 'yes',
                    AI_MIND_GRAPH_EVENTS: 'true',
                    AI_MIND_TASKLIST_AGENT_RUNTIME: 'auto',
                },
                'development'
            )
        ).toEqual({
            graphCheckpointMode: 'off',
            graphDebugViewEnabled: false,
            graphEventsEnabled: false,
            runtimeMode: 'legacy',
        })
    })

    it('production 下 memory checkpoint 强制关闭', () => {
        expect(
            getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'memory',
                    AI_MIND_TASKLIST_AGENT_RUNTIME: 'graph',
                },
                'production'
            ).graphCheckpointMode
        ).toBe('off')
    })

    it('legacy runtime 下即使显式开启 graph 附加能力也不生效', () => {
        expect(
            getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'memory',
                    AI_MIND_GRAPH_DEBUG_VIEW: 'on',
                    AI_MIND_GRAPH_EVENTS: 'on',
                    AI_MIND_TASKLIST_AGENT_RUNTIME: 'legacy',
                },
                'development'
            )
        ).toEqual({
            graphCheckpointMode: 'off',
            graphDebugViewEnabled: false,
            graphEventsEnabled: false,
            runtimeMode: 'legacy',
        })
    })
})

describe('runtime/version-plan-tasklist-agent runtime selector', () => {
    it('只对 ready invocation 选择 runtime', () => {
        expect(selectTasklistAgentRuntime(null)).toBeNull()
        expect(selectTasklistAgentRuntime({ kind: 'missing-version-plan' })).toBeNull()
    })

    it('ready invocation 使用传入配置选择 legacy 或 graph', () => {
        expect(
            selectTasklistAgentRuntime(readyInvocation, {
                graphCheckpointMode: 'off',
                graphDebugViewEnabled: false,
                graphEventsEnabled: false,
                runtimeMode: 'legacy',
            })?.runtimeMode
        ).toBe('legacy')

        expect(
            selectTasklistAgentRuntime(readyInvocation, {
                graphCheckpointMode: 'off',
                graphDebugViewEnabled: true,
                graphEventsEnabled: true,
                runtimeMode: 'graph',
            })?.runtimeMode
        ).toBe('graph')
    })
})
