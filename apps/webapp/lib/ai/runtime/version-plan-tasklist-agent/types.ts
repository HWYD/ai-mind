import type { TasklistValidationResult } from '@/lib/ai/tools/tasklist-structure'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

export const VERSION_PLAN_TASKLIST_AGENT_NAME = 'version-plan-to-tasklist-agent'

// 受控单 Agent 的预算上限集中放在这里，后续 runner 只读取这些值，不在流程里散落 magic number。
export const VERSION_PLAN_TASKLIST_AGENT_LIMITS = {
    maxDraftRevisions: 1,
    maxOptionalContextReads: 1,
    maxSteps: 8,
} as const

// AgentState.status 表示“当前流程走到哪一步”，状态机会用它判断下一步 action 是否允许执行。
// 通俗对照：
// - idle：刚开始，还没读版本方案。
// - plan_read：已经读取了用户显式引用的 version plan。
// - drafted_v1：已经生成 tasklist 草稿 v1。
// - validated_v1：已经校验过 v1。
// - revised_v2：根据校验结果自动修正了一次，生成 v2。
// - validated_v2：已经校验过 v2。
// - final：最终回答已输出。
export type VersionPlanTasklistAgentStatus = 'drafted_v1' | 'final' | 'idle' | 'plan_read' | 'revised_v2' | 'validated_v1' | 'validated_v2'

export type VersionPlanTasklistToolName = 'validate_tasklist_structure'

// Planner 未来只能输出这几类 action；Runtime 会先做 Zod 校验，再交给状态机判断当前是否允许。
export type VersionPlanTasklistAgentAction =
    | {
          // 读取 version plan 或最多一个补充上下文。
          reason: string
          resourceUri: string
          type: 'read_resource'
      }
    | {
          // 基于已读取的 version plan 生成 tasklist 草稿，不能从裸目标直接生成。
          goal: string
          planUri: string
          reason: string
          targetVersion?: string
          type: 'draft_tasklist'
      }
    | {
          // 通过 Agent action 调用受控工具，而不是让模型自由 tool calling。
          arguments: Record<string, unknown>
          reason: string
          toolName: VersionPlanTasklistToolName
          type: 'call_tool'
      }
    | {
          // 只允许在 v1 结构校验后自动修正一次，生成 v2。
          reason: string
          type: 'revise_tasklist'
      }
    | {
          // 输出最终答案；Planner 只表达进入 final 阶段的原因，正文由 Runtime 统一生成。
          reason: string
          type: 'final_answer'
      }

// 从 version plan 里提取的最小结构化依据；它不是完整解析结果，只服务 draft 生成。
export interface VersionPlanExtract {
    goals: string[]
    interfaceChanges: string[]
    keyChanges: string[]
    nonGoals: string[]
    summary?: string
    targetVersion: string
    testPlan: string[]
    title?: string
}

export interface VersionPlanTasklistDraftArtifact {
    // 初始状态只占位；受控 draft action 真实执行时会写入 Markdown 草稿内容。
    content: string
    createdAtStep: number
    planUri: string
    targetVersion?: string
    updatedAtStep?: number
    validationV1?: TasklistValidationResult
    validationV2?: TasklistValidationResult
    version: 1 | 2
}

export interface VersionPlanTasklistIntermediateArtifacts {
    // 中间产物只存在本轮内存，不写入 docs、数据库或历史 tasklist。
    tasklistDraft?: VersionPlanTasklistDraftArtifact
    versionPlan?: {
        content?: string
        extract?: VersionPlanExtract
        reference: ChatComposerReference
        resourceName?: string
        uri: string
    }
}

// 这些计数器是 Agent 的“刹车片”：限制执行步数、补充上下文读取和自动修正次数。
//
// - steps：Agent action 执行了几步，最多 8 步。
// - draftRevisions：tasklist 最多自动修正 1 次，只能 v1 -> v2。
// - optionalContextReads：最多额外读取 1 个补充上下文。
export interface VersionPlanTasklistAgentCounters {
    draftRevisions: number
    optionalContextReads: number
    steps: number
}

// AgentState 是单轮 Agent 的唯一运行时事实源，runner 每执行一步都应返回新的 state。
export interface VersionPlanTasklistAgentState {
    agentName: typeof VERSION_PLAN_TASKLIST_AGENT_NAME
    artifacts: VersionPlanTasklistIntermediateArtifacts
    counters: VersionPlanTasklistAgentCounters
    limits: typeof VERSION_PLAN_TASKLIST_AGENT_LIMITS
    runId: string
    status: VersionPlanTasklistAgentStatus
    versionPlanReference: ChatComposerReference
}
