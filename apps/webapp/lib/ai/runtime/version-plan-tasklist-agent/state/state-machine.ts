import type { ChatComposerReference } from '@/lib/ai/types/chat'

import {
    VERSION_PLAN_TASKLIST_AGENT_LIMITS,
    VERSION_PLAN_TASKLIST_OPTIONAL_CONTEXT_RESOURCE_URIS,
    type VersionPlanTasklistAgentAction,
    type VersionPlanTasklistAgentStatus,
    type VersionPlanTasklistDraftArtifact,
    type VersionPlanTasklistPlanningArtifacts,
} from '../contract/types'
import type {
    VersionPlanTasklistGraphHumanState,
    VersionPlanTasklistGraphStateAnnotationState,
    VersionPlanTasklistGraphStatePatch,
} from '../graph/graph-state'

const SUPPLEMENTAL_RESOURCE_URIS = new Set<string>(VERSION_PLAN_TASKLIST_OPTIONAL_CONTEXT_RESOURCE_URIS)

export interface AgentActionGuardResult {
    reason?: string
    success: boolean
}

type StateMachineView = {
    counters: {
        draftRevisions: number
        optionalContextReads: number
        steps: number
        strategyRegenerations: number
    }
    draft?: VersionPlanTasklistDraftArtifact
    human: VersionPlanTasklistGraphHumanState
    limits: typeof VERSION_PLAN_TASKLIST_AGENT_LIMITS
    planning: VersionPlanTasklistPlanningArtifacts
    status: VersionPlanTasklistAgentStatus
    versionPlanReference: ChatComposerReference
}

function createGraphStateView(state: VersionPlanTasklistGraphStateAnnotationState): StateMachineView {
    return {
        counters: state.execution.counters,
        draft: state.tasklist.draft,
        human: state.human,
        limits: state.execution.limits,
        planning: state.planning,
        status: state.execution.status,
        versionPlanReference: state.source.versionPlanReference,
    }
}

