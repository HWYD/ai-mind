import type { SubagentToolId } from './types'

export type DeliveryManagerProgressStepId =
    | 'delegate-plan'
    | 'delegate-review'
    | 'delegate-review-group'
    | 'delegate-task'
    | 'synthesize-report'
export type DeliveryManagerProgressStatus = 'completed' | 'failed' | 'running'

export interface DeliveryManagerProgressEvent {
    details?: string[]
    failureMessage?: string
    status: DeliveryManagerProgressStatus
    stepId: DeliveryManagerProgressStepId
    summary?: string
}

interface DeliveryManagerStepDefinition {
    details: string[]
    runningSummary: string
    stepId: DeliveryManagerProgressStepId
    title: string
}

const SUBAGENT_STEP_DEFINITIONS: Record<SubagentToolId, DeliveryManagerStepDefinition> = {
    'boundary-subagent': {
        details: ['Manager 调用 Boundary Subagent Tool'],
        runningSummary: 'Manager 正在委派 Boundary Subagent Tool',
        stepId: 'delegate-review',
        title: '委派 Boundary Subagent Tool',
    },
    'plan-subagent': {
        details: ['Manager 调用 Plan Subagent Tool'],
        runningSummary: 'Manager 正在委派 Plan Subagent Tool',
        stepId: 'delegate-plan',
        title: '委派 Plan Subagent Tool',
    },
    'review-subagent': {
        details: ['Manager 调用 Review Subagent Tool'],
        runningSummary: 'Manager 正在委派 Review Subagent Tool',
        stepId: 'delegate-review',
        title: '委派 Review Subagent Tool',
    },
    'risk-subagent': {
        details: ['Manager 调用 Risk Subagent Tool'],
        runningSummary: 'Manager 正在委派 Risk Subagent Tool',
        stepId: 'delegate-review',
        title: '委派 Risk Subagent Tool',
    },
    'task-subagent': {
        details: ['Manager 调用 Task Subagent Tool'],
        runningSummary: 'Manager 正在委派 Task Subagent Tool',
        stepId: 'delegate-task',
        title: '委派 Task Subagent Tool',
    },
}

const REPORT_STEP_DEFINITION: DeliveryManagerStepDefinition = {
    details: ['Manager 汇总 Delivery Chain Report'],
    runningSummary: 'Manager 正在汇总最终报告',
    stepId: 'synthesize-report',
    title: '汇总 Delivery Chain Report',
}

export function getSubagentProgressStepDefinition(subagentId: SubagentToolId) {
    return SUBAGENT_STEP_DEFINITIONS[subagentId]
}

export function getReportProgressStepDefinition() {
    return REPORT_STEP_DEFINITION
}
