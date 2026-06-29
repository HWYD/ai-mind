import type { TasklistValidationResult } from '@/lib/ai/tools/tasklist-structure'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

import type { StrategyReviewDecision, TasklistRevisionReviewDecision } from './hitl-review-schema'
import type { TasklistStrategy } from './tasklist-strategy-schema'

export const VERSION_PLAN_TASKLIST_AGENT_NAME = 'version-plan-to-tasklist-agent'
export const VERSION_PLAN_TASKLIST_AGENT_VERSION = 'v0.3.0'
export const VERSION_PLAN_TASKLIST_GRAPH_VERSION = 'v0.3.0'

// 受控单 Agent 的预算上限集中放在这里，runner 只读取这些值，不在流程里散落 magic number。
export const VERSION_PLAN_TASKLIST_AGENT_LIMITS = {
    maxDraftRevisions: 2,
    maxOptionalContextReads: 1,
    maxSteps: 20,
    maxStrategyRegenerations: 1,
} as const

export const VERSION_PLAN_TASKLIST_OPTIONAL_CONTEXT_RESOURCE_URIS = [
    'demo://governance/delivery-boundaries.md',
    'demo://governance/engineering-rules.md',
    'demo://rubrics/plan-rubric.md',
    'demo://rubrics/task-rubric.md',
    'demo://rubrics/review-rubric.md',
    'project://latest-context',
] as const

export type VersionPlanTasklistOptionalContextResourceUri = (typeof VERSION_PLAN_TASKLIST_OPTIONAL_CONTEXT_RESOURCE_URIS)[number]

// Planner 类型只描述模型可参与判断的受控合同，不包含 Runtime 状态机自己的内部 action。
export interface VersionPlanTasklistManualReviewItem {
    detail: string
    severity: 'info' | 'warning'
    title: string
}

// 模型在 Planning Decision Step 中只能选择这 5 类安全 action。
// Runtime 会先做 schema 校验，再把 decision 映射为受控的内部状态推进。
export type PlanningDecisionAction =
    | {
          reason: string
          type: 'proceed_to_tasklist_strategy'
      }
    | {
          reason: string
          resourceUri: VersionPlanTasklistOptionalContextResourceUri
          type: 'read_optional_context'
      }
    | {
          question: string
          reason: string
          type: 'ask_clarification'
      }
    | {
          reason: string
          reviewItems: VersionPlanTasklistManualReviewItem[]
          type: 'proceed_with_manual_review_items'
      }
    | {
          message: string
          reason: string
          type: 'stop_with_boundary_message'
      }

export interface PlanningDecisionOutput {
    decision: PlanningDecisionAction
    strategy?: TasklistStrategy
}

export interface PlanReadinessResult {
    missingFields: string[]
    reason: string
    status: 'blocked' | 'needs_review' | 'ready'
    weakFields: string[]
}

export interface WarningDisposition {
    fixNow: string[]
    manualReviewItems: VersionPlanTasklistManualReviewItem[]
    reason: string
}

export interface RevisionEffectResult {
    finalDecision: 'blocked' | 'final' | 'final_with_manual_review_items'
    fixedIssues: string[]
    improved: boolean
    remainingIssues: string[]
    scoreAfter: number
    scoreBefore: number
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
    validationV3?: TasklistValidationResult
    version: 1 | 2 | 3
}

export interface VersionPlanTasklistPlanningArtifacts {
    decision?: PlanningDecisionAction
    manualReviewItems: VersionPlanTasklistManualReviewItem[]
    optionalContext?: {
        content?: string
        contentPreview?: string
        errorMessage?: string
        location: 'local' | 'remote'
        previewChars?: number
        resourceName: string
        serverId: string
        status: 'completed' | 'failed'
        uri: VersionPlanTasklistOptionalContextResourceUri
    }
    readiness?: PlanReadinessResult
    revisionEffect?: RevisionEffectResult
    strategy?: TasklistStrategy
    warningDisposition?: WarningDisposition
}

export interface VersionPlanTasklistIntermediateArtifacts {
    // 中间产物只存在本轮内存，不写入 docs、数据库或历史 tasklist。
    planning: VersionPlanTasklistPlanningArtifacts
    tasklistDraft?: VersionPlanTasklistDraftArtifact
    versionPlan?: {
        content?: string
        extract?: VersionPlanExtract
        reference: ChatComposerReference
        resourceName?: string
        uri: string
    }
}