function validateVersionPlanTasklistActionView(view: StateMachineView, action: VersionPlanTasklistAgentAction): AgentActionGuardResult {
    if (view.counters.steps >= view.limits.maxSteps) {
        return {
            reason: `Agent step limit reached: ${view.limits.maxSteps}.`,
            success: false,
        }
    }

    switch (action.type) {
        case 'read_resource': {
            if (view.status === 'idle') {
                return action.resourceUri === view.versionPlanReference.uri
                    ? { success: true }
                    : {
                          reason: 'The first resource read must target the explicit version plan.',
                          success: false,
                      }
            }

            if (view.status !== 'planning_decided') {
                return {
                    reason: 'Optional context can only be read after a read_optional_context planning decision.',
                    success: false,
                }
            }

            const planningDecision = view.planning.decision

            if (planningDecision?.type !== 'read_optional_context') {
                return {
                    reason: 'The current planning decision did not authorize optional context reading.',
                    success: false,
                }
            }

            if (action.resourceUri !== planningDecision.resourceUri) {
                return {
                    reason: 'Only the optional context resource selected by the planning decision can be read.',
                    success: false,
                }
            }

            if (view.counters.optionalContextReads >= view.limits.maxOptionalContextReads) {
                return {
                    reason: `Optional context read limit reached: ${view.limits.maxOptionalContextReads}.`,
                    success: false,
                }
            }

            return SUPPLEMENTAL_RESOURCE_URIS.has(action.resourceUri)
                ? { success: true }
                : {
                      reason: 'Optional context resource is not allowed for this agent.',
                      success: false,
                  }
        }
        case 'check_plan_readiness':
            return view.status === 'plan_read'
                ? { success: true }
                : {
                      reason: 'Plan readiness can only be checked after reading the version plan.',
                      success: false,
                  }
        case 'planning_decision':
            return view.status === 'readiness_checked'
                ? { success: true }
                : {
                      reason: 'Planning decision can only run after readiness check.',
                      success: false,
                  }
        case 'decide_tasklist_strategy':
            return view.status === 'planning_decided' || view.status === 'optional_context_read'
                ? { success: true }
                : {
                      reason: 'Tasklist strategy can only be decided after planning decision or optional context read.',
                      success: false,
                  }
        case 'apply_strategy_review_decision':
            if (view.status !== 'strategy_decided') {
                return {
                    reason: 'Strategy review decision can only be applied after strategy decision.',
                    success: false,
                }
            }

            return action.decision.type === 'respond' && view.counters.strategyRegenerations >= view.limits.maxStrategyRegenerations
                ? {
                      reason: `Strategy regeneration limit reached: ${view.limits.maxStrategyRegenerations}.`,
                      success: false,
                  }
                : { success: true }
        case 'regenerate_tasklist_strategy':
            if (view.status !== 'strategy_feedback_received') {
                return {
                    reason: 'Tasklist strategy can only be regenerated after strategy review feedback.',
                    success: false,
                }
            }

            return view.counters.strategyRegenerations < view.limits.maxStrategyRegenerations
                ? { success: true }
                : {
                      reason: `Strategy regeneration limit reached: ${view.limits.maxStrategyRegenerations}.`,
                      success: false,
                  }
        case 'draft_tasklist':
            if (view.status !== 'strategy_decided' && view.status !== 'strategy_reviewed') {
                return {
                    reason: 'Tasklist draft can only be generated after strategy decision.',
                    success: false,
                }
            }

            return action.planUri === view.versionPlanReference.uri
                ? { success: true }
                : {
                      reason: 'Tasklist draft must be generated from the explicit version plan.',
                      success: false,
                  }
        case 'call_tool':
            return view.status === 'drafted_v1' || view.status === 'revised_v2' || view.status === 'revised_v3'
                ? { success: true }
                : {
                      reason: 'Tasklist validation can only run after a draft exists.',
                      success: false,
                  }
        case 'decide_warning_disposition':
            return view.status === 'validated_v1' || view.status === 'validated_v2' || view.status === 'validated_v3'
                ? { success: true }
                : {
                      reason: 'Warning disposition can only run after validation.',
                      success: false,
                  }
        case 'apply_tasklist_revision_review_decision':
            if (view.status !== 'warning_disposition_decided') {
                return {
                    reason: 'Tasklist revision review decision can only be applied after warning disposition.',
                    success: false,
                }
            }

            if (!view.draft || view.draft.version !== 1) {
                return {
                    reason: 'Tasklist revision review is only allowed for the initial draft.',
                    success: false,
                }
            }

            if (!view.planning.warningDisposition || view.planning.warningDisposition.fixNow.length === 0) {
                return {
                    reason: 'Tasklist revision review requires fixNow findings.',
                    success: false,
                }
            }

            if (view.human.tasklistRevisionReview) {
                return {
                    reason: 'Tasklist revision review can only happen once per run.',
                    success: false,
                }
            }

            return action.decision.type !== 'reject' && view.counters.draftRevisions >= view.limits.maxDraftRevisions
                ? {
                      reason: `Tasklist revision limit reached: ${view.limits.maxDraftRevisions}.`,
                      success: false,
                  }
                : { success: true }
        case 'evaluate_revision_effect':
            return view.status === 'warning_disposition_decided' ||
                view.status === 'validated_v1' ||
                view.status === 'validated_v2' ||
                view.status === 'validated_v3'
                ? { success: true }
                : {
                      reason: 'Revision effect can only be evaluated after validation.',
                      success: false,
                  }
        case 'revise_tasklist':
            if (view.status !== 'warning_disposition_decided' && view.status !== 'tasklist_revision_reviewed') {
                return {
                    reason: 'Tasklist revision can only run after warning disposition or revision review.',
                    success: false,
                }
            }

            if (!view.draft || view.draft.version >= 3) {
                return {
                    reason: 'Tasklist revision requires a draft that can advance to the next controlled version.',
                    success: false,
                }
            }

            if (!view.planning.warningDisposition || view.planning.warningDisposition.fixNow.length === 0) {
                return {
                    reason: 'Tasklist revision requires fixNow findings.',
                    success: false,
                }
            }

            return view.counters.draftRevisions < view.limits.maxDraftRevisions
                ? { success: true }
                : {
                      reason: `Tasklist revision limit reached: ${view.limits.maxDraftRevisions}.`,
                      success: false,
                  }
        case 'final_answer':
            return view.status === 'revision_effect_evaluated'
                ? { success: true }
                : {
                      reason: 'Final answer can only be emitted after revision effect evaluation.',
                      success: false,
                  }
        default:
            return {
                reason: 'Unknown agent action.',
                success: false,
            }
    }
}

export function validateVersionPlanTasklistGraphAction(
    state: VersionPlanTasklistGraphStateAnnotationState,
    action: VersionPlanTasklistAgentAction
): AgentActionGuardResult {
    return validateVersionPlanTasklistActionView(createGraphStateView(state), action)
}

function assertActionAllowed(guardResult: AgentActionGuardResult) {
    if (!guardResult.success) {
        throw new Error(guardResult.reason ?? 'Agent action rejected by runtime state machine.')
    }
}

