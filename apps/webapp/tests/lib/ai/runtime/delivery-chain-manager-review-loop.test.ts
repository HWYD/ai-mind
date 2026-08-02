import { describe, expect, it, vi } from 'vitest'

import {
    derivePostReviewDecision,
    resolveStructuredReviewStatus,
    runStructuredDeliveryManager,
    type StructuredReviewBundle,
    validateExactReviewerRoles,
} from '@/lib/ai/runtime/delivery-chain/manager'

const resources = {
    governanceText: '只读、无持久化、不修改公开 stream 协议。',
    planRubricText: '输出可验证方案。',
    requirementText: '为登录页面增加可验证的错误提示和提交状态。',
    reviewRubricText: '评审范围和风险。',
    sourceRefs: [],
    taskRubricText: '输出可执行任务。',
    warnings: [],
}

function createStructuredModel(outputs: Record<string, unknown | ((messages: unknown[]) => unknown)>) {
    return {
        capabilities: { jsonOutput: true },
        model: {
            invoke: async () => ({ content: 'Business role draft' }),
            withStructuredOutput: vi.fn((_schema, options: { name: string }) => ({
                invoke: async (messages: unknown[]) => {
                    const output = outputs[options.name]
                    return typeof output === 'function' ? output(messages) : output
                },
            })),
        },
    } as never
}

