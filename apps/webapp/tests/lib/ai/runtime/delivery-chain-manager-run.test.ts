import { describe, expect, it } from 'vitest'

import { runStructuredDeliveryManager } from '@/lib/ai/runtime/delivery-chain/manager'

const resources = {
    governanceText: 'Read-only. No persistence. No public stream protocol changes.',
    planRubricText: 'Produce a verifiable plan.',
    requirementText: 'Show a request-limit banner with a recoverable failure state.',
    reviewRubricText: 'Review scope, risks, and boundaries.',
    sourceRefs: [],
    taskRubricText: 'Produce executable tasks.',
    warnings: [],
}

type StructuredOutput = Record<string, unknown | ((messages: unknown[]) => unknown)>

function createModelSet(outputs: StructuredOutput, contractCalls: string[]) {
    const handle = {
        capabilities: { jsonOutput: true },
        model: {
            invoke: async () => ({ content: 'Business judgment draft.' }),
            withStructuredOutput: (_schema: unknown, options: { name: string }) => ({
                invoke: async (messages: unknown[]) => {
                    contractCalls.push(options.name)
                    const output = outputs[options.name]
                    return typeof output === 'function' ? output(messages) : output
                },
            }),
        },
    } as never

    return {
        manager: { contractHandle: handle, handle },
        subagents: {
            'boundary-subagent': { contractHandle: handle, handle },
            'plan-subagent': { contractHandle: handle, handle },
            'review-subagent': { contractHandle: handle, handle },
            'risk-subagent': { contractHandle: handle, handle },
            'task-subagent': { contractHandle: handle, handle },
        },
    }
}

function createOutputs(options: { revisionTargets?: Array<'plan' | 'tasks'> } = {}): StructuredOutput {
    const revisionTargets = options.revisionTargets
    let generalReviewCount = 0

    return {
        delivery_chain_boundary_review: {
            boundaryStatus: 'passed',
            findings: [],
            markdown: '# Boundary',
            role: 'boundary',
            summary: 'Boundary passed.',
            violations: [],
        },
        delivery_chain_general_review: (messages: unknown[]) => {
            generalReviewCount += 1
            if (generalReviewCount === 1 && revisionTargets) {
                return {
                    disposition: 'needs_changes',
                    findings: [
                        {
                            description: 'Add explicit failure-state acceptance criteria.',
                            evidence: ['The current artifact omits the failure state.'],
                            findingType: 'issue',
                            requirement: 'required',
                            severity: 'medium',
                            suggestedAction: 'Add the missing acceptance criteria.',
                            targetArtifacts: revisionTargets,
                        },
                    ],
                    markdown: '# General',
                    planTaskAlignment: 'aligned',
                    role: 'general',
                    summary: 'Revision is required.',
                }
            }

            return {
                disposition: 'pass',
                findings: [],
                markdown: '# General',
                planTaskAlignment: 'aligned',
                role: 'general',
                summary: 'General review completed.',
            }
        },
        delivery_chain_plan: {
            acceptanceCriteria: [
                { criterionKey: 'AC-1', description: 'Banner and recovery state are visible.', requirementRefs: ['REQ-1'] },
            ],
            assumptions: [],
            deliveryPhases: [
                {
                    dependsOnPhaseKeys: [],
                    objective: 'Implement banner.',
                    phaseKey: 'implementation',
                    requirementRefs: ['REQ-1'],
                    title: 'Implementation',
                },
            ],
            markdown: '# Plan',
            requirementRefs: ['REQ-1'],
            scope: { excluded: [], included: ['request limit banner'] },
            summary: 'Plan completed.',
        },
        delivery_chain_plan_revision: {
            acceptanceCriteria: [
                { criterionKey: 'AC-1', description: 'Banner and recovery state are visible.', requirementRefs: ['REQ-1'] },
            ],
            assumptions: [],
            deliveryPhases: [
                {
                    dependsOnPhaseKeys: [],
                    objective: 'Implement banner.',
                    phaseKey: 'implementation',
                    requirementRefs: ['REQ-1'],
                    title: 'Implementation',
                },
            ],
            markdown: '# Revised Plan',
            requirementRefs: ['REQ-1'],
            scope: { excluded: [], included: ['request limit banner'] },
            summary: 'Plan revised.',
        },
        delivery_chain_risk_review: {
            findings: [],
            markdown: '# Risk',
            role: 'risk',
            severity: 'low',
            summary: 'Risk is controlled.',
        },
        delivery_chain_supervisor_post: (messages: unknown[]) => {
            return {
                rationale: 'Address the review findings with one bounded revision.',
                recommendations: (revisionTargets ?? ['plan']).map(target => ({
                    acceptanceSuggestion: 'Confirm the recovery behavior is verifiable.',
                    requiredActions: ['Add acceptance coverage.'],
                    summary: `Update the affected ${target} artifact.`,
                    target,
                })),
            }
        },
        delivery_chain_supervisor_pre: {
            assumptions: ['Read-only planning.'],
            branch: 'execute',
            planningFocus: ['Scope'],
            reviewFocus: { boundary: ['Boundary'], general: ['Alignment'], risk: ['Risk'] },
            reviewerRoles: ['general', 'risk', 'boundary'],
            stageIntents: [
                { objective: 'Plan', stage: 'plan' },
                { objective: 'Tasks', stage: 'tasks' },
                { objective: 'Review', stage: 'review' },
            ],
            taskFocus: ['Tasks'],
        },
        delivery_chain_task_revision: {
            markdown: '# Revised Tasks',
            summary: 'Tasks revised.',
            tasks: [
                {
                    acceptanceCriteria: ['Banner and recovery state are visible.'],
                    dependsOnTaskIds: [],
                    requirementRefs: ['REQ-1'],
                    targetArea: 'request limit banner',
                    taskId: 'TASK-1',
                    title: 'Implement banner',
                },
            ],
        },
        delivery_chain_tasks: {
            markdown: '# Tasks',
            summary: 'Tasks completed.',
            tasks: [
                {
                    acceptanceCriteria: ['Banner is visible.'],
                    dependsOnTaskIds: [],
                    requirementRefs: ['REQ-1'],
                    targetArea: 'request limit banner',
                    taskId: 'TASK-1',
                    title: 'Implement banner',
                },
            ],
        },
    }
}

