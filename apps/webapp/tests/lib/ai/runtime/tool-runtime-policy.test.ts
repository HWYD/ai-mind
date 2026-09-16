import { describe, expect, it } from 'vitest'

import { getChatToolDefinitions } from '@/lib/ai/tools'
import { calculatorToolDefinition, calculatorToolSchema } from '@/lib/ai/tools/calculator-tool'
import { type ChatToolDefinition, createChatToolRegistry, parseToolExecutionPolicy, toolExecutionProfiles } from '@/lib/ai/tools/registry'

describe('runtime/tool-runtime ToolExecutionPolicy', () => {
    it('区分普通 Tool 与 Agent Tool，并拒绝跨类型字段', () => {
        expect(
            parseToolExecutionPolicy({
                attemptTimeoutMs: 1000,
                kind: 'standard-tool',
                profile: 'local-deterministic',
                retrySafe: true,
            })
        ).toEqual({
            attemptTimeoutMs: 1000,
            kind: 'standard-tool',
            profile: 'local-deterministic',
            retrySafe: true,
        })
        expect(
            parseToolExecutionPolicy({
                kind: 'agent-tool',
                profile: 'delegated-agent',
            })
        ).toEqual({
            kind: 'agent-tool',
            profile: 'delegated-agent',
        })
        expect(() =>
            parseToolExecutionPolicy({
                attemptTimeoutMs: 1000,
                kind: 'agent-tool',
                profile: 'delegated-agent',
            })
        ).toThrow()
    })

    it('校验 Profile 上限和正整数 Tool timeout', () => {
        expect(toolExecutionProfiles['local-deterministic'].maxAttemptTimeoutMs).toBe(5000)
        expect(toolExecutionProfiles['remote-readonly'].maxAttemptTimeoutMs).toBe(20000)
        expect(() =>
            parseToolExecutionPolicy({
                attemptTimeoutMs: 5001,
                kind: 'standard-tool',
                profile: 'local-deterministic',
                retrySafe: true,
            })
        ).toThrow()
        expect(() =>
            parseToolExecutionPolicy({
                attemptTimeoutMs: 0,
                kind: 'standard-tool',
                profile: 'remote-readonly',
                retrySafe: true,
            })
        ).toThrow()
        expect(() =>
            parseToolExecutionPolicy({
                attemptTimeoutMs: 1500.5,
                kind: 'standard-tool',
                profile: 'remote-readonly',
                retrySafe: true,
            })
        ).toThrow()
    })

    it('timeout 与 retry 元数据不进入模型参数 schema', () => {
        expect(
            calculatorToolSchema.parse({
                attemptTimeoutMs: 4999,
                expression: '1 + 1',
                retrySafe: false,
            })
        ).toEqual({ expression: '1 + 1' })
    })

    it('要求每个注册项显式提供合法 policy，且拒绝同名冲突', () => {
        const invalidDefinition = {
            ...calculatorToolDefinition,
            executionPolicy: undefined,
        } as unknown as ChatToolDefinition

        expect(() => createChatToolRegistry([invalidDefinition])).toThrow()
        expect(() => createChatToolRegistry([calculatorToolDefinition, calculatorToolDefinition])).toThrow()
    })

    it('现有 Registry 工具均显式分类，只有普通 Tool 可进入通用 scope', () => {
        const definitions = getChatToolDefinitions()

        expect(definitions.every(definition => definition.executionPolicy)).toBe(true)
        expect(
            definitions
                .filter(definition => definition.runtimeScopes?.includes('general-react-agent'))
                .every(definition => definition.executionPolicy.kind === 'standard-tool')
        ).toBe(true)
    })
})
