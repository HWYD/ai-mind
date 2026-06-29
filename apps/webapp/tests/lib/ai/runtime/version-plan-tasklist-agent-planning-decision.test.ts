import { AIMessage } from '@langchain/core/messages'
import { describe, expect, it, vi } from 'vitest'

import type { ChatSession } from '@/lib/ai/runtime/types'
import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import {
    applyVersionPlanTasklistGraphStateUpdate,
    createInitialVersionPlanTasklistGraphState,
    type VersionPlanTasklistGraphStateAnnotationState,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'
import {
    applyVersionPlanTasklistGraphAction,
    buildPlanningDecisionMessages,
    generateTasklistStrategy,
    parseVersionPlanTasklistPlanningDecisionAction,
    parseVersionPlanTasklistPlanningDecisionText,
    parseVersionPlanTasklistStrategy,
    validateVersionPlanTasklistGraphAction,
    type VersionPlanTasklistAgentAction,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

const planUri = 'demo://version-plans/v0.1.1-controlled-planner-lite.md'

const versionPlanReference: ChatComposerReference = {
    id: planUri,
    label: 'v0.1.1-controlled-planner-lite.md',
    source: 'local',
    type: 'resource',
    uri: planUri,
}

function createPlanReadState() {
    return applyAction(createInitialState(), {
        type: 'read_resource',
        resourceUri: planUri,
        reason: '读取测试 version plan。',
    })
}

function createInitialState() {
    return {
        ...createInitialVersionPlanTasklistGraphState({
            conversationId: 'conversation-planning-decision',
            runId: 'run-planning-decision',
            runtimeConfig: getTasklistAgentRuntimeConfig({}, 'development'),
            userGoal: '生成 tasklist',
            versionPlanReference,
        }),
        output: undefined,
        source: {
            versionPlanReference,
            versionPlan: {
                extract: {
                    goals: ['接入 Planning Decision'],
                    interfaceChanges: ['GraphState 记录 planning artifact'],
                    keyChanges: ['新增有限决策'],
                    nonGoals: ['不写 docs 文件'],
                    summary: '从固定流程升级到有限决策。',
                    targetVersion: 'v0.1.1',
                    testPlan: ['验证 tasklist agent graph'],
                    title: 'v0.1.1 Controlled Planner Lite',
                },
                reference: versionPlanReference,
                uri: planUri,
            },
        },
    }
}

function createPlanningPromptState(state: VersionPlanTasklistGraphStateAnnotationState) {
    return {
        artifacts: {
            planning: state.planning,
            versionPlan: state.source.versionPlan,
        },
        versionPlanReference: state.source.versionPlanReference,
    }
}

function applyAction(state: VersionPlanTasklistGraphStateAnnotationState, action: VersionPlanTasklistAgentAction) {
    return applyVersionPlanTasklistGraphStateUpdate(state, applyVersionPlanTasklistGraphAction(state, action))
}

function createReadinessCheckedState() {
    return applyAction(createPlanReadState(), {
        type: 'check_plan_readiness',
        reason: '完成 rule-based readiness 检查。',
    })
}

function createOptionalContextReadState() {
    const planningDecidedState = applyAction(createReadinessCheckedState(), {
        type: 'planning_decision',
        decision: {
            type: 'read_optional_context',
            resourceUri: 'demo://governance/delivery-boundaries.md',
            reason: '需要补读 Runtime 边界。',
        },
        reason: '记录 Planning Decision。',
    })

    return applyAction(planningDecidedState, {
        type: 'read_resource',
        resourceUri: 'demo://governance/delivery-boundaries.md',
        reason: '读取白名单补充上下文。',
    })
}

describe('runtime/version-plan-tasklist-agent planning decision schema', () => {
    it('5 类合法 PlanningDecisionAction 能通过 schema', () => {
        const actions = [
            {
                type: 'proceed_to_tasklist_strategy',
                reason: '信息完整，可以继续。',
            },
            {
                type: 'read_optional_context',
                resourceUri: 'demo://governance/delivery-boundaries.md',
                reason: '需要补读 Runtime 边界。',
            },
            {
                type: 'ask_clarification',
                question: '请补充这个版本的核心目标是什么？',
                reason: '缺少关键目标。',
            },
            {
                type: 'proceed_with_manual_review_items',
                reviewItems: [
                    {
                        title: 'Test Plan 较粗',
                        detail: '版本方案可以继续拆分，但测试计划需要实现前人工确认。',
                        severity: 'warning',
                    },
                ],
                reason: '存在弱项但不阻塞继续。',
            },
            {
                type: 'stop_with_boundary_message',
                message: '当前输入不是 version plan，无法生成 tasklist。',
                reason: '请求越过 Agent 边界。',
            },
        ]

        expect(actions.map(action => parseVersionPlanTasklistPlanningDecisionAction(action).success)).toEqual([
            true,
            true,
            true,
            true,
            true,
        ])
    })

    it('非白名单 optional context resourceUri 会被拒绝', () => {
        const result = parseVersionPlanTasklistPlanningDecisionAction({
            type: 'read_optional_context',
            resourceUri: 'demo://tasklists/v0.1.0.md',
            reason: '不能读 tasklist。',
        })

        expect(result.success).toBe(false)
    })

    it('过多 reviewItems 会被拒绝', () => {
        const result = parseVersionPlanTasklistPlanningDecisionAction({
            type: 'proceed_with_manual_review_items',
            reviewItems: Array.from({ length: 6 }, (_, index) => ({
                title: `复核点 ${index + 1}`,
                detail: '需要人工确认。',
                severity: 'info',
            })),
            reason: '复核点过多。',
        })

        expect(result.success).toBe(false)
    })

    it('未知 action type 会被拒绝', () => {
        const result = parseVersionPlanTasklistPlanningDecisionAction({
            type: 'write_tasklist_file',
            reason: '不允许写文件。',
        })

        expect(result.success).toBe(false)
    })

    it('Planner 输出不是合法 JSON 时 fail closed', () => {
        const result = parseVersionPlanTasklistPlanningDecisionText('not json')

        expect(result.success).toBe(false)
        expect(result.error).toBe('规划决策不是合法 JSON。')
    })

    it('Planner 输出合法 JSON 但不符合 schema 时 fail closed', () => {
        const result = parseVersionPlanTasklistPlanningDecisionText(
            JSON.stringify({
                type: 'ask_clarification',
                reason: '缺少问题字段。',
            })
        )

        expect(result.success).toBe(false)
    })

    it('planning decision prompt 明确要求 proceed_with_manual_review_items 输出非空 reviewItems', () => {
        const messages = buildPlanningDecisionMessages(createPlanningPromptState(createReadinessCheckedState()), '生成 tasklist')
        const systemPrompt = String(messages[0]?.content ?? '')

        expect(systemPrompt).toContain('proceed_with_manual_review_items')
        expect(systemPrompt).toContain('必须输出 reviewItems')
        expect(systemPrompt).toContain('"reviewItems": [')
        expect(systemPrompt).toContain('"type": "proceed_with_manual_review_items"')
    })
})

describe('runtime/version-plan-tasklist-agent tasklist strategy schema', () => {
    it('接受固定枚举结构并保留可选 notes', () => {
        const result = parseVersionPlanTasklistStrategy({
            granularity: 'medium',
            grouping: 'by_phase',
            notes: '  先实现核心 Runtime。  ',
            priorityFocus: ['core_runtime', 'tests'],
            stepCountRange: '5-8',
        })

        expect(result).toEqual({
            strategy: {
                granularity: 'medium',
                grouping: 'by_phase',
                notes: '先实现核心 Runtime。',
                priorityFocus: ['core_runtime', 'tests'],
                stepCountRange: '5-8',
            },
            success: true,
        })
    })

    it('拒绝旧版自由文本策略结构', () => {
        const result = parseVersionPlanTasklistStrategy({
            expectedStepRange: [3, 5],
            granularity: 'medium',
            grouping: ['按阶段'],
            priority: ['Runtime'],
            reason: '旧版策略。',
        })

        expect(result.success).toBe(false)
    })

    it('拒绝重复 priorityFocus 和额外字段', () => {
        expect(
            parseVersionPlanTasklistStrategy({
                granularity: 'medium',
                grouping: 'by_phase',
                priorityFocus: ['tests', 'tests'],
                stepCountRange: '3-5',
            }).success
        ).toBe(false)

        expect(
            parseVersionPlanTasklistStrategy({
                granularity: 'medium',
                grouping: 'by_phase',
                priorityFocus: ['tests'],
                reason: '不属于 v0.3.0 strategy 契约。',
                stepCountRange: '3-5',
            }).success
        ).toBe(false)
    })

    it('拒绝空 priorityFocus 和超长 notes', () => {
        expect(
            parseVersionPlanTasklistStrategy({
                granularity: 'medium',
                grouping: 'by_phase',
                priorityFocus: [],
                stepCountRange: '3-5',
            }).success
        ).toBe(false)

        expect(
            parseVersionPlanTasklistStrategy({
                granularity: 'medium',
                grouping: 'by_phase',
                notes: 'a'.repeat(501),
                priorityFocus: ['tests'],
                stepCountRange: '3-5',
            }).success
        ).toBe(false)
    })
})

describe('runtime/version-plan-tasklist-agent planning decision state machine', () => {
    it('plan_read 不能绕过 Planning Decision 直接 draft', () => {
        const guardResult = validateVersionPlanTasklistGraphAction(createPlanReadState(), {
            type: 'draft_tasklist',
            goal: '绕过 planner 直接生成 tasklist',
            planUri,
            reason: '不应该允许。',
        })

        expect(guardResult.success).toBe(false)
    })

    it('plan_read 不能直接读取 optional context', () => {
        const guardResult = validateVersionPlanTasklistGraphAction(createPlanReadState(), {
            type: 'read_resource',
            resourceUri: 'demo://scenarios/request-limit-banner/context.md',
            reason: '未经过 Planning Decision 不能补读上下文。',
        })

        expect(guardResult.success).toBe(false)
    })

    it('非 read_optional_context 决策后不能读取 optional context', () => {
        const planningDecidedState = applyAction(createReadinessCheckedState(), {
            type: 'planning_decision',
            decision: {
                type: 'proceed_to_tasklist_strategy',
                reason: '信息完整，可以继续。',
            },
            reason: '记录 Planning Decision。',
        })
        const guardResult = validateVersionPlanTasklistGraphAction(planningDecidedState, {
            type: 'read_resource',
            resourceUri: 'demo://governance/delivery-boundaries.md',
            reason: 'proceed 决策后不应再补读上下文。',
        })

        expect(guardResult.success).toBe(false)
    })

    it('read_optional_context 后只能读取决策指定的 resourceUri', () => {
        const planningDecidedState = applyAction(createReadinessCheckedState(), {
            type: 'planning_decision',
            decision: {
                type: 'read_optional_context',
                resourceUri: 'demo://governance/delivery-boundaries.md',
                reason: '需要补读 Runtime 边界。',
            },
            reason: '记录 Planning Decision。',
        })
        const guardResult = validateVersionPlanTasklistGraphAction(planningDecidedState, {
            type: 'read_resource',
            resourceUri: 'demo://governance/engineering-rules.md',
            reason: '不能改读另一个白名单资源。',
        })

        expect(guardResult.success).toBe(false)
    })

    it('能推进 readiness_checked、planning_decided 和 strategy_decided 状态', () => {
        const readinessCheckedState = createReadinessCheckedState()
        const planningDecidedState = applyAction(readinessCheckedState, {
            type: 'planning_decision',
            decision: {
                type: 'proceed_to_tasklist_strategy',
                reason: '信息完整，可以继续。',
            },
            reason: '记录 Planning Decision。',
        })
        const strategyDecidedState = applyAction(planningDecidedState, {
            type: 'decide_tasklist_strategy',
            strategy: {
                granularity: 'medium',
                grouping: 'by_phase',
                notes: '先接状态机，再补测试。',
                priorityFocus: ['state_model', 'tests'],
                stepCountRange: '3-5',
            },
            reason: '进入 tasklist 拆分策略判断。',
        })

        expect(readinessCheckedState.execution.status).toBe('readiness_checked')
        expect(planningDecidedState.execution.status).toBe('planning_decided')
        expect(strategyDecidedState.execution.status).toBe('strategy_decided')
    })

    it('read_optional_context 决策后最多能读取一个白名单补充上下文', () => {
        const planningDecidedState = applyAction(createReadinessCheckedState(), {
            type: 'planning_decision',
            decision: {
                type: 'read_optional_context',
                resourceUri: 'demo://governance/delivery-boundaries.md',
                reason: '需要补读 Runtime 边界。',
            },
            reason: '记录 Planning Decision。',
        })
        const optionalContextReadState = applyAction(planningDecidedState, {
            type: 'read_resource',
            resourceUri: 'demo://governance/delivery-boundaries.md',
            reason: '读取白名单补充上下文。',
        })
        const guardResult = validateVersionPlanTasklistGraphAction(optionalContextReadState, {
            type: 'read_resource',
            resourceUri: 'demo://governance/engineering-rules.md',
            reason: '尝试读取第二个补充上下文。',
        })

        expect(optionalContextReadState.execution.status).toBe('optional_context_read')
        expect(optionalContextReadState.execution.counters.optionalContextReads).toBe(1)
        expect(guardResult.success).toBe(false)
    })

    it('optional_context_read 后可单独生成 strategy', async () => {
        const strategy = {
            granularity: 'medium',
            grouping: 'by_phase',
            notes: '补充上下文读取后先处理 Runtime 边界，再补测试。',
            priorityFocus: ['core_runtime', 'tests'],
            stepCountRange: '5-8',
        }
        const model = {
            invoke: vi.fn().mockResolvedValue(new AIMessage({ content: JSON.stringify(strategy) })),
        } as unknown as ChatSession['baseModel']

        const result = await generateTasklistStrategy(model, createPlanningPromptState(createOptionalContextReadState()), '生成 tasklist')

        expect(result.stepCountRange).toBe('5-8')
        expect(result.grouping).toBe('by_phase')
        expect(result.priorityFocus).toEqual(['core_runtime', 'tests'])
        expect(model.invoke).toHaveBeenCalledTimes(1)
    })

    it('ask_clarification 后进入 stopped，不能继续推进 draft', () => {
        const stoppedState = applyAction(createReadinessCheckedState(), {
            type: 'planning_decision',
            decision: {
                type: 'ask_clarification',
                question: '请补充版本目标。',
                reason: '缺少关键目标。',
            },
            reason: '记录澄清决策。',
        })
        const guardResult = validateVersionPlanTasklistGraphAction(stoppedState, {
            type: 'draft_tasklist',
            goal: '继续生成 tasklist',
            planUri,
            reason: 'stopped 后不应继续。',
        })

        expect(stoppedState.execution.status).toBe('stopped')
        expect(guardResult.success).toBe(false)
    })

    it('stop_with_boundary_message 后进入 stopped，不能继续推进 draft', () => {
        const stoppedState = applyAction(createReadinessCheckedState(), {
            type: 'planning_decision',
            decision: {
                type: 'stop_with_boundary_message',
                message: '当前请求越过 Agent 边界。',
                reason: '不能继续。',
            },
            reason: '记录边界停止决策。',
        })
        const guardResult = validateVersionPlanTasklistGraphAction(stoppedState, {
            type: 'draft_tasklist',
            goal: '继续生成 tasklist',
            planUri,
            reason: 'stopped 后不应继续。',
        })

        expect(stoppedState.execution.status).toBe('stopped')
        expect(guardResult.success).toBe(false)
    })

    it('超过 maxSteps = 20 后 fail closed', () => {
        const state = {
            ...createPlanReadState(),
            execution: {
                ...createPlanReadState().execution,
                counters: {
                    draftRevisions: 0,
                    optionalContextReads: 0,
                    steps: 20,
                    strategyRegenerations: 0,
                },
            },
        }
        const guardResult = validateVersionPlanTasklistGraphAction(state, {
            type: 'check_plan_readiness',
            reason: '超过 step 上限后不允许继续。',
        })

        expect(state.execution.limits.maxSteps).toBe(20)
        expect(guardResult.success).toBe(false)
    })
})