async function runScenario(options: { revisionTargets?: Array<'plan' | 'tasks'> } = {}) {
    const contractCalls: string[] = []
    const result = await runStructuredDeliveryManager({
        input: { requirementText: resources.requirementText, source: 'inline_requirement' },
        modelSet: createModelSet(createOutputs(options), contractCalls),
        resources,
        workflowId: 'delivery-chain-manager-run',
    })

    return { contractCalls, result }
}

async function runWithOutputs(outputs: StructuredOutput) {
    const contractCalls: string[] = []
    const result = await runStructuredDeliveryManager({
        input: { requirementText: resources.requirementText, source: 'inline_requirement' },
        modelSet: createModelSet(outputs, contractCalls),
        resources,
        workflowId: 'delivery-chain-manager-custom-output',
    })

    return { contractCalls, result }
}

describe('runtime/delivery-chain manager revision lifecycle', () => {
    it('owns one immutable pre-decision DispatchPlan and short-circuits clarification or blocked branches', async () => {
        const clarificationOutputs = createOutputs()
        clarificationOutputs.delivery_chain_supervisor_pre = {
            branch: 'clarification_required',
            missingInformation: ['The acceptance criteria are missing.'],
            nextStep: 'Provide the expected user-visible result.',
            reason: 'The plan would otherwise change product behavior arbitrarily.',
        }
        const { contractCalls: clarificationCalls, result: clarification } = await runWithOutputs(clarificationOutputs)

        expect(clarification).toMatchObject({ runStatus: 'clarification_required', status: 'completed' })
        expect(clarification.dispatchPlan?.dispatchPlanId).toEqual(expect.any(String))
        expect(clarification.dispatchPlan?.preDecision.branch).toBe('clarification_required')
        expect(clarificationCalls).toEqual(['delivery_chain_supervisor_pre'])

        const blockedOutputs = createOutputs()
        blockedOutputs.delivery_chain_supervisor_pre = {
            boundaryEvidence: ['The request asks this read-only Runtime to write production data.'],
            branch: 'blocked',
            nextStep: 'Remove the prohibited side effect from this planning request.',
            reason: 'The runtime boundary is explicit.',
        }
        const { contractCalls: blockedCalls, result: blocked } = await runWithOutputs(blockedOutputs)

        expect(blocked).toMatchObject({ runStatus: 'blocked', status: 'blocked' })
        expect(blocked.dispatchPlan?.postReviewDecision).toBeUndefined()
        expect(blockedCalls).toEqual(['delivery_chain_supervisor_pre'])
    })

    it('does not derive status from contradictory Reviewer Markdown', async () => {
        const outputs = createOutputs()
        outputs.delivery_chain_general_review = {
            disposition: 'pass',
            findings: [],
            markdown: '# General\n\nConclusion: blocked',
            planTaskAlignment: 'aligned',
            role: 'general',
            summary: 'The typed result passes.',
        }
        const { result } = await runWithOutputs(outputs)

        expect(result.runStatus).toBe('pass')
        expect(result.status).toBe('completed')
    })

    it('projects validated Plan and Tasks fields when Worker Markdown contains only a title', async () => {
        const { result } = await runScenario()

        expect(result.reportMarkdown).toContain('## 需求摘要')
        expect(result.reportMarkdown).toContain('- 用户目标：Show a request-limit banner with a recoverable failure state.')
        expect(result.reportMarkdown.indexOf('## 需求摘要')).toBeLessThan(result.reportMarkdown.indexOf('## 交付结论'))
        expect(result.reportMarkdown).toContain('## 方案概览')
        expect(result.reportMarkdown).toContain('Plan completed.')
        expect(result.reportMarkdown).toContain('### 实施阶段')
        expect(result.reportMarkdown).toContain('Implementation')
        expect(result.reportMarkdown).toContain('Banner and recovery state are visible.')
        expect(result.reportMarkdown).toContain('### 任务 TASK-1：Implement banner')
        expect(result.reportMarkdown).toContain('目标区域：request limit banner')
        expect(result.reportMarkdown).toContain('Banner is visible.')
    })

    it('extracts a short requirement summary from standard Requirement sections', async () => {
        const summaryResources = {
            ...resources,
            requirementText: [
                '# Requirement: Registration and Login System',
                '',
                '## User Story',
                '作为普通 Web 应用用户，我希望能够注册并登录。',
                '',
                '## User-facing Outcome',
                '- 用户可以创建账号。',
                '- 用户可以登录并退出。',
                '',
                '## Non-goals',
                '- 不包含找回密码。',
            ].join('\n'),
        }
        const result = await runStructuredDeliveryManager({
            input: { requirementText: summaryResources.requirementText, source: 'inline_requirement' },
            modelSet: createModelSet(createOutputs(), []),
            resources: summaryResources,
            workflowId: 'delivery-chain-manager-requirement-summary',
        })

        expect(result.reportMarkdown).toContain('- 用户目标：作为普通 Web 应用用户，我希望能够注册并登录。')
        expect(result.reportMarkdown).toContain('- 本轮重点：用户可以创建账号。、用户可以登录并退出。')
        expect(result.reportMarkdown).toContain('- 明确不包含：不包含找回密码。')
    })

    it('passes the matching rubric into each Worker context', async () => {
        const outputs = createOutputs()
        const planOutput = outputs.delivery_chain_plan
        const taskOutput = outputs.delivery_chain_tasks
        const reviewOutput = outputs.delivery_chain_general_review
        let planMessages = ''
        let taskMessages = ''
        let reviewMessages = ''

        outputs.delivery_chain_plan = messages => {
            planMessages = messages.map(message => String((message as { content?: unknown }).content ?? '')).join('\n')
            return planOutput
        }
        outputs.delivery_chain_tasks = messages => {
            taskMessages = messages.map(message => String((message as { content?: unknown }).content ?? '')).join('\n')
            return taskOutput
        }
        outputs.delivery_chain_general_review = messages => {
            reviewMessages = messages.map(message => String((message as { content?: unknown }).content ?? '')).join('\n')
            return typeof reviewOutput === 'function' ? reviewOutput(messages) : reviewOutput
        }

        await runWithOutputs(outputs)

        expect(planMessages).toContain('Plan rubric:\nProduce a verifiable plan.')
        expect(taskMessages).toContain('Task rubric:\nProduce executable tasks.')
        expect(reviewMessages).toContain('Review rubric:\nReview scope, risks, and boundaries.')
    })

    it('keeps a positive review observation out of required follow-up status', async () => {
        const outputs = createOutputs()
        outputs.delivery_chain_risk_review = {
            findings: [
                {
                    description: 'The Plan and Tasks are fully compliant with the supplied requirement.',
                    evidence: ['All required controls are present.'],
                    findingType: 'observation',
                    requirement: 'required',
                    severity: 'low',
                    suggestedAction: 'No action is required.',
                    targetArtifacts: ['plan', 'tasks'],
                },
            ],
            markdown: '# Risk',
            role: 'risk',
            severity: 'low',
            summary: 'Risk is controlled.',
        }

        const { result } = await runWithOutputs(outputs)

        expect(result.runStatus).toBe('pass')
        expect(result.reportMarkdown).toContain('## 评审观察')
        expect(result.reportMarkdown).toContain('fully compliant')
        expect(result.reportMarkdown).not.toContain('## 待处理事项')
    })

    it('passes typed Plan and Tasks snapshots to Review without Runtime-owned identifiers', async () => {
        const outputs = createOutputs()
        let boundaryMessages = ''
        outputs.delivery_chain_boundary_review = (messages: unknown[]) => {
            boundaryMessages = messages.map(message => String((message as { content?: unknown }).content ?? '')).join('\n')
            return {
                boundaryStatus: 'passed',
                findings: [],
                markdown: '# Boundary',
                role: 'boundary',
                summary: 'Boundary passed.',
                violations: [],
            }
        }

        const { result } = await runWithOutputs(outputs)

        expect(result.reviewBundles[0]?.coverage.boundary).toBe('completed')
        expect(boundaryMessages).toContain('deliveryPhases')
        expect(boundaryMessages).toContain('"taskId":"TASK-1"')
        expect(boundaryMessages).not.toContain('"artifactId"')
        expect(boundaryMessages).not.toContain('"planRef"')
    })

    it('distinguishes a Supervisor execution failure from a Contract failure', async () => {
        const outputs = createOutputs()
        outputs.delivery_chain_supervisor_pre = () => {
            throw new Error('provider unavailable')
        }

        const { result } = await runWithOutputs(outputs)

        expect(result.status).toBe('failed')
        expect(result.failureMessage).toBe('Supervisor pre-decision 执行未完成。')
        expect(result.reportMarkdown).toContain('Supervisor pre-decision 执行未完成。')
        expect(result.reportMarkdown).not.toContain('provider unavailable')
    })

    it.each([{ target: 'plan' as const }, { target: 'tasks' as const }])(
        'only revises the requested $target artifact and preserves lineage',
        async ({ target }) => {
            const { result } = await runScenario({ revisionTargets: [target] })
            const untouchedTarget = target === 'plan' ? 'tasks' : 'plan'

            expect(result.runStatus).toBe('needs_review')
            expect(result.artifacts.filter(artifact => artifact.kind === target).at(-1)).toMatchObject({ revision: 2 })
            expect(result.artifacts.filter(artifact => artifact.kind === untouchedTarget).at(-1)).toMatchObject({ revision: 1 })
            expect(result.revisionOutcome?.requests[0]).toMatchObject({
                sourceFindingIds: [result.reviewBundles[0]?.findings[0]?.findingId],
                updatedTargets: [target],
            })
        }
    )

    it('revises Plan before Tasks when both targets are validated', async () => {
        const { contractCalls, result } = await runScenario({ revisionTargets: ['plan', 'tasks'] })

        expect(result.failureMessage).toBeUndefined()
        expect(result.runStatus).toBe('needs_review')
        expect(result.artifacts.filter(artifact => artifact.kind === 'plan').at(-1)).toMatchObject({ revision: 2 })
        expect(result.artifacts.filter(artifact => artifact.kind === 'tasks').at(-1)).toMatchObject({
            revision: 2,
            planRef: { revision: 2 },
        })
        expect(contractCalls.indexOf('delivery_chain_plan_revision')).toBeLessThan(contractCalls.indexOf('delivery_chain_task_revision'))
    })

    it('passes the validated RevisionRequest and referenced typed findings to the selected revision Worker', async () => {
        const outputs = createOutputs({ revisionTargets: ['plan'] })
        const planRevision = outputs.delivery_chain_plan_revision
        let revisionMessages = ''
        outputs.delivery_chain_plan_revision = messages => {
            revisionMessages = messages.map(message => String((message as { content?: unknown }).content ?? '')).join('\n')
            return planRevision
        }

        const { result } = await runWithOutputs(outputs)
        const findingId = result.reviewBundles[0]?.findings[0]?.findingId

        expect(result.runStatus).toBe('needs_review')
        expect(revisionMessages).toContain('已验证的修订上下文')
        expect(revisionMessages).toContain('runtime-plan-revision')
        expect(revisionMessages).toContain('Add acceptance coverage.')
        expect(revisionMessages).toContain('Add explicit failure-state acceptance criteria.')
        expect(revisionMessages).toContain(findingId)
    })

    it('retains first-review evidence and ends without a second Review Group after revision', async () => {
        const { contractCalls, result } = await runScenario({ revisionTargets: ['plan'] })

        expect(result.runStatus).toBe('needs_review')
        expect(result.reviewBundles).toHaveLength(1)
        expect(contractCalls.filter(name => name === 'delivery_chain_general_review')).toHaveLength(1)
        expect(result.reportMarkdown).toContain('## 返修依据')
        expect(result.reportMarkdown).not.toContain('## 原问题处理结果')
    })

    it('stops on a Review hard blocker without post-review revision', async () => {
        const contractCalls: string[] = []
        const outputs = createOutputs()
        outputs.delivery_chain_boundary_review = {
            boundaryStatus: 'blocked',
            findings: [],
            markdown: '# Boundary',
            role: 'boundary',
            summary: 'Boundary blocks this run.',
            violations: ['No persistence boundary violated.'],
        }
        const result = await runStructuredDeliveryManager({
            input: { requirementText: resources.requirementText, source: 'inline_requirement' },
            modelSet: createModelSet(outputs, contractCalls),
            resources,
            workflowId: 'delivery-chain-manager-blocked',
        })

        expect(result.status).toBe('blocked')
        expect(contractCalls).not.toContain('delivery_chain_supervisor_post')
        expect(result.revisionOutcome).toBeUndefined()
    })

    it('reports partial Review coverage as needs_review and never upgrades it to pass', async () => {
        const contractCalls: string[] = []
        const outputs = createOutputs()
        outputs.delivery_chain_risk_review = () => {
            throw new Error('risk reviewer timeout')
        }
        const result = await runStructuredDeliveryManager({
            input: { requirementText: resources.requirementText, source: 'inline_requirement' },
            modelSet: createModelSet(outputs, contractCalls),
            resources,
            workflowId: 'delivery-chain-manager-partial-review',
        })

        expect(result.runStatus).toBe('needs_review')
        expect(result.reviewBundles[0]?.coverage.risk).toBe('execution_failed')
        expect(result.reportMarkdown).toContain('风险检查：执行失败')
        expect(contractCalls).not.toContain('delivery_chain_supervisor_post')
    })

    it('fails safely when every Reviewer fails after a valid dispatch', async () => {
        const outputs = createOutputs()
        for (const name of ['delivery_chain_general_review', 'delivery_chain_risk_review', 'delivery_chain_boundary_review']) {
            outputs[name] = () => {
                throw new Error('reviewer execution failed')
            }
        }
        const { contractCalls, result } = await runWithOutputs(outputs)

        expect(result.runStatus).toBe('failed')
        expect(result.status).toBe('failed')
        expect(result.reportMarkdown).not.toContain('当前状态：')
        expect(result.reportMarkdown).toContain('## 需求摘要')
        expect(contractCalls).not.toContain('delivery_chain_supervisor_post')
    })

    it('uses a Runtime-derived revision when post-review guidance Contract remains invalid', async () => {
        const contractCalls: string[] = []
        const outputs = createOutputs({ revisionTargets: ['plan'] })
        outputs.delivery_chain_supervisor_post = { action: 'revise' }
        const result = await runStructuredDeliveryManager({
            input: { requirementText: resources.requirementText, source: 'inline_requirement' },
            modelSet: createModelSet(outputs, contractCalls),
            resources,
            workflowId: 'delivery-chain-manager-invalid-post',
        })

        expect(result.status).toBe('completed')
        expect(result.runStatus).toBe('needs_review')
        expect(contractCalls).toEqual(expect.arrayContaining(['delivery_chain_supervisor_post', 'delivery_chain_supervisor_post']))
        expect(contractCalls).toContain('delivery_chain_plan_revision')
        expect(result.reportMarkdown).toContain('Supervisor 评审后说明未完成，Runtime 已根据已验证的评审发现继续处理。')
        expect(result.reportMarkdown).not.toContain('provider unavailable')
    })

    it('ignores Supervisor guidance outside the finding-derived target set', async () => {
        const contractCalls: string[] = []
        const outputs = createOutputs({ revisionTargets: ['plan'] })
        outputs.delivery_chain_supervisor_post = () => {
            return {
                rationale: 'Use the only allowed target.',
                recommendations: [
                    {
                        acceptanceSuggestion: 'Keep this suggestion as narrative only.',
                        requiredActions: ['Update the task list instead.'],
                        summary: 'Try to redirect revision to tasks.',
                        target: 'tasks',
                    },
                ],
            }
        }

        const result = await runStructuredDeliveryManager({
            input: { requirementText: resources.requirementText, source: 'inline_requirement' },
            modelSet: createModelSet(outputs, contractCalls),
            resources,
            workflowId: 'delivery-chain-manager-post-policy-repair',
        })

        expect(result.runStatus).toBe('needs_review')
        expect(contractCalls.filter(name => name === 'delivery_chain_supervisor_post')).toHaveLength(1)
        expect(contractCalls).toContain('delivery_chain_plan_revision')
        expect(contractCalls).not.toContain('delivery_chain_task_revision')
        expect(result.dispatchPlan?.postReviewDecision).toMatchObject({ action: 'revise', revisionTargets: ['plan'] })
    })

    it('preserves typed Review evidence and artifact versions when a revision Worker fails', async () => {
        const outputs = createOutputs({ revisionTargets: ['plan'] })
        outputs.delivery_chain_plan_revision = () => {
            throw new Error('revision provider unavailable')
        }

        const { result } = await runWithOutputs(outputs)
        const plan = result.artifacts.filter(artifact => artifact.kind === 'plan').at(-1)
        const tasks = result.artifacts.filter(artifact => artifact.kind === 'tasks').at(-1)

        expect(result.status).toBe('failed')
        expect(result.reportMarkdown).toContain('## 已保留的评审证据')
        expect(result.reportMarkdown).toContain('方案与任务一致性：已完成')
        expect(result.reportMarkdown).toContain('Add explicit failure-state acceptance criteria.')
        expect(result.reportMarkdown).toContain(`方案：第 ${plan?.revision} 版`)
        expect(result.reportMarkdown).toContain(`任务：第 ${tasks?.revision} 版`)
        expect(result.reportMarkdown).not.toContain('revision provider unavailable')
    })

    it('does not start a second Review Group or revision after the one allowed revision', async () => {
        const { contractCalls, result } = await runScenario({ revisionTargets: ['plan'] })

        expect(result.runStatus).toBe('needs_review')
        expect(contractCalls.filter(name => name === 'delivery_chain_supervisor_post')).toHaveLength(1)
        expect(contractCalls.filter(name => name === 'delivery_chain_general_review')).toHaveLength(1)
        expect(result.artifacts.filter(artifact => artifact.kind === 'plan').every(artifact => artifact.revision <= 2)).toBe(true)
    })
})