export function applyVersionPlanTasklistGraphAction(
    state: VersionPlanTasklistGraphStateAnnotationState,
    action: VersionPlanTasklistAgentAction
): VersionPlanTasklistGraphStatePatch {
    assertActionAllowed(validateVersionPlanTasklistGraphAction(state, action))

    const counters = {
        steps: state.execution.counters.steps + 1,
    }

    switch (action.type) {
        case 'read_resource':
            if (state.execution.status === 'idle') {
                return {
                    execution: {
                        counters,
                        status: 'plan_read',
                    },
                    source: {
                        versionPlan: {
                            reference: state.source.versionPlanReference,
                            uri: action.resourceUri,
                        },
                    },
                }
            }

            return {
                execution: {
                    counters: {
                        ...counters,
                        optionalContextReads: state.execution.counters.optionalContextReads + 1,
                    },
                    status: 'optional_context_read',
                },
            }
        case 'check_plan_readiness':
            return {
                execution: {
                    counters,
                    status: 'readiness_checked',
                },
            }
        case 'planning_decision':
            return {
                execution: {
                    counters,
                    status:
                        action.decision.type === 'ask_clarification' || action.decision.type === 'stop_with_boundary_message'
                            ? 'stopped'
                            : 'planning_decided',
                },
                planning: {
                    decision: action.decision,
                    manualReviewItems:
                        action.decision.type === 'proceed_with_manual_review_items'
                            ? [...state.planning.manualReviewItems, ...action.decision.reviewItems]
                            : state.planning.manualReviewItems,
                },
            }
        case 'decide_tasklist_strategy':
            return {
                execution: {
                    counters,
                    status: 'strategy_decided',
                },
                planning: {
                    strategy: action.strategy,
                },
            }
        case 'apply_strategy_review_decision': {
            const reviewRound = state.execution.counters.strategyRegenerations > 0 ? 2 : 1

            return {
                execution: {
                    counters,
                    status:
                        action.decision.type === 'reject'
                            ? 'stopped'
                            : action.decision.type === 'respond'
                              ? 'strategy_feedback_received'
                              : 'strategy_reviewed',
                },
                human: {
                    strategyReview: {
                        decision: action.decision,
                        reviewRound,
                    },
                },
                planning:
                    action.decision.type === 'edit'
                        ? {
                              strategy: action.decision.strategy,
                          }
                        : undefined,
            }
        }
        case 'regenerate_tasklist_strategy':
            return {
                execution: {
                    counters: {
                        ...counters,
                        strategyRegenerations: state.execution.counters.strategyRegenerations + 1,
                    },
                    status: 'strategy_decided',
                },
                planning: {
                    strategy: action.strategy,
                },
            }
        case 'draft_tasklist':
            return {
                execution: {
                    counters,
                    status: 'drafted_v1',
                },
                tasklist: {
                    draft: {
                        content: '',
                        createdAtStep: counters.steps,
                        planUri: action.planUri,
                        targetVersion: action.targetVersion,
                        version: 1,
                    },
                },
            }
        case 'call_tool':
            return {
                execution: {
                    counters,
                    status:
                        state.tasklist.draft?.version === 3
                            ? 'validated_v3'
                            : state.tasklist.draft?.version === 2
                              ? 'validated_v2'
                              : 'validated_v1',
                },
            }
        case 'decide_warning_disposition':
            return {
                execution: {
                    counters,
                    status: 'warning_disposition_decided',
                },
                planning: {
                    manualReviewItems:
                        action.disposition.fixNow.length === 0
                            ? [...state.planning.manualReviewItems, ...action.disposition.manualReviewItems]
                            : state.planning.manualReviewItems,
                    warningDisposition: action.disposition,
                },
            }
        case 'apply_tasklist_revision_review_decision': {
            if (action.decision.type === 'reject') {
                return {
                    execution: {
                        counters,
                        status: 'stopped',
                    },
                    human: {
                        tasklistRevisionReview: {
                            decision: action.decision,
                            reviewRound: 1,
                        },
                    },
                }
            }

            if (action.decision.type === 'edit') {
                return {
                    execution: {
                        counters: {
                            ...counters,
                            draftRevisions: state.execution.counters.draftRevisions + 1,
                        },
                        status: 'revised_v2',
                    },
                    human: {
                        tasklistRevisionReview: {
                            decision: action.decision,
                            reviewRound: 1,
                        },
                    },
                    tasklist: {
                        draft: state.tasklist.draft
                            ? {
                                  ...state.tasklist.draft,
                                  content: action.decision.markdown,
                                  updatedAtStep: counters.steps,
                                  version: 2,
                              }
                            : undefined,
                    },
                }
            }

            return {
                execution: {
                    counters,
                    status: 'tasklist_revision_reviewed',
                },
                human: {
                    tasklistRevisionReview: {
                        decision: action.decision,
                        reviewRound: 1,
                    },
                },
            }
        }
        case 'evaluate_revision_effect':
            return {
                execution: {
                    counters,
                    status: 'revision_effect_evaluated',
                },
                planning: {
                    revisionEffect: action.effect,
                },
            }
        case 'revise_tasklist': {
            const nextDraftVersion = state.tasklist.draft?.version === 2 ? 3 : 2

            return {
                execution: {
                    counters: {
                        ...counters,
                        draftRevisions: state.execution.counters.draftRevisions + 1,
                    },
                    status: nextDraftVersion === 3 ? 'revised_v3' : 'revised_v2',
                },
                tasklist: {
                    draft: state.tasklist.draft
                        ? {
                              ...state.tasklist.draft,
                              updatedAtStep: counters.steps,
                              version: nextDraftVersion,
                          }
                        : undefined,
                },
            }
        }
        case 'final_answer':
            return {
                execution: {
                    counters,
                    status: 'final',
                },
            }
        default:
            return {}
    }
}
