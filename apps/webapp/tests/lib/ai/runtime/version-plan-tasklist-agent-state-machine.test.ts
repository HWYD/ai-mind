import { describe, expect, it } from 'vitest'

import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import {
    applyVersionPlanTasklistGraphStateUpdate,
    createInitialVersionPlanTasklistGraphState,
    type VersionPlanTasklistGraphStateAnnotationState,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'
import {
    applyVersionPlanTasklistGraphAction,
    parseVersionPlanTasklistAgentAction,
    type TasklistStrategy,
    validateVersionPlanTasklistGraphAction,
    type VersionPlanTasklistAgentAction,
    type WarningDisposition,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'
import type { TasklistValidationResult } from '@/lib/ai/tools/tasklist-structure'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

const planUri = 'demo://version-plans/v0.3.0-tasklist-agent-hitl-checkpoint-resume-mvp.md'

const versionPlanReference: ChatComposerReference = {
    id: planUri,
    label: 'v0.3.0 Tasklist Agent HITL Checkpoint Resume MVP',
    source: 'local',
    type: 'resource',
    uri: planUri,
}

const baseStrategy: TasklistStrategy = {
    granularity: 'medium',
    grouping: 'by_phase',
    notes: '先收状态，再接中断节点。',
    priorityFocus: ['state_model', 'tests'],
    stepCountRange: '5-8',
}

const editedStrategy: TasklistStrategy = {
    granularity: 'detailed',
    grouping: 'by_risk',
    notes: '增加 checkpoint 与 resume 风险拆分。',
    priorityFocus: ['state_model', 'compatibility', 'tests'],
    stepCountRange: '8-12',
}

const warningValidation: TasklistValidationResult = {
    blockingIssues: [],
    missingSections: ['暂停点'],
    revisionHints: ['补充 Step 完成后的暂停确认点。'],
    score: 88,
    status: 'warning',
    weakSections: [
        {
            autoFixable: true,
            code: 'missing_pause_point',
            issue: '缺少暂停点。',
            section: '暂停点',
            suggestion: '补充 Step 完成后的暂停确认点。',
        },
    ],
}

const passValidation: TasklistValidationResult = {
    blockingIssues: [],
    missingSections: [],
    revisionHints: [],
    score: 96,
    status: 'pass',
    weakSections: [],
}

const warningDisposition: WarningDisposition = {
    fixNow: ['missing_pause_point'],
    manualReviewItems: [],
    reason: '存在可自动修复的结构 warning。',
}

function createInitialState() {
    return {
        ...createInitialVersionPlanTasklistGraphState({
            conversationId: 'conversation-state-machine',
            runId: 'run-state-machine',
            runtimeConfig: getTasklistAgentRuntimeConfig({}, 'development'),
            userGoal: '生成 v0.3.0 tasklist',
            versionPlanReference,
        }),
        output: undefined,
    }
}

function applyAction(state: VersionPlanTasklistGraphStateAnnotationState, action: VersionPlanTasklistAgentAction) {
    return applyVersionPlanTasklistGraphStateUpdate(state, applyVersionPlanTasklistGraphAction(state, action))
}

function createStrategyDecidedState(strategy: TasklistStrategy = baseStrategy) {
    const planReadState = applyAction(createInitialState(), {
        reason: '读取 version plan。',
        resourceUri: planUri,
        type: 'read_resource',
    })
    const readinessCheckedState = applyAction(planReadState, {
        reason: '完成 readiness 检查。',
        type: 'check_plan_readiness',
    })
    const planningDecidedState = applyAction(readinessCheckedState, {
        decision: {
            reason: '信息足够，可以继续拆分策略。',
            type: 'proceed_to_tasklist_strategy',
        },
        reason: '记录 planning decision。',
        type: 'planning_decision',
    })

    return applyAction(planningDecidedState, {
        reason: '生成受控 tasklist strategy。',
        strategy,
        type: 'decide_tasklist_strategy',
    })
}

function createDraftedState() {
    const strategyReviewedState = applyAction(createStrategyDecidedState(), {
        decision: {
            type: 'approve',
        },
        reason: '用户确认 strategy。',
        type: 'apply_strategy_review_decision',
    })

    return applyAction(strategyReviewedState, {
        goal: '生成 v0.3.0 tasklist',
        planUri,
        reason: '生成 v1 草稿。',
        targetVersion: 'v0.3.0',
        type: 'draft_tasklist',
    })
}

function createWarningDispositionDecidedState() {
    const draftedState = applyVersionPlanTasklistGraphStateUpdate(createDraftedState(), {
        tasklist: {
            draft: {
                content: '# v0.3.0 Tasklist\n',
                createdAtStep: 6,
                planUri,
                targetVersion: 'v0.3.0',
                version: 1,
            },
        },
    })
    const validatedState = applyVersionPlanTasklistGraphStateUpdate(
        applyAction(draftedState, {
            arguments: {
                draftText: '# v0.3.0 Tasklist\n',
                planUri,
                targetVersion: 'v0.3.0',
            },
            reason: '校验 v1。',
            toolName: 'validate_tasklist_structure',
            type: 'call_tool',
        }),
        {
            tasklist: {
                draft: draftedState.tasklist.draft
                    ? {
                          ...draftedState.tasklist.draft,
                          validationV1: warningValidation,
                      }
                    : undefined,
            },
        }
    )

    return applyAction(validatedState, {
        disposition: warningDisposition,
        reason: warningDisposition.reason,
        type: 'decide_warning_disposition',
    })
}

describe('runtime/version-plan-tasklist-agent state machine HITL preparation', () => {
    it('accepts new HITL runtime action schemas', () => {
        expect(
            parseVersionPlanTasklistAgentAction({
                decision: {
                    type: 'edit',
                    strategy: editedStrategy,
                },
                reason: '用户编辑 strategy。',
                type: 'apply_strategy_review_decision',
            }).success
        ).toBe(true)
        expect(
            parseVersionPlanTasklistAgentAction({
                reason: '根据用户反馈重新生成 strategy。',
                strategy: editedStrategy,
                type: 'regenerate_tasklist_strategy',
            }).success
        ).toBe(true)
        expect(
            parseVersionPlanTasklistAgentAction({
                decision: {
                    markdown: '# Edited Tasklist\n',
                    type: 'edit',
                },
                reason: '用户编辑 tasklist markdown。',
                type: 'apply_tasklist_revision_review_decision',
            }).success
        ).toBe(true)
    })

    it('records strategy approve/edit/reject decisions without calling downstream steps', () => {
        const strategyDecidedState = createStrategyDecidedState()
        const approvedState = applyAction(strategyDecidedState, {
            decision: {
                type: 'approve',
            },
            reason: '用户确认 strategy。',
            type: 'apply_strategy_review_decision',
        })
        const editedState = applyAction(strategyDecidedState, {
            decision: {
                strategy: editedStrategy,
                type: 'edit',
            },
            reason: '用户编辑 strategy。',
            type: 'apply_strategy_review_decision',
        })
        const rejectedState = applyAction(strategyDecidedState, {
            decision: {
                reason: '范围不对。',
                type: 'reject',
            },
            reason: '用户拒绝 strategy。',
            type: 'apply_strategy_review_decision',
        })

        expect(approvedState.execution.status).toBe('strategy_reviewed')
        expect(approvedState.human.strategyReview).toMatchObject({
            decision: {
                type: 'approve',
            },
            reviewRound: 1,
        })
        expect(editedState.execution.status).toBe('strategy_reviewed')
        expect(editedState.planning.strategy).toEqual(editedStrategy)
        expect(rejectedState.execution.status).toBe('stopped')
    })

    it('allows strategy respond to regenerate once, then blocks a second respond', () => {
        const feedbackState = applyAction(createStrategyDecidedState(), {
            decision: {
                feedback: '请增加 resume 版本不匹配风险。',
                type: 'respond',
            },
            reason: '用户补充 strategy feedback。',
            type: 'apply_strategy_review_decision',
        })
        const regeneratedState = applyAction(feedbackState, {
            reason: '根据用户反馈重新生成 strategy。',
            strategy: editedStrategy,
            type: 'regenerate_tasklist_strategy',
        })
        const secondRespondGuard = validateVersionPlanTasklistGraphAction(regeneratedState, {
            decision: {
                feedback: '再补充一次。',
                type: 'respond',
            },
            reason: '第二次 respond 不应允许。',
            type: 'apply_strategy_review_decision',
        })
        const approvedRoundTwoState = applyAction(regeneratedState, {
            decision: {
                type: 'approve',
            },
            reason: '用户确认第二轮 strategy。',
            type: 'apply_strategy_review_decision',
        })

        expect(feedbackState.execution.status).toBe('strategy_feedback_received')
        expect(regeneratedState.execution.status).toBe('strategy_decided')
        expect(regeneratedState.execution.counters.strategyRegenerations).toBe(1)
        expect(secondRespondGuard.success).toBe(false)
        expect(approvedRoundTwoState.human.strategyReview?.reviewRound).toBe(2)
    })

    it('records tasklist revision review decisions and counts user edit as a controlled revision', () => {
        const warningState = createWarningDispositionDecidedState()
        const approvedState = applyAction(warningState, {
            decision: {
                type: 'approve',
            },
            reason: '用户允许模型修订。',
            type: 'apply_tasklist_revision_review_decision',
        })
        const respondedState = applyAction(warningState, {
            decision: {
                feedback: '修订时强调 checkpoint resume。',
                type: 'respond',
            },
            reason: '用户补充修订反馈。',
            type: 'apply_tasklist_revision_review_decision',
        })
        const editedState = applyAction(warningState, {
            decision: {
                markdown: '# Edited v2 Tasklist\n',
                type: 'edit',
            },
            reason: '用户直接编辑 markdown。',
            type: 'apply_tasklist_revision_review_decision',
        })
        const rejectedState = applyAction(warningState, {
            decision: {
                reason: '不接受当前草稿。',
                type: 'reject',
            },
            reason: '用户拒绝继续修订。',
            type: 'apply_tasklist_revision_review_decision',
        })

        expect(approvedState.execution.status).toBe('tasklist_revision_reviewed')
        expect(respondedState.execution.status).toBe('tasklist_revision_reviewed')
        expect(editedState.execution).toMatchObject({
            counters: {
                draftRevisions: 1,
            },
            status: 'revised_v2',
        })
        expect(editedState.tasklist.draft).toMatchObject({
            content: '# Edited v2 Tasklist\n',
            version: 2,
        })
        expect(rejectedState.execution.status).toBe('stopped')
    })

    it('allows at most two controlled draft revisions and writes validationV3 before final', () => {
        const reviewApprovedState = applyAction(createWarningDispositionDecidedState(), {
            decision: {
                type: 'approve',
            },
            reason: '用户允许第一轮模型修订。',
            type: 'apply_tasklist_revision_review_decision',
        })
        const revisedV2State = applyAction(reviewApprovedState, {
            reason: '生成 v2 修订草稿。',
            type: 'revise_tasklist',
        })
        const validatedV2State = applyVersionPlanTasklistGraphStateUpdate(
            applyAction(revisedV2State, {
                arguments: {
                    draftText: '# v2 Tasklist\n',
                    planUri,
                    targetVersion: 'v0.3.0',
                },
                reason: '校验 v2。',
                toolName: 'validate_tasklist_structure',
                type: 'call_tool',
            }),
            {
                tasklist: {
                    draft: revisedV2State.tasklist.draft
                        ? {
                              ...revisedV2State.tasklist.draft,
                              validationV2: warningValidation,
                          }
                        : undefined,
                },
            }
        )
        const secondWarningState = applyAction(validatedV2State, {
            disposition: warningDisposition,
            reason: 'v2 仍有 fixNow warning。',
            type: 'decide_warning_disposition',
        })
        const revisedV3State = applyAction(secondWarningState, {
            reason: '生成 v3 修订草稿。',
            type: 'revise_tasklist',
        })
        const validatedV3State = applyVersionPlanTasklistGraphStateUpdate(
            applyAction(revisedV3State, {
                arguments: {
                    draftText: '# v3 Tasklist\n',
                    planUri,
                    targetVersion: 'v0.3.0',
                },
                reason: '校验 v3。',
                toolName: 'validate_tasklist_structure',
                type: 'call_tool',
            }),
            {
                tasklist: {
                    draft: revisedV3State.tasklist.draft
                        ? {
                              ...revisedV3State.tasklist.draft,
                              validationV3: passValidation,
                          }
                        : undefined,
                },
            }
        )
        const thirdRevisionGuard = validateVersionPlanTasklistGraphAction(validatedV3State, {
            reason: '第三轮修订不应允许。',
            type: 'revise_tasklist',
        })
        const finalReadyState = applyAction(validatedV3State, {
            effect: {
                finalDecision: 'final',
                fixedIssues: ['missing_pause_point'],
                improved: true,
                remainingIssues: [],
                scoreAfter: 96,
                scoreBefore: 88,
            },
            reason: '评估 v1 到 v3 的修订效果。',
            type: 'evaluate_revision_effect',
        })
        const finalState = applyAction(finalReadyState, {
            reason: '输出最终答案。',
            type: 'final_answer',
        })

        expect(revisedV2State.tasklist.draft?.version).toBe(2)
        expect(revisedV3State.tasklist.draft?.version).toBe(3)
        expect(revisedV3State.execution.counters.draftRevisions).toBe(2)
        expect(validatedV3State.execution.status).toBe('validated_v3')
        expect(validatedV3State.tasklist.draft?.validationV3).toEqual(passValidation)
        expect(thirdRevisionGuard.success).toBe(false)
        expect(finalReadyState.execution.status).toBe('revision_effect_evaluated')
        expect(finalState.execution.status).toBe('final')
    })
})
