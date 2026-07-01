import { describe, expect, it } from 'vitest'

import {
    createDeliveryChainSubagentTools,
    createRuntimeArtifact,
    deliveryChainDelegationPolicy,
    getDeliveryChainSubagentDefinitions,
    runtimeArtifactSchema,
    subagentToolCallInputSchema,
    subagentToolJsonResultSchema,
    validateDelegationToolCall,
} from '@/lib/ai/runtime/delivery-chain/manager'

describe('runtime/delivery-chain-manager contracts', () => {
    it('RuntimeArtifact schema 接受 run-local plan artifact', () => {
        const artifact = createRuntimeArtifact({
            kind: 'plan',
            markdown: '## 实现方案\n\n- 新增登录表单',
            source: {
                stage: 'plan',
                subagentId: 'plan-subagent',
            },
            title: 'Delivery Chain Plan',
        })

        expect(runtimeArtifactSchema.safeParse(artifact).success).toBe(true)
    })

    it('SubagentToolJsonResult 强 schema 会拒绝空 markdown', () => {
        const result = subagentToolJsonResultSchema.safeParse({
            markdown: '   ',
            status: 'completed',
            summaryForManager: '已生成 plan',
            warnings: [],
        })

        expect(result.success).toBe(false)
    })

    it('Manager tool call schema 只要求 invocationId', () => {
        expect(
            subagentToolCallInputSchema.safeParse({
                invocationId: 'invocation-1',
            }).success
        ).toBe(true)

        expect(
            subagentToolCallInputSchema.safeParse({
                contextBlocks: [],
                instruction: 'plan',
            }).success
        ).toBe(false)
    })

    it('Subagent definitions 声明独立边界和 non-goals', () => {
        const definitions = getDeliveryChainSubagentDefinitions()

        expect(definitions).toEqual([
            expect.objectContaining({
                id: 'plan-subagent',
                inputArtifactKinds: [],
                outputArtifactKinds: ['plan'],
            }),
            expect.objectContaining({
                id: 'task-subagent',
                inputArtifactKinds: ['plan'],
                outputArtifactKinds: ['tasks'],
            }),
            expect.objectContaining({
                id: 'review-subagent',
                inputArtifactKinds: ['plan', 'tasks'],
                outputArtifactKinds: ['review'],
            }),
        ])
        expect(definitions.every(definition => definition.allowedTools.length === 0)).toBe(true)
        expect(definitions.every(definition => definition.nonGoals.some(goal => goal.includes('Tasklist Agent')))).toBe(true)
    })

    it('Subagent chat tools are scoped to delivery-chain-manager', () => {
        const subagentTools = createDeliveryChainSubagentTools({
            model: {
                invoke: async () => {
                    throw new Error('unused in scope contract test')
                },
            } as never,
        })

        expect(
            subagentTools.every(
                subagentTool =>
                    subagentTool.chatToolDefinition.runtimeScopes?.length === 1 &&
                    subagentTool.chatToolDefinition.runtimeScopes[0] === 'delivery-chain-manager'
            )
        ).toBe(true)
    })

    it('Subagent definitions 的模型侧描述不绑定产品名或内部组件名', () => {
        const definitions = getDeliveryChainSubagentDefinitions()
        const modelFacingText = definitions.map(definition => [definition.description, definition.roleInstruction].join('\n')).join('\n')

        expect(modelFacingText).not.toContain('Delivery Chain requirement')
        expect(modelFacingText).not.toContain('Tasklist Agent')
        expect(modelFacingText).not.toContain('HITL')
    })

    it('DelegationPolicy 强制 plan -> task -> review 顺序和 maxToolCalls', () => {
        const planArtifact = createRuntimeArtifact({
            kind: 'plan',
            markdown: '## 实现方案\n\n- plan',
            source: {
                stage: 'plan',
                subagentId: 'plan-subagent',
            },
            title: 'Delivery Chain Plan',
        })
        const tasksArtifact = createRuntimeArtifact({
            kind: 'tasks',
            markdown: '## 任务拆解\n\n- task',
            source: {
                stage: 'task',
                subagentId: 'task-subagent',
            },
            title: 'Delivery Chain Tasks',
        })

        expect(deliveryChainDelegationPolicy.maxToolCalls).toBe(3)
        expect(
            validateDelegationToolCall({
                artifacts: [],
                expectedToolId: 'task-subagent',
                policy: deliveryChainDelegationPolicy,
                requestedToolId: 'task-subagent',
                toolCallsSoFar: 0,
            })
        ).toEqual(
            expect.objectContaining({
                summary: expect.stringContaining('缺少 plan artifact'),
            })
        )
        expect(
            validateDelegationToolCall({
                artifacts: [planArtifact],
                expectedToolId: 'review-subagent',
                policy: deliveryChainDelegationPolicy,
                requestedToolId: 'review-subagent',
                toolCallsSoFar: 1,
            })
        ).toEqual(
            expect.objectContaining({
                summary: expect.stringContaining('缺少必要 artifact'),
            })
        )
        expect(
            validateDelegationToolCall({
                artifacts: [planArtifact, tasksArtifact],
                expectedToolId: 'review-subagent',
                policy: deliveryChainDelegationPolicy,
                requestedToolId: 'review-subagent',
                toolCallsSoFar: 2,
            })
        ).toBeNull()
        expect(
            validateDelegationToolCall({
                artifacts: [planArtifact, tasksArtifact],
                expectedToolId: 'review-subagent',
                policy: deliveryChainDelegationPolicy,
                requestedToolId: 'review-subagent',
                toolCallsSoFar: 3,
            })
        ).toEqual(
            expect.objectContaining({
                summary: expect.stringContaining('超过最大委派次数'),
            })
        )
    })

    it('no Tasklist Agent boundary 通过 local definitions 保持隔离', () => {
        const definitions = getDeliveryChainSubagentDefinitions()

        expect(definitions.every(definition => definition.allowedTools.every(toolName => !toolName.includes('tasklist')))).toBe(true)
        expect(deliveryChainDelegationPolicy.allowParallel).toBe(false)
        expect(deliveryChainDelegationPolicy.allowNestedDelegation).toBe(false)
    })
})
