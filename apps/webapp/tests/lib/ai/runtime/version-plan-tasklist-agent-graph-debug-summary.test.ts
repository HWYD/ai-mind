import { describe, expect, it } from 'vitest'

import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import { buildGraphDebugSummary } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-debug-summary'
import { createInitialVersionPlanTasklistGraphState } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'

const versionPlanReference = {
    id: 'docs://versions/v0.2.0-controlled-agent-graph.md',
    label: 'v0.2.0 Controlled Agent Graph',
    source: 'local',
    type: 'resource',
    uri: 'docs://versions/v0.2.0-controlled-agent-graph.md',
} as const

function createGraphState() {
    const initialState = createInitialVersionPlanTasklistGraphState({
        conversationId: 'conversation-debug-summary-test',
        runId: 'run-debug-summary-test',
        runtimeConfig: getTasklistAgentRuntimeConfig(
            {
                AI_MIND_GRAPH_CHECKPOINT: 'memory',
            },
            'development'
        ),
        userGoal: 'Generate v0.2.0 tasklist',
        versionPlanReference,
    })

    return {
        ...initialState,
        execution: {
            ...initialState.execution,
            counters: {
                draftRevisions: 1,
                optionalContextReads: 1,
                steps: 10,
            },
        },
        graph: {
            checkpointMode: 'memory' as const,
            currentNode: 'emitFinalArtifact',
            lastRoute: {
                fromNodeId: 'decideWarningDisposition',
                label: 'no_auto_revision',
                reason: 'route reason must not enter debug summary.',
                toNodeId: 'evaluateRevisionEffect',
            },
            routes: [],
            runtimeMode: 'graph' as const,
            statePatchSummaries: [
                {
                    nodeId: 'draftTasklistV1',
                    summary: 'patch summary must not enter debug summary.',
                },
            ],
            visitedNodes: ['readVersionPlan', 'planningDecision', 'emitFinalArtifact'],
        },
        output: undefined,
        planning: {
            decision: {
                reason: 'Plan is ready.',
                type: 'proceed_to_tasklist_strategy' as const,
            },
            manualReviewItems: [
                {
                    detail: 'Need manual confirmation for interface changes.',
                    severity: 'warning' as const,
                    title: 'Interface Changes',
                },
            ],
            optionalContext: {
                content: 'Full optional context must not enter debug summary.',
                contentPreview: 'Optional context preview must not enter debug summary.',
                location: 'local' as const,
                previewChars: 100,
                resourceName: 'runtime-boundary.md',
                serverId: 'project-docs-server',
                status: 'completed' as const,
                uri: 'docs://architecture/runtime-boundary.md' as const,
            },
            readiness: {
                missingFields: ['Interface Changes'],
                reason: 'readiness reason must not enter debug summary.',
                status: 'needs_review' as const,
                weakFields: ['Risks'],
            },
            revisionEffect: {
                finalDecision: 'final_with_manual_review_items' as const,
                fixedIssues: ['Add execution discipline'],
                improved: true,
                remainingIssues: ['Need manual risk confirmation'],
                scoreAfter: 96,
                scoreBefore: 80,
            },
            strategy: {
                expectedStepRange: [3, 5] as [number, number],
                granularity: 'medium' as const,
                grouping: ['Graph State', 'Runner'],
                priority: ['Graph State first'],
                reason: 'strategy reason must not enter debug summary.',
            },
            warningDisposition: {
                fixNow: ['Add execution discipline'],
                manualReviewItems: [
                    {
                        detail: 'Need manual regression confirmation.',
                        severity: 'warning' as const,
                        title: 'Regression scope',
                    },
                    {
                        detail: 'Need manual release wording confirmation.',
                        severity: 'info' as const,
                        title: 'Release wording',
                    },
                ],
                reason: 'warning disposition reason must not enter debug summary.',
            },
        },
        source: {
            versionPlan: {
                content: '# Full version plan must not enter debug summary',
                reference: versionPlanReference,
                resourceName: 'v0.2.0-controlled-agent-graph.md',
                uri: versionPlanReference.uri,
            },
            versionPlanReference,
        },
        tasklist: {
            draft: {
                content: '# Full tasklist draft must not enter debug summary',
                createdAtStep: 5,
                planUri: versionPlanReference.uri,
                targetVersion: 'v0.2.0',
                validationV1: {
                    blockingIssues: [],
                    missingSections: [],
                    revisionHints: ['Add execution discipline'],
                    score: 80,
                    status: 'warning' as const,
                    weakSections: [],
                },
                validationV2: {
                    blockingIssues: [],
                    missingSections: [],
                    revisionHints: [],
                    score: 96,
                    status: 'pass' as const,
                    weakSections: [],
                },
                version: 2 as const,
            },
        },
    }
}

describe('runtime/version-plan-tasklist-agent graph debug summary', () => {
    it('only includes the allowed summary fields', () => {
        expect(buildGraphDebugSummary(createGraphState())).toEqual({
            checkpointMode: 'memory',
            currentNode: 'emitFinalArtifact',
            decision: {
                type: 'proceed_to_tasklist_strategy',
            },
            draftRevisions: 1,
            lastRoute: {
                fromNodeId: 'decideWarningDisposition',
                label: 'no_auto_revision',
                toNodeId: 'evaluateRevisionEffect',
            },
            manualReviewItemCount: 1,
            maxDraftRevisions: 1,
            maxOptionalContextReads: 1,
            maxSteps: 12,
            optionalContext: {
                status: 'completed',
            },
            optionalContextReads: 1,
            readiness: {
                status: 'needs_review',
            },
            revisionEffect: {
                finalDecision: 'final_with_manual_review_items',
            },
            runId: 'run-debug-summary-test',
            runtimeMode: 'graph',
            stepCount: 10,
            strategy: {
                expectedStepRange: [3, 5],
                granularity: 'medium',
            },
            threadId: 'tasklist-agent:conversation-debug-summary-test:run-debug-summary-test',
            validationV1: {
                score: 80,
                status: 'warning',
            },
            validationV2: {
                score: 96,
                status: 'pass',
            },
            visitedNodes: ['readVersionPlan', 'planningDecision', 'emitFinalArtifact'],
            warningDisposition: {
                fixNowCount: 1,
                manualReviewItemCount: 2,
            },
        })
    })

    it('does not leak full state, source content, draft content, tool output or raw reasons', () => {
        const serializedSummary = JSON.stringify(buildGraphDebugSummary(createGraphState()))

        expect(serializedSummary).not.toContain('Full version plan')
        expect(serializedSummary).not.toContain('Full optional context')
        expect(serializedSummary).not.toContain('Full tasklist draft')
        expect(serializedSummary).not.toContain('patch summary must not enter debug summary')
        expect(serializedSummary).not.toContain('route reason must not enter debug summary')
        expect(serializedSummary).not.toContain('strategy reason must not enter debug summary')
        expect(serializedSummary).not.toContain('warning disposition reason must not enter debug summary')
        expect(serializedSummary).not.toContain('revisionHints')
        expect(serializedSummary).not.toContain('blockingIssues')
        expect(serializedSummary).not.toContain('contentPreview')
        expect(serializedSummary).not.toContain('agentState')
        expect(serializedSummary).not.toContain('graphState')
    })
})
