import type { ChatComposerReference } from '@/lib/ai/types/chat'

import {
    VERSION_PLAN_TASKLIST_AGENT_LIMITS,
    VERSION_PLAN_TASKLIST_AGENT_NAME,
    type VersionPlanTasklistAgentAction,
    type VersionPlanTasklistAgentState,
} from './types'

const SUPPLEMENTAL_RESOURCE_URIS = new Set([
    'docs://README.md',
    'docs://architecture/capability-skill-surface.md',
    'docs://architecture/runtime-boundary.md',
    'docs://architecture/stream-core.md',
    'project://latest-context',
])

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
        artifacts: {},
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

            if (state.status !== 'plan_read') {
                // 补充上下文只能发生在读取方案之后、生成草稿之前，避免 Agent 越跑越发散。
                return {
                    reason: '补充上下文只能在 version plan 已读取、tasklist 尚未生成前读取。',
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
                      reason: '该资源不在 v0.1.0 Agent 允许读取的补充上下文范围内。',
                      success: false,
                  }
        }
        case 'draft_tasklist':
            if (state.status !== 'plan_read') {
                return {
                    reason: '必须先读取 version plan，才能生成 tasklist 草稿。',
                    success: false,
                }
            }

            return action.planUri === state.versionPlanReference.uri
                ? { success: true }
                : {
                      reason: 'tasklist 草稿必须基于本轮显式引用的 version plan。',
                      success: false,
                  }
        case 'call_tool':
            // v0.1.0 只保留结构校验这个受控工具；其他质量检查不进入本版 Agent 链路。
            return state.status === 'drafted_v1' || state.status === 'revised_v2'
                ? { success: true }
                : {
                      reason: '只有生成 tasklist 草稿后，才能执行结构校验。',
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
                      reason: `tasklist 自动修正次数已达到上限 ${state.limits.maxDraftRevisions}。`,
                      success: false,
                  }
        case 'final_answer':
            // final 必须在结构校验之后，确保最终输出至少经过一次 deterministic Quality Gate。
            return state.status === 'validated_v1' || state.status === 'validated_v2'
                ? { success: true }
                : {
                      reason: '最终回答前必须完成 tasklist 结构校验。',
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
                status: 'plan_read',
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
