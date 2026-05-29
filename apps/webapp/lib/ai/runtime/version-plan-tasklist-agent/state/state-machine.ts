import type { ChatComposerReference } from '@/lib/ai/types/chat'

import {
    VERSION_PLAN_TASKLIST_AGENT_LIMITS,
    VERSION_PLAN_TASKLIST_AGENT_NAME,
    VERSION_PLAN_TASKLIST_OPTIONAL_CONTEXT_RESOURCE_URIS,
    type VersionPlanTasklistAgentAction,
    type VersionPlanTasklistAgentState,
} from '../contract/types'

const SUPPLEMENTAL_RESOURCE_URIS = new Set<string>(VERSION_PLAN_TASKLIST_OPTIONAL_CONTEXT_RESOURCE_URIS)

export interface AgentActionGuardResult {
    // validate 只返回结果，不修改 state；apply 才负责真正推进状态。
    reason?: string
    success: boolean
}

export function createInitialVersionPlanTasklistAgentState(options: {
    runId: string
    versionPlanReference: ChatComposerReference
}): VersionPlanTasklistAgentState {
    // 初始状态只保存用户显式引用的 version plan，不主动读取任何文件。
    return {
        agentName: VERSION_PLAN_TASKLIST_AGENT_NAME,
        artifacts: {
            planning: {
                manualReviewItems: [],
            },
        },
        counters: {
            draftRevisions: 0,
            optionalContextReads: 0,
            steps: 0,
        },
        limits: VERSION_PLAN_TASKLIST_AGENT_LIMITS,
        runId: options.runId,
        status: 'idle',
        versionPlanReference: options.versionPlanReference,
    }
}

// 状态机是 Agent 的硬边界：模型可以提出 action，但只有当前状态允许的 action 才会被执行。
export function validateVersionPlanTasklistAgentAction(
    state: VersionPlanTasklistAgentState,
    action: VersionPlanTasklistAgentAction
): AgentActionGuardResult {
    if (state.counters.steps >= state.limits.maxSteps) {
        return {
            reason: `Agent step 数已达到上限 ${state.limits.maxSteps}。`,
            success: false,
        }
    }

    switch (action.type) {
        case 'read_resource': {
            if (state.status === 'idle') {
                // 第一轮 read_resource 必须读取用户显式引用的 version plan，不能先读补充上下文。
                return action.resourceUri === state.versionPlanReference.uri
                    ? { success: true }
                    : {
                          reason: 'Agent 第一轮只能读取用户显式引用的 version plan。',
                          success: false,
                      }
            }

            if (state.status !== 'planning_decided') {
                // 补充上下文只能发生在规划决策明确选择 read_optional_context 之后，避免 Agent 越跑越发散。
                return {
                    reason: '补充上下文只能在规划决策明确选择 read_optional_context 后读取。',
                    success: false,
                }
            }

            const planningDecision = state.artifacts.planning.decision

            if (planningDecision?.type !== 'read_optional_context') {
                return {
                    reason: '当前规划决策没有授权读取补充上下文。',
                    success: false,
                }
            }

            if (action.resourceUri !== planningDecision.resourceUri) {
                return {
                    reason: '只能读取规划决策指定的补充上下文资源。',
                    success: false,
                }
            }

            if (state.counters.optionalContextReads >= state.limits.maxOptionalContextReads) {
                return {
                    reason: `补充上下文读取次数已达到上限 ${state.limits.maxOptionalContextReads}。`,
                    success: false,
                }
            }

            return SUPPLEMENTAL_RESOURCE_URIS.has(action.resourceUri)
                ? { success: true }
                : {
                      reason: '该资源不在当前 Agent 允许读取的补充上下文范围内。',
                      success: false,
                  }
        }
        case 'check_plan_readiness':
            return state.status === 'plan_read'
                ? { success: true }
                : {
                      reason: '只能在读取 version plan 后检查方案完整性。',
                      success: false,
                  }
        case 'planning_decision':
            return state.status === 'readiness_checked'
                ? { success: true }
                : {
                      reason: '只能在完成方案完整性检查后执行规划决策。',
                      success: false,
                  }
        case 'decide_tasklist_strategy':
            return state.status === 'planning_decided' || state.status === 'optional_context_read'
                ? { success: true }
                : {
                      reason: '只能在规划决策决定继续后判断任务清单拆分策略。',
                      success: false,
                  }
        case 'draft_tasklist':
            if (state.status !== 'strategy_decided') {
                return {
                    reason: '必须先完成规划决策和任务清单拆分策略判断，才能生成任务清单草稿。',
                    success: false,
                }
            }

            return action.planUri === state.versionPlanReference.uri
                ? { success: true }
                : {
                      reason: '任务清单草稿必须基于本轮显式引用的 version plan。',
                      success: false,
                  }
        case 'call_tool':
            // v0.1.0 只保留结构校验这个受控工具；其他质量检查不进入本版 Agent 链路。
            return state.status === 'drafted_v1' || state.status === 'revised_v2'
                ? { success: true }
                : {
                      reason: '只有生成任务清单草稿后，才能执行结构校验。',
                      success: false,
                  }
        case 'decide_warning_disposition':
            return state.status === 'validated_v1'
                ? { success: true }
                : {
                      reason: '只能在 v1 结构校验后判断 warning 处理方式。',
                      success: false,
                  }
        case 'evaluate_revision_effect':
            return state.status === 'validated_v1' || state.status === 'validated_v2'
                ? { success: true }
                : {
                      reason: '只能在任务清单结构校验后评估修正效果。',
                      success: false,
                  }
        case 'revise_tasklist':
            if (state.status !== 'validated_v1') {
                return {
                    reason: '只有 v1 结构校验后，才允许执行一次自动修正。',
                    success: false,
                }
            }

            return state.counters.draftRevisions < state.limits.maxDraftRevisions
                ? { success: true }
                : {
                      reason: `任务清单自动修正次数已达到上限 ${state.limits.maxDraftRevisions}。`,
                      success: false,
                  }
        case 'final_answer':
            // final 必须在结构校验和修正效果评估之后，确保最终输出有 deterministic Quality Gate 结论。
            return state.status === 'revision_effect_evaluated'
                ? { success: true }
                : {
                      reason: '最终回答前必须完成任务清单结构校验和修正效果评估。',
                      success: false,
                  }
        default:
            return {
                reason: '未知 Agent action。',
                success: false,
            }
    }
}