function createModelSet(outputs: Record<string, unknown | ((messages: unknown[]) => unknown)>) {
    const handle = createStructuredModel(outputs)
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

const outputs = {
    delivery_chain_boundary_review: {
        boundaryStatus: 'passed',
        findings: [],
        markdown: '# Boundary',
        role: 'boundary',
        summary: '边界通过。',
        violations: [],
    },
    delivery_chain_general_review: {
        disposition: 'pass',
        findings: [],
        markdown: '# General',
        planTaskAlignment: 'aligned',
        role: 'general',
        summary: '方案与任务一致。',
    },
    delivery_chain_plan: {
        acceptanceCriteria: [{ criterionKey: 'AC-1', description: '错误提示可见', requirementRefs: ['REQ-1'] }],
        assumptions: [],
        deliveryPhases: [
            { dependsOnPhaseKeys: [], objective: '实现状态', phaseKey: 'implementation', requirementRefs: ['REQ-1'], title: '实现' },
        ],
        markdown: '# Plan',
        requirementRefs: ['REQ-1'],
        scope: { excluded: [], included: ['登录页面'] },
        summary: '完成方案。',
    },
    delivery_chain_risk_review: {
        findings: [],
        markdown: '# Risk',
        role: 'risk',
        severity: 'low',
        summary: '风险可控。',
    },
    delivery_chain_supervisor_post: {
        rationale: '评审通过。',
        recommendations: [
            {
                acceptanceSuggestion: '保持已有验收标准。',
                requiredActions: ['确认验收标准。'],
                summary: '无需实际返修。',
                target: 'plan',
            },
        ],
    },
    delivery_chain_supervisor_pre: {
        assumptions: ['不修改公开协议'],
        branch: 'execute',
        planningFocus: ['范围明确'],
        reviewFocus: { boundary: ['边界'], general: ['一致性'], risk: ['风险'] },
        reviewerRoles: ['boundary', 'general', 'risk'],
        stageIntents: [
            { objective: '方案', stage: 'plan' },
            { objective: '任务', stage: 'tasks' },
            { objective: '评审', stage: 'review' },
        ],
        taskFocus: ['可验证'],
    },
    delivery_chain_tasks: {
        markdown: '# Tasks',
        summary: '完成任务。',
        tasks: [
            {
                acceptanceCriteria: ['错误提示可见'],
                dependsOnTaskIds: [],
                requirementRefs: ['REQ-1'],
                targetArea: 'login',
                taskId: 'TASK-1',
                title: '实现状态',
            },
        ],
    },
}

describe('runtime/delivery-chain structured review loop', () => {
    it('接受任意顺序的精确 Reviewer 集合，拒绝缺失、重复或额外角色', () => {
        expect(validateExactReviewerRoles(['general', 'risk', 'boundary'])).toBeNull()
        expect(validateExactReviewerRoles(['boundary', 'general', 'risk'])).toBeNull()
        expect(validateExactReviewerRoles(['general', 'general', 'risk'])).not.toBeNull()
        expect(validateExactReviewerRoles(['general', 'risk'])).not.toBeNull()
    })

    it('Runtime 创建唯一 DispatchPlan，并以相同 artifact snapshot 并行完成固定 Review Group', async () => {
        const result = await runStructuredDeliveryManager({
            input: { requirementText: resources.requirementText, source: 'inline_requirement' },
            modelSet: createModelSet(outputs),
            resources,
            workflowId: 'structured-review-loop',
        })

        expect(result.runStatus).toBe('pass')
        expect(result.dispatchPlan).toMatchObject({
            postReviewDecision: { action: 'finalize' },
            preDecision: { branch: 'execute' },
        })
        expect(result.dispatchPlan?.dispatchPlanId).toBeTruthy()
        expect(result.invocationMetrics).toEqual({
            businessModelCalls: 7,
            contractModelCalls: 7,
            contractRepairCalls: 0,
        })
        expect(result.reviewBundles).toHaveLength(1)
        expect(result.reviewBundles[0]?.coverage).toEqual({ boundary: 'completed', general: 'completed', risk: 'completed' })
        expect(result.reviewBundles[0]?.artifactRefs.plan.revision).toBe(1)
        expect(result.reviewBundles[0]?.artifactRefs.tasks.revision).toBe(1)
        expect(result.trace.invocations.map(invocation => invocation.subagentId)).toEqual([
            'plan-subagent',
            'task-subagent',
            'review-subagent',
            'risk-subagent',
            'boundary-subagent',
        ])
        expect(result.trace.invocations.every(invocation => invocation.status === 'completed')).toBe(true)
        expect(result.reportMarkdown).not.toContain('当前状态：')
    })

    it.each([
        {
            branch: 'clarification_required' as const,
            expectedStatus: 'clarification_required',
            output: {
                branch: 'clarification_required' as const,
                missingInformation: ['确认错误提示文案。'],
                nextStep: '补充用户可见的错误提示。',
                reason: '缺少验收文案。',
            },
        },
        {
            branch: 'blocked' as const,
            expectedStatus: 'blocked',
            output: {
                boundaryEvidence: ['当前请求要求写入生产数据。'],
                branch: 'blocked' as const,
                nextStep: '移除写入要求后重试。',
                reason: '只读规划运行时不能执行写入。',
            },
        },
    ])('Supervisor %s 分支在任何 Worker 启动前安全结束', async ({ expectedStatus, output }) => {
        const workerContractNames: string[] = []
        const result = await runStructuredDeliveryManager({
            input: { requirementText: resources.requirementText, source: 'inline_requirement' },
            modelSet: createModelSet({
                ...outputs,
                delivery_chain_boundary_review: () => {
                    workerContractNames.push('boundary')
                    return outputs.delivery_chain_boundary_review
                },
                delivery_chain_general_review: () => {
                    workerContractNames.push('general')
                    return outputs.delivery_chain_general_review
                },
                delivery_chain_plan: () => {
                    workerContractNames.push('plan')
                    return outputs.delivery_chain_plan
                },
                delivery_chain_risk_review: () => {
                    workerContractNames.push('risk')
                    return outputs.delivery_chain_risk_review
                },
                delivery_chain_supervisor_pre: output,
                delivery_chain_tasks: () => {
                    workerContractNames.push('tasks')
                    return outputs.delivery_chain_tasks
                },
            }),
            resources,
            workflowId: `short-circuit-${expectedStatus}`,
        })

        expect(result.runStatus).toBe(expectedStatus)
        expect(result.dispatchPlan).toMatchObject({ preDecision: { branch: output.branch } })
        expect(result.dispatchPlan?.dispatchPlanId).toBeTruthy()
        expect(result.artifacts).toHaveLength(1)
        expect(workerContractNames).toEqual([])
    })

    it('Supervisor prompt 不禁止 structured-output transport', async () => {
        let supervisorSystemPrompt = ''
        const result = await runStructuredDeliveryManager({
            input: {
                expectedPreDecision: 'execute',
                inlineRequirementText: '生成交付计划',
                requirementRef: 'demo://scenarios/request-limit-banner/requirement.md',
                scenarioId: 'request-limit-banner',
                source: 'demo_scenario',
            },
            modelSet: createModelSet({
                ...outputs,
                delivery_chain_supervisor_pre: messages => {
                    const firstMessage = messages[0] as { content?: unknown } | undefined
                    supervisorSystemPrompt = typeof firstMessage?.content === 'string' ? firstMessage.content : ''
                    return outputs.delivery_chain_supervisor_pre
                },
            }),
            resources,
            workflowId: 'structured-output-transport',
        })

        expect(result.runStatus).toBe('pass')
        expect(supervisorSystemPrompt).toContain('完整、详细的业务草稿')
        expect(supervisorSystemPrompt).toContain('后续的 Contract 阶段会将其编码为严格的结构化输出')
        expect(supervisorSystemPrompt).toContain('不要假设本次业务模型调用附带了 schema')
        expect(supervisorSystemPrompt).not.toContain('tool calls')
        expect(supervisorSystemPrompt).toContain('本 run 是只读规划与评审')
        expect(supervisorSystemPrompt).toContain('将 Requirement 中声明的用户可见行为和验收标准视为权威依据')
        expect(supervisorSystemPrompt).toContain('与现有 helper 可能的不匹配')
        expect(supervisorSystemPrompt).toContain('这是一个只读的演示规划场景')
        expect(supervisorSystemPrompt).toContain('均为 Plan 和 Tasks 的未来实现目标')
        expect(supervisorSystemPrompt).toContain('不要仅因为未来工作是新功能')
        expect(supervisorSystemPrompt).toContain('reviewerRoles 必须恰好包含 general、risk、boundary 各一次')
        expect(supervisorSystemPrompt).toContain('在任何 Worker 启动前')
    })

    it('planning-ready 快速入口会修复把输出 schema 误判成缺失业务输入的 Supervisor 结果', async () => {
        let preDecisionCalls = 0
        const result = await runStructuredDeliveryManager({
            input: {
                expectedPreDecision: 'execute',
                requirementRef: 'demo://scenarios/request-limit-banner/requirement.md',
                scenarioId: 'request-limit-banner',
                source: 'demo_scenario',
            },
            modelSet: createModelSet({
                ...outputs,
                delivery_chain_supervisor_pre: () => {
                    preDecisionCalls += 1

                    if (preDecisionCalls === 1) {
                        return {
                            branch: 'clarification_required',
                            missingInformation: ['The expected planning output schema'],
                            nextStep: 'Provide the Plan and Tasks output schema.',
                            reason: 'The schema requested by the prompt was not provided.',
                        }
                    }

                    return outputs.delivery_chain_supervisor_pre
                },
            }),
            resources,
            workflowId: 'request-limit-banner-fast-entry',
        })

        expect(preDecisionCalls).toBe(2)
        expect(result.dispatchPlan?.preDecision.branch).toBe('execute')
        expect(result.runStatus).toBe('pass')
        expect(result.reportMarkdown).not.toContain('Provide the Plan and Tasks output schema')
    })

    it('Reviewer 不会把未来代码改动误判为当前只读 Runtime 的边界违规', async () => {
        let boundaryReviewerSystemPrompt = ''
        const result = await runStructuredDeliveryManager({
            input: {
                expectedPreDecision: 'execute',
                requirementRef: 'demo://scenarios/request-limit-banner/requirement.md',
                scenarioId: 'request-limit-banner',
                source: 'demo_scenario',
            },
            modelSet: createModelSet({
                ...outputs,
                delivery_chain_boundary_review: messages => {
                    const firstMessage = messages[0] as { content?: unknown } | undefined
                    boundaryReviewerSystemPrompt = typeof firstMessage?.content === 'string' ? firstMessage.content : ''
                    return outputs.delivery_chain_boundary_review
                },
            }),
            resources,
            workflowId: 'request-limit-banner-review-boundary',
        })

        expect(result.runStatus).toBe('pass')
        expect(boundaryReviewerSystemPrompt).toContain('本 Runtime 执行的是只读规划与评审')
        expect(boundaryReviewerSystemPrompt).toContain('仅描述未来的实现工作')
        expect(boundaryReviewerSystemPrompt).toContain('并非本 run 已访问或修改了这些文件的证据')
        expect(boundaryReviewerSystemPrompt).toContain('不要仅因为需求功能或未来实现会修改应用代码就判定为 blocked')
        expect(boundaryReviewerSystemPrompt).toContain('将 Requirement 和 Context 中的实现决策约定视为未来允许的目标模块和范围的权威依据')
    })

    it('拒绝不完整 Reviewer 集合，并且不启动任何 Worker', async () => {
        const invokedWorkerContracts: string[] = []
        const result = await runStructuredDeliveryManager({
            input: { requirementText: resources.requirementText, source: 'inline_requirement' },
            modelSet: createModelSet({
                ...outputs,
                delivery_chain_supervisor_pre: { ...outputs.delivery_chain_supervisor_pre, reviewerRoles: ['general'] },
                delivery_chain_plan: () => {
                    invokedWorkerContracts.push('plan')
                    return outputs.delivery_chain_plan
                },
                delivery_chain_tasks: () => {
                    invokedWorkerContracts.push('tasks')
                    return outputs.delivery_chain_tasks
                },
                delivery_chain_general_review: () => {
                    invokedWorkerContracts.push('general-review')
                    return outputs.delivery_chain_general_review
                },
                delivery_chain_risk_review: () => {
                    invokedWorkerContracts.push('risk-review')
                    return outputs.delivery_chain_risk_review
                },
                delivery_chain_boundary_review: () => {
                    invokedWorkerContracts.push('boundary-review')
                    return outputs.delivery_chain_boundary_review
                },
            }),
            resources,
            workflowId: 'incomplete-reviewer-set',
        })

        expect(result.runStatus).toBe('failed')
        expect(result.failureMessage).toBe('Supervisor 声明的 Reviewer 集合不完整。')
        expect(invokedWorkerContracts).toEqual([])
    })

    it('状态矩阵优先处理 hard blocker、部分覆盖和任务对齐失败', () => {
        const createBundle = (overrides: Partial<StructuredReviewBundle>): StructuredReviewBundle => ({
            artifactRefs: { plan: { artifactId: 'plan', revision: 1 }, tasks: { artifactId: 'tasks', revision: 1 } },
            coverage: { boundary: 'completed', general: 'completed', risk: 'completed' },
            cycleId: 'cycle-1',
            findings: [],
            results: {},
            ...overrides,
        })

        expect(
            resolveStructuredReviewStatus(
                createBundle({
                    results: {
                        risk: {
                            findings: [],
                            markdown: '# risk',
                            role: 'risk',
                            severity: 'blocker',
                            summary: '阻塞。',
                            cycleId: 'cycle-1',
                        },
                    },
                })
            )
        ).toBe('blocked')
        expect(
            resolveStructuredReviewStatus(
                createBundle({ coverage: { boundary: 'execution_failed', general: 'completed', risk: 'completed' } })
            )
        ).toBe('needs_review')
        expect(
            resolveStructuredReviewStatus(
                createBundle({ coverage: { boundary: 'execution_failed', general: 'contract_failure', risk: 'timeout' } })
            )
        ).toBe('failed')
        expect(
            resolveStructuredReviewStatus(
                createBundle({
                    results: {
                        general: {
                            disposition: 'pass',
                            findings: [],
                            markdown: '# general',
                            planTaskAlignment: 'misaligned',
                            role: 'general',
                            summary: '未对齐。',
                            cycleId: 'cycle-1',
                        },
                    },
                })
            )
        ).toBe('needs_changes')
        expect(
            resolveStructuredReviewStatus(
                createBundle({
                    findings: [
                        {
                            cycleId: 'cycle-1',
                            description: '缺少关键验收。',
                            evidence: ['任务没有验收项。'],
                            findingId: 'finding-1',
                            findingType: 'issue',
                            requirement: 'required',
                            severity: 'medium',
                            sourceRole: 'general',
                            suggestedAction: '补充验收。',
                            targetArtifacts: ['tasks'],
                        },
                    ],
                })
            )
        ).toBe('needs_changes')
    })

    it('Runtime 仅从本 cycle 的必需 finding 派生返修目标和来源', () => {
        const bundle: StructuredReviewBundle = {
            artifactRefs: { plan: { artifactId: 'plan', revision: 1 }, tasks: { artifactId: 'tasks', revision: 1 } },
            coverage: { boundary: 'completed', general: 'completed', risk: 'completed' },
            cycleId: 'cycle-1',
            findings: [
                {
                    cycleId: 'cycle-1',
                    description: '补充验收。',
                    evidence: ['缺少验收项。'],
                    findingId: 'finding-1',
                    findingType: 'issue',
                    requirement: 'required',
                    severity: 'medium',
                    sourceRole: 'general',
                    suggestedAction: '补充验收。',
                    targetArtifacts: ['plan'],
                },
            ],
            results: {},
        }

        const decision = derivePostReviewDecision(bundle, {
            rationale: '尝试将返修建议引导到任务。',
            recommendations: [
                {
                    acceptanceSuggestion: '补充任务验收。',
                    requiredActions: ['更新任务。'],
                    summary: '错误的目标建议。',
                    target: 'tasks',
                },
            ],
        })

        expect(decision).toMatchObject({
            action: 'revise',
            requests: [{ sourceFindingIds: ['finding-1'], targets: ['plan'] }],
            revisionTargets: ['plan'],
        })
    })

    it('只允许一次带 finding 血缘的 Plan 返修，并在返修后直接结束', async () => {
        let generalReviewCount = 0
        const progressSteps: string[] = []
        const result = await runStructuredDeliveryManager({
            input: { requirementText: resources.requirementText, source: 'inline_requirement' },
            modelSet: createModelSet({
                ...outputs,
                delivery_chain_plan_revision: outputs.delivery_chain_plan,
                delivery_chain_general_review: messages => {
                    generalReviewCount += 1
                    return generalReviewCount === 1
                        ? {
                              disposition: 'needs_changes',
                              findings: [
                                  {
                                      description: '补充错误态验收。',
                                      evidence: ['当前任务只描述可见。'],
                                      findingType: 'issue',
                                      requirement: 'required',
                                      severity: 'medium',
                                      suggestedAction: '补充失败状态的验收标准。',
                                      targetArtifacts: ['plan'],
                                  },
                              ],
                              markdown: '# General',
                              planTaskAlignment: 'aligned',
                              role: 'general',
                              summary: '需要返修。',
                          }
                        : outputs.delivery_chain_general_review
                },
                delivery_chain_supervisor_post: () => {
                    return {
                        rationale: '处理 required finding。',
                        recommendations: [
                            {
                                acceptanceSuggestion: '补充验收。',
                                requiredActions: ['补充验收。'],
                                summary: '返修 Plan。',
                                target: 'plan',
                            },
                        ],
                    }
                },
            }),
            onProgress(event) {
                progressSteps.push(`${event.stepId}:${event.status}`)
            },
            resources,
            workflowId: 'structured-revision-loop',
        })

        expect(result.runStatus).toBe('needs_review')
        expect(result.reviewBundles).toHaveLength(1)
        expect(result.artifacts.filter(artifact => artifact.kind === 'plan').at(-1)).toMatchObject({ revision: 2 })
        expect(result.dispatchPlan?.postReviewDecision?.action).toBe('revise')
        expect(result.revisionOutcome).toMatchObject({
            requests: [{ sourceFindingIds: [result.reviewBundles[0]?.findings[0]?.findingId], updatedTargets: ['plan'] }],
            revisionSequence: 1,
        })
        expect(result.reportMarkdown).toContain('## 修订结果')
        expect(result.reportMarkdown).toContain('## 返修依据')
        expect(result.reportMarkdown).not.toContain('## 原问题处理结果')
        expect(progressSteps).toContain('revise-plan:running')
        expect(progressSteps).toContain('revise-plan:completed')
        expect(progressSteps).not.toContain('delegate-re-review-group:completed')
    })
})