// Runtime action 是状态机内部可执行动作，可以承载 Planner 的 decision，但不能等同于模型 allowed action。
// 所有 action 都会先经过 schema 校验，再由 state-machine 判断当前状态是否允许执行。
export type VersionPlanTasklistAgentAction =
    | {
          // 读取 version plan 或最多一个补充上下文。
          reason: string
          resourceUri: string
          type: 'read_resource'
      }
    | {
          // 使用 rule-based readiness 结果推进状态；不调用模型。
          reason: string
          type: 'check_plan_readiness'
      }
    | {
          // Runtime 记录一次有限规划决策；ask/stop 会直接结束本轮。
          decision: PlanningDecisionAction
          reason: string
          type: 'planning_decision'
      }
    | {
          // Runtime 记录任务清单拆分策略，后续 draft prompt 必须消费它。
          reason: string
          strategy: TasklistStrategy
          type: 'decide_tasklist_strategy'
      }
    | {
          // Strategy Review resume 后将用户决策写入 GraphState；不调用模型。
          decision: StrategyReviewDecision
          reason: string
          type: 'apply_strategy_review_decision'
      }
    | {
          // strategy respond 最多触发一次重新生成，重新生成后还要再次审核。
          reason: string
          strategy: TasklistStrategy
          type: 'regenerate_tasklist_strategy'
      }
    | {
          // 基于已读取的 version plan 生成任务清单草稿，不能从裸目标直接生成。
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
          toolName: 'validate_tasklist_structure'
          type: 'call_tool'
      }
    | {
          // 规则判断结构校验 warning 该自动修正还是进入人工复核点。
          disposition: WarningDisposition
          reason: string
          type: 'decide_warning_disposition'
      }
    | {
          // Tasklist Revision Review resume 后将用户决策写入 GraphState；edit 会直接形成修订版本。
          decision: TasklistRevisionReviewDecision
          reason: string
          type: 'apply_tasklist_revision_review_decision'
      }
    | {
          // 规则评估 v1 -> latest 的修正效果；不再触发新的修订。
          effect: RevisionEffectResult
          reason: string
          type: 'evaluate_revision_effect'
      }
    | {
          // 只允许在受控预算内推进到下一版 tasklist，最多生成 v3。
          reason: string
          type: 'revise_tasklist'
      }
    | {
          // 输出最终答案；正文和 artifact 由 Runtime 统一生成。
          reason: string
          type: 'final_answer'
      }

// execution.status 表示当前受控流程走到哪一步，状态机会用它判断下一步 action 是否允许执行。
// 通俗对照：
// - idle：刚开始，还没读版本方案。
// - plan_read：已经读取了用户显式引用的 version plan。
// - readiness_checked：已经用规则判断 version plan 是否可继续。
// - planning_decided：已经完成一次有限规划决策，并决定继续。
// - optional_context_read：已经读取最多一个白名单补充上下文。
// - strategy_decided：已经进入任务清单拆分策略判断之后。
// - strategy_reviewed：用户已经 approve/edit strategy，可以继续生成 draft。
// - strategy_feedback_received：用户通过 respond 要求重新生成 strategy。
// - drafted_v1：已经生成任务清单草稿 v1。
// - validated_v1：已经校验过 v1。
// - warning_disposition_decided：已经根据最新 validation 决定 fixNow / manual review。
// - tasklist_revision_reviewed：用户已经授权模型修订，或补充了修订反馈。
// - revised_v2 / revised_v3：已经生成对应修订版本。
// - validated_v2 / validated_v3：已经校验过对应修订版本。
// - revision_effect_evaluated：已经评估 v1 -> latest 的修正效果。
// - stopped：澄清问题、人工拒绝或边界提示已经结束本轮 Agent。
// - final：最终回答已输出。
export type VersionPlanTasklistAgentStatus =
    | 'drafted_v1'
    | 'final'
    | 'idle'
    | 'optional_context_read'
    | 'plan_read'
    | 'planning_decided'
    | 'readiness_checked'
    | 'revision_effect_evaluated'
    | 'revised_v2'
    | 'revised_v3'
    | 'stopped'
    | 'strategy_decided'
    | 'strategy_feedback_received'
    | 'strategy_reviewed'
    | 'tasklist_revision_reviewed'
    | 'validated_v1'
    | 'validated_v2'
    | 'validated_v3'
    | 'warning_disposition_decided'

export type {
    TasklistStrategy,
    TasklistStrategyGranularity,
    TasklistStrategyGrouping,
    TasklistStrategyPriorityFocus,
    TasklistStrategyStepCountRange,
} from './tasklist-strategy-schema'