// apply 会再次调用 guard，避免未来调用方绕过 validate 直接推进非法状态。
export function applyVersionPlanTasklistAgentAction(
    state: VersionPlanTasklistAgentState,
    action: VersionPlanTasklistAgentAction
): VersionPlanTasklistAgentState {
    const guardResult = validateVersionPlanTasklistAgentAction(state, action)

    if (!guardResult.success) {
        throw new Error(guardResult.reason ?? 'Agent action 被 Runtime 状态机拒绝。')
    }

    const counters = {
        ...state.counters,
        steps: state.counters.steps + 1,
    }
    const artifacts = {
        ...state.artifacts,
    }

    switch (action.type) {
        case 'read_resource':
            if (state.status === 'idle') {
                artifacts.versionPlan = {
                    reference: state.versionPlanReference,
                    uri: action.resourceUri,
                }
            } else {
                counters.optionalContextReads += 1
            }

            return {
                ...state,
                artifacts,
                counters,
                status: state.status === 'idle' ? 'plan_read' : 'optional_context_read',
            }
        case 'check_plan_readiness':
            return {
                ...state,
                counters,
                status: 'readiness_checked',
            }
        case 'planning_decision':
            return {
                ...state,
                artifacts: {
                    ...artifacts,
                    planning: {
                        ...artifacts.planning,
                        decision: action.decision,
                        manualReviewItems:
                            action.decision.type === 'proceed_with_manual_review_items'
                                ? [...artifacts.planning.manualReviewItems, ...action.decision.reviewItems]
                                : artifacts.planning.manualReviewItems,
                    },
                },
                counters,
                status:
                    action.decision.type === 'ask_clarification' || action.decision.type === 'stop_with_boundary_message'
                        ? 'stopped'
                        : 'planning_decided',
            }
        case 'decide_tasklist_strategy':
            return {
                ...state,
                artifacts: {
                    ...artifacts,
                    planning: {
                        ...artifacts.planning,
                        strategy: action.strategy,
                    },
                },
                counters,
                status: 'strategy_decided',
            }
        case 'draft_tasklist':
            // 状态推进时只创建 artifact 槽位；真实 Markdown 草稿由受控生成阶段写入。
            artifacts.tasklistDraft = {
                content: '',
                createdAtStep: counters.steps,
                planUri: action.planUri,
                targetVersion: action.targetVersion,
                version: 1,
            }

            return {
                ...state,
                artifacts,
                counters,
                status: 'drafted_v1',
            }
        case 'call_tool':
            return {
                ...state,
                counters,
                status: state.status === 'revised_v2' ? 'validated_v2' : 'validated_v1',
            }
        case 'decide_warning_disposition':
            return {
                ...state,
                artifacts: {
                    ...artifacts,
                    planning: {
                        ...artifacts.planning,
                        // 只在不触发 v2 时把 disposition 的复核项并入最终复核点；如果会修正，待后续 revision effect 再判断剩余问题。
                        manualReviewItems:
                            action.disposition.fixNow.length === 0
                                ? [...artifacts.planning.manualReviewItems, ...action.disposition.manualReviewItems]
                                : artifacts.planning.manualReviewItems,
                        warningDisposition: action.disposition,
                    },
                },
                counters,
                status: 'validated_v1',
            }
        case 'evaluate_revision_effect':
            return {
                ...state,
                artifacts: {
                    ...artifacts,
                    planning: {
                        ...artifacts.planning,
                        revisionEffect: action.effect,
                    },
                },
                counters,
                status: 'revision_effect_evaluated',
            }
        case 'revise_tasklist':
            return {
                ...state,
                artifacts: {
                    ...artifacts,
                    tasklistDraft: artifacts.tasklistDraft
                        ? {
                              ...artifacts.tasklistDraft,
                              updatedAtStep: counters.steps,
                              version: 2,
                          }
                        : undefined,
                },
                counters: {
                    ...counters,
                    draftRevisions: counters.draftRevisions + 1,
                },
                status: 'revised_v2',
            }
        case 'final_answer':
            return {
                ...state,
                counters,
                status: 'final',
            }
        default:
            return state
    }
}
