import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { HumanMessage } from '@langchain/core/messages'
import { OutputParserException } from '@langchain/core/output_parsers'
import { describe, expect, it, vi } from 'vitest'

import {
    boundaryReviewResultDraftSchema,
    createDeliveryChainExecutionBudget,
    createDeliveryChainSubagentTools,
    createRuntimeArtifact,
    createRuntimePlanArtifact,
    createRuntimeTaskArtifact,
    deliveryChainDelegationPolicy,
    deliveryChainExecutionBudgets,
    deliveryWorkerToolResultSchema,
    generalReviewResultDraftSchema,
    getDeliveryChainSubagentDefinitions,
    invokeBusinessAgentContract,
    invokeStructuredContract,
    planArtifactDraftSchema,
    reviseRuntimePlanArtifact,
    reviseRuntimeTaskArtifact,
    riskReviewResultDraftSchema,
    runtimeArtifactSchema,
    subagentToolCallInputSchema,
    supervisorPostReviewDecisionDraftSchema,
    supervisorPostReviewGuidanceDraftSchema,
    supervisorPreDecisionDraftSchema,
    taskArtifactDraftSchema,
    validateDelegationToolCall,
} from '@/lib/ai/runtime/delivery-chain/manager'

const validContracts = [
    {
        name: 'Supervisor pre',
        schema: supervisorPreDecisionDraftSchema,
        value: {
            assumptions: ['需求范围仅限当前模块'],
            branch: 'execute',
            planningFocus: ['明确执行方案'],
            reviewFocus: { boundary: ['边界'], general: ['一致性'], risk: ['风险'] },
            reviewerRoles: ['general', 'risk', 'boundary'],
            stageIntents: [
                { objective: '生成方案', stage: 'plan' },
                { objective: '拆分任务', stage: 'tasks' },
                { objective: '完成评审', stage: 'review' },
            ],
            taskFocus: ['可验证任务'],
        },
    },
    {
        name: 'Plan Worker',
        schema: planArtifactDraftSchema,
        value: {
            acceptanceCriteria: [{ criterionKey: 'AC-1', description: '方案可验证', requirementRefs: ['REQ-1'] }],
            assumptions: [],
            deliveryPhases: [
                {
                    dependsOnPhaseKeys: [],
                    objective: '完成实现设计',
                    phaseKey: 'design',
                    requirementRefs: ['REQ-1'],
                    title: '设计',
                },
            ],
            markdown: '# 方案\n\n展示文本可以变化。',
            requirementRefs: ['REQ-1'],
            scope: { excluded: [], included: ['当前模块'] },
            summary: '完成最小方案。',
        },
    },
    {
        name: 'Task Worker',
        schema: taskArtifactDraftSchema,
        value: {
            markdown: '# 任务\n\n展示文本可以变化。',
            summary: '完成任务拆分。',
            tasks: [
                {
                    acceptanceCriteria: ['测试通过'],
                    dependsOnTaskIds: [],
                    requirementRefs: ['REQ-1'],
                    targetArea: 'manager',
                    taskId: 'TASK-1',
                    title: '实现 Contract',
                },
            ],
        },
    },
    {
        name: 'General Reviewer',
        schema: generalReviewResultDraftSchema,
        value: {
            disposition: 'pass',
            findings: [],
            markdown: '# 评审\n\n即使文案写 needs_changes，也不改变结构化 disposition。',
            planTaskAlignment: 'aligned',
            role: 'general',
            summary: '方案与任务一致。',
        },
    },
    {
        name: 'Risk Reviewer',
        schema: riskReviewResultDraftSchema,
        value: {
            findings: [],
            markdown: '# 风险\n\n展示文本。',
            role: 'risk',
            severity: 'low',
            summary: '风险可控。',
        },
    },
    {
        name: 'Boundary Reviewer',
        schema: boundaryReviewResultDraftSchema,
        value: {
            boundaryStatus: 'passed',
            findings: [],
            markdown: '# 边界\n\n展示文本。',
            role: 'boundary',
            summary: '未发现边界违规。',
            violations: [],
        },
    },
    {
        name: 'Supervisor post',
        schema: supervisorPostReviewGuidanceDraftSchema,
        value: {
            rationale: '完整评审通过。',
            recommendations: [
                {
                    acceptanceSuggestion: '保持验收标准。',
                    requiredActions: ['确认验收标准。'],
                    summary: '无需实际返修。',
                    target: 'plan',
                },
            ],
        },
    },
] as const

describe('runtime/delivery-chain-manager contracts', () => {
    it('typed report synthesis contains no legacy Markdown or open-metadata business parsing', async () => {
        const source = await readFile(
            path.join(process.cwd(), 'lib', 'ai', 'runtime', 'delivery-chain', 'manager', 'report-synthesis.ts'),
            'utf8'
        )

        expect(source).not.toContain('metadata as')
        expect(source).not.toContain('markdown.match')
        expect(source).not.toContain('review.markdown.split')
        expect(source).not.toContain('extractReviewDisposition')
    })

    it.each(validContracts)('$name Contract 严格验证控制字段，Markdown 不参与业务结论', ({ schema, value }) => {
        expect(schema.safeParse(value).success).toBe(true)
        expect(schema.safeParse({ ...value, unexpected: true }).success).toBe(false)
        expect(schema.safeParse({ ...value, artifactId: 'agent-must-not-own-runtime-id' }).success).toBe(false)

        const missingRequiredField = { ...value }
        delete (missingRequiredField as Record<string, unknown>)[Object.keys(value)[0] ?? '']
        expect(schema.safeParse(missingRequiredField).success).toBe(false)

        const wrongType = { ...value, [Object.keys(value)[0] ?? 'branch']: 1 }
        expect(schema.safeParse(wrongType).success).toBe(false)
    })

    it('严格 Contract 拒绝嵌套未知字段、非法枚举和空必填文本', () => {
        const plan = validContracts.find(contract => contract.name === 'Plan Worker')!.value
        const general = validContracts.find(contract => contract.name === 'General Reviewer')!.value

        expect(
            planArtifactDraftSchema.safeParse({
                ...plan,
                scope: { ...(plan as { scope: object }).scope, unknownNested: true },
            }).success
        ).toBe(false)
        expect(generalReviewResultDraftSchema.safeParse({ ...general, disposition: 'unknown' }).success).toBe(false)
        expect(generalReviewResultDraftSchema.safeParse({ ...general, summary: '   ' }).success).toBe(false)
    })

    it('Review finding 必须声明它是待处理问题还是仅供展示的观察项', () => {
        const general = validContracts.find(contract => contract.name === 'General Reviewer')!.value
        const finding = {
            description: '需求覆盖完整。',
            evidence: ['Plan 和 Tasks 都覆盖了验收项。'],
            findingType: 'observation',
            requirement: 'required',
            severity: 'low',
            suggestedAction: 'No action is required.',
            targetArtifacts: ['plan'],
        }

        expect(generalReviewResultDraftSchema.safeParse({ ...general, findings: [finding] }).success).toBe(true)
        const { findingType: _findingType, ...missingFindingType } = finding
        expect(generalReviewResultDraftSchema.safeParse({ ...general, findings: [missingFindingType] }).success).toBe(false)
    })

    it('Plan 和 Tasks Contract 拒绝依赖环', () => {
        const plan = validContracts.find(contract => contract.name === 'Plan Worker')!.value
        const task = validContracts.find(contract => contract.name === 'Task Worker')!.value

        expect(
            planArtifactDraftSchema.safeParse({
                ...plan,
                deliveryPhases: [
                    { ...plan.deliveryPhases[0], dependsOnPhaseKeys: ['release'], phaseKey: 'design' },
                    { ...plan.deliveryPhases[0], dependsOnPhaseKeys: ['design'], phaseKey: 'release' },
                ],
            }).success
        ).toBe(false)
        expect(
            taskArtifactDraftSchema.safeParse({
                ...task,
                tasks: [
                    { ...task.tasks[0], dependsOnTaskIds: ['TASK-2'], taskId: 'TASK-1' },
                    { ...task.tasks[0], dependsOnTaskIds: ['TASK-1'], taskId: 'TASK-2' },
                ],
            }).success
        ).toBe(false)
    })

    it('Runtime 保持 artifact ID，并在唯一返修时推进 revision 和 Plan 引用', () => {
        const planDraft = planArtifactDraftSchema.parse(validContracts.find(contract => contract.name === 'Plan Worker')!.value)
        const taskDraft = taskArtifactDraftSchema.parse(validContracts.find(contract => contract.name === 'Task Worker')!.value)
        const plan = createRuntimePlanArtifact(planDraft)
        const tasks = createRuntimeTaskArtifact(taskDraft, plan)
        const revisedPlan = reviseRuntimePlanArtifact(plan, { ...planDraft, summary: '已返修方案。' })
        const revisedTasks = reviseRuntimeTaskArtifact(tasks, { ...taskDraft, summary: '已返修任务。' }, revisedPlan)

        expect(revisedPlan).toMatchObject({ artifactId: plan.artifactId, revision: 2 })
        expect(revisedTasks).toMatchObject({
            artifactId: tasks.artifactId,
            planRef: { artifactId: plan.artifactId, revision: 2 },
            revision: 2,
        })
    })

    it('阶段预算分别限制 Supervisor、Worker、Review 和唯一返修', () => {
        const budget = createDeliveryChainExecutionBudget()

        expect(deliveryChainExecutionBudgets).toMatchObject({
            contractRepairAttemptsPerStage: 1,
            postReviewDecision: 1,
            preDecision: 1,
            revisionCycles: 1,
            reviewCycles: 1,
        })
        expect(budget.claim('preDecision')).toBe(true)
        expect(budget.claim('preDecision')).toBe(false)
        expect(budget.claim('reviewCycles')).toBe(true)
        expect(budget.claim('reviewCycles')).toBe(false)
        expect(budget.claim('revisionCycles')).toBe(true)
        expect(budget.claim('revisionCycles')).toBe(false)
    })

    it('仅在 Contract 校验失败时执行一次安全 repair', async () => {
        const invoke = vi
            .fn()
            .mockResolvedValueOnce({ action: 'unknown', rationale: 'invalid enum' })
            .mockResolvedValueOnce({ action: 'finalize', rationale: '评审通过。' })
        const model = {
            withStructuredOutput: vi.fn(() => ({ invoke })),
        }

        const result = await invokeStructuredContract({
            messages: [],
            model,
            name: 'test_supervisor_post',
            schema: supervisorPostReviewDecisionDraftSchema,
        })

        expect(result).toEqual({ action: 'finalize', rationale: '评审通过。' })
        expect(invoke).toHaveBeenCalledTimes(2)
        expect(model.withStructuredOutput).toHaveBeenCalledTimes(2)
        expect(model.withStructuredOutput).toHaveBeenCalledWith(expect.anything(), { name: 'test_supervisor_post' })
        expect(invoke.mock.calls[1]?.[0][0]?.content).toContain('安全的校验问题')
        expect(invoke.mock.calls[1]?.[0][0]?.content).not.toContain('invalid enum')
    })

    it('JSON parser failure also receives one safe repair without echoing model output', async () => {
        const rawOutput = '{"action":"unknown","rationale":"model-private-output"}'
        const invoke = vi
            .fn()
            .mockRejectedValueOnce(new OutputParserException(`Failed to parse: ${rawOutput}`, rawOutput))
            .mockResolvedValueOnce({ action: 'finalize', rationale: '评审通过。' })
        const model = { withStructuredOutput: vi.fn(() => ({ invoke })) }

        await expect(
            invokeStructuredContract({
                messages: [],
                model,
                name: 'test_supervisor_post',
                schema: supervisorPostReviewDecisionDraftSchema,
            })
        ).resolves.toEqual({ action: 'finalize', rationale: '评审通过。' })

        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke.mock.calls[1]?.[0][0]?.content).toContain('output_parsing_failure')
        expect(invoke.mock.calls[1]?.[0][0]?.content).not.toContain(rawOutput)
    })

    it('跨依赖边界的 Parser 错误也会触发安全 repair', async () => {
        const rawOutput = '{"action":"unknown","rationale":"model-private-output"}'
        const invoke = vi
            .fn()
            .mockRejectedValueOnce(
                Object.assign(new Error('parser failure'), {
                    lc_error_code: 'OUTPUT_PARSING_FAILURE',
                    llmOutput: rawOutput,
                    observation: 'private parser observation',
                    sendToLLM: false,
                })
            )
            .mockResolvedValueOnce({ action: 'finalize', rationale: '评审通过。' })
        const model = { withStructuredOutput: vi.fn(() => ({ invoke })) }

        await expect(
            invokeStructuredContract({
                messages: [],
                model,
                name: 'test_cross_package_parser_error',
                schema: supervisorPostReviewDecisionDraftSchema,
            })
        ).resolves.toEqual({ action: 'finalize', rationale: '评审通过。' })

        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke.mock.calls[1]?.[0][0]?.content).toContain('output_parsing_failure')
        expect(invoke.mock.calls[1]?.[0][0]?.content).not.toContain(rawOutput)
    })

    it('跨依赖边界的 Zod 校验错误也会触发一次安全 repair', async () => {
        const invoke = vi
            .fn()
            .mockRejectedValueOnce(
                Object.assign(new Error('schema validation failed'), {
                    issues: [{ code: 'invalid_value', path: ['branch'] }],
                    name: '$ZodError',
                })
            )
            .mockResolvedValueOnce({ action: 'finalize', rationale: '评审通过。' })
        const model = { withStructuredOutput: vi.fn(() => ({ invoke })) }

        await expect(
            invokeStructuredContract({
                messages: [],
                model,
                name: 'test_cross_package_zod_error',
                schema: supervisorPostReviewDecisionDraftSchema,
            })
        ).resolves.toEqual({ action: 'finalize', rationale: '评审通过。' })

        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke.mock.calls[1]?.[0][0]?.content).toContain('branch')
        expect(invoke.mock.calls[1]?.[0][0]?.content).not.toContain('schema validation failed')
    })

    it('业务模型先形成判断，再由固定 Contract transport 编码结果', async () => {
        const businessInvoke = vi.fn().mockResolvedValue({ content: 'The review passes.' })
        const contractInvoke = vi.fn().mockResolvedValue({ action: 'finalize', rationale: '评审通过。' })

        await expect(
            invokeBusinessAgentContract({
                businessModel: { invoke: businessInvoke },
                messages: [],
                model: { withStructuredOutput: vi.fn(() => ({ invoke: contractInvoke })) },
                name: 'test_business_contract_boundary',
                schema: supervisorPostReviewDecisionDraftSchema,
            })
        ).resolves.toEqual({ action: 'finalize', rationale: '评审通过。' })

        expect(businessInvoke).toHaveBeenCalledTimes(1)
        expect(contractInvoke).toHaveBeenCalledTimes(1)
        expect(contractInvoke.mock.calls[0]?.[0].at(-1)).toBeInstanceOf(HumanMessage)
        expect(contractInvoke.mock.calls[0]?.[0].at(-1)?.content).toContain('业务草稿：\nThe review passes.')
    })

    it('运行时语义校验失败时只对 Contract 进行一次安全 repair', async () => {
        const businessInvoke = vi.fn().mockResolvedValue({ content: '需要返修。' })
        const contractInvoke = vi
            .fn()
            .mockResolvedValueOnce({
                action: 'revise',
                rationale: '返修。',
                requests: [
                    {
                        requestKey: 'request-1',
                        requiredActions: ['修复。'],
                        sourceFindingIds: ['finding-1'],
                        summary: '返修。',
                        targets: ['tasks'],
                    },
                ],
                revisionTargets: ['tasks'],
            })
            .mockResolvedValueOnce({ action: 'finalize', rationale: '无需返修。' })

        await expect(
            invokeBusinessAgentContract({
                businessModel: { invoke: businessInvoke },
                messages: [],
                model: { withStructuredOutput: vi.fn(() => ({ invoke: contractInvoke })) },
                name: 'test_post_review_policy_repair',
                schema: supervisorPostReviewDecisionDraftSchema,
                validate: decision =>
                    decision.action === 'revise' ? [{ code: 'post_review_policy_invalid', path: 'postReviewDecision' }] : [],
            })
        ).resolves.toEqual({ action: 'finalize', rationale: '无需返修。' })

        expect(businessInvoke).toHaveBeenCalledTimes(1)
        expect(contractInvoke).toHaveBeenCalledTimes(2)
        expect(contractInvoke.mock.calls[1]?.[0].at(-1)?.content).toContain('post_review_policy_invalid')
    })

    it('缺少 structured tool call 时也只修复一次', async () => {
        const invoke = vi
            .fn()
            .mockRejectedValueOnce(new Error('No tool calls found in the response.'))
            .mockResolvedValueOnce({ action: 'finalize', rationale: '评审通过。' })
        const model = { withStructuredOutput: vi.fn(() => ({ invoke })) }

        await expect(
            invokeStructuredContract({
                messages: [],
                model,
                name: 'test_missing_tool_call',
                schema: supervisorPostReviewDecisionDraftSchema,
            })
        ).resolves.toEqual({ action: 'finalize', rationale: '评审通过。' })

        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke.mock.calls[1]?.[0][0]?.content).toContain('output_parsing_failure')
    })

    it('provider 执行错误不会触发 Contract repair', async () => {
        const invoke = vi.fn().mockRejectedValue(new Error('provider unavailable'))
        const model = { withStructuredOutput: vi.fn(() => ({ invoke })) }

        await expect(
            invokeStructuredContract({
                messages: [],
                model,
                name: 'test_provider_error',
                schema: supervisorPostReviewDecisionDraftSchema,
            })
        ).rejects.toThrow('provider unavailable')
        expect(invoke).toHaveBeenCalledTimes(1)
    })
    it('RuntimeArtifact schema 接受 run-local plan artifact', () => {
        const artifact = createRuntimeArtifact({
            kind: 'plan',
            markdown: '## 实现方案\n\n- 新增登录表单',
            source: {
                stage: 'plan',
                subagentId: 'plan-subagent',
            },
            title: 'Delivery Chain Plan',
        })

        expect(runtimeArtifactSchema.safeParse(artifact).success).toBe(true)
    })

    it('Worker tool result envelope 拒绝未知字段与未声明的 metadata', () => {
        expect(
            deliveryWorkerToolResultSchema.safeParse({
                kind: 'success',
                metadata: { reviewType: 'general' },
                value: {},
                unexpected: true,
            }).success
        ).toBe(false)
        expect(
            deliveryWorkerToolResultSchema.safeParse({
                kind: 'contract_failure',
                issues: [],
            }).success
        ).toBe(false)
    })

    it('Manager tool call schema 只要求 invocationId', () => {
        expect(
            subagentToolCallInputSchema.safeParse({
                invocationId: 'invocation-1',
            }).success
        ).toBe(true)

        expect(
            subagentToolCallInputSchema.safeParse({
                contextBlocks: [],
                instruction: 'plan',
            }).success
        ).toBe(false)
    })

    it('Subagent definitions 声明独立边界和 non-goals', () => {
        const definitions = getDeliveryChainSubagentDefinitions()

        expect(definitions).toEqual([
            expect.objectContaining({
                id: 'plan-subagent',
                inputArtifactKinds: [],
                outputArtifactKinds: ['plan'],
            }),
            expect.objectContaining({
                id: 'task-subagent',
                inputArtifactKinds: ['plan'],
                outputArtifactKinds: ['tasks'],
            }),
            expect.objectContaining({
                id: 'review-subagent',
                inputArtifactKinds: ['plan', 'tasks'],
                outputArtifactKinds: ['review'],
            }),
            expect.objectContaining({
                id: 'risk-subagent',
                inputArtifactKinds: ['plan', 'tasks'],
                outputArtifactKinds: ['review'],
            }),
            expect.objectContaining({
                id: 'boundary-subagent',
                inputArtifactKinds: ['plan', 'tasks'],
                outputArtifactKinds: ['review'],
            }),
        ])
        expect(definitions.every(definition => definition.allowedTools.length === 0)).toBe(true)
        expect(definitions.every(definition => definition.nonGoals.some(goal => goal.includes('Tasklist Agent')))).toBe(true)
    })

    it('Subagent chat tools are scoped to delivery-chain-manager', () => {
        const subagentTools = createDeliveryChainSubagentTools({
            resolveInvocation: () => null,
        })

        expect(
            subagentTools.every(
                subagentTool =>
                    subagentTool.chatToolDefinition.runtimeScopes?.length === 1 &&
                    subagentTool.chatToolDefinition.runtimeScopes[0] === 'delivery-chain-manager'
            )
        ).toBe(true)
    })

    it('未知 invocation 只返回安全 execution failure，不回退到直接 Worker 调用', async () => {
        const subagentTools = createDeliveryChainSubagentTools({ resolveInvocation: () => null })
        const planTool = subagentTools.find(toolDefinition => toolDefinition.id === 'plan-subagent')!.chatToolDefinition

        await expect(planTool.tool.invoke({ invocationId: 'missing-invocation' })).resolves.toEqual({
            failureCode: 'WORKER_INVOCATION_NOT_FOUND',
            kind: 'execution_failed',
        })
    })

    it('Worker Contract 最终失败时保留安全 envelope，不返回 Markdown 或 provider error', async () => {
        const contractInvoke = vi.fn().mockResolvedValue({ unexpected: true })
        const subagentTools = createDeliveryChainSubagentTools({
            resolveInvocation: () => ({
                businessModel: { invoke: vi.fn().mockResolvedValue({ content: 'Business draft.' }) } as never,
                contractModel: { withStructuredOutput: vi.fn(() => ({ invoke: contractInvoke })) },
                messages: [],
                name: 'delivery_chain_plan',
                schema: planArtifactDraftSchema,
            }),
        })
        const planTool = subagentTools.find(toolDefinition => toolDefinition.id === 'plan-subagent')!.chatToolDefinition

        await expect(planTool.tool.invoke({ invocationId: 'contract-failure' })).resolves.toMatchObject({
            kind: 'contract_failure',
            issues: expect.arrayContaining([expect.objectContaining({ path: expect.any(String) })]),
        })
        expect(contractInvoke).toHaveBeenCalledTimes(2)
    })

    it.each([
        { expected: { failureCode: 'MODEL_PROVIDER_UNAVAILABLE', kind: 'execution_failed' }, code: 'MODEL_PROVIDER_UNAVAILABLE' },
        { expected: { kind: 'timeout' }, code: 'MODEL_PROVIDER_TIMEOUT' },
    ])('Worker provider failure $code 使用安全 $expected.kind envelope', async ({ code, expected }) => {
        const providerError = new Error('provider-private-error')
        const subagentTools = createDeliveryChainSubagentTools({
            resolveInvocation: () => ({
                businessModel: { invoke: vi.fn().mockRejectedValue(providerError) } as never,
                contractModel: { withStructuredOutput: vi.fn() },
                messages: [],
                name: 'delivery_chain_plan',
                normalizeError: error => (error === providerError ? { code } : {}),
                schema: planArtifactDraftSchema,
            }),
        })
        const planTool = subagentTools.find(toolDefinition => toolDefinition.id === 'plan-subagent')!.chatToolDefinition

        await expect(planTool.tool.invoke({ invocationId: `provider-${code}` })).resolves.toEqual(expected)
    })

    it('Subagent definitions 的模型侧描述不绑定产品名或内部组件名', () => {
        const definitions = getDeliveryChainSubagentDefinitions()
        const modelFacingText = definitions.map(definition => [definition.description, definition.roleInstruction].join('\n')).join('\n')

        expect(modelFacingText).not.toContain('Delivery Chain requirement')
        expect(modelFacingText).not.toContain('Tasklist Agent')
        expect(modelFacingText).not.toContain('HITL')
    })

    it('DelegationPolicy 强制 plan -> task -> review 顺序和 maxToolCalls', () => {
        const planArtifact = createRuntimeArtifact({
            kind: 'plan',
            markdown: '## 实现方案\n\n- plan',
            source: {
                stage: 'plan',
                subagentId: 'plan-subagent',
            },
            title: 'Delivery Chain Plan',
        })
        const tasksArtifact = createRuntimeArtifact({
            kind: 'tasks',
            markdown: '## 任务拆解\n\n- task',
            source: {
                stage: 'task',
                subagentId: 'task-subagent',
            },
            title: 'Delivery Chain Tasks',
        })

        expect(deliveryChainDelegationPolicy.maxToolCalls).toBe(5)
        expect(
            validateDelegationToolCall({
                artifacts: [],
                expectedToolId: 'task-subagent',
                policy: deliveryChainDelegationPolicy,
                requestedToolId: 'task-subagent',
                toolCallsSoFar: 0,
            })
        ).toEqual(
            expect.objectContaining({
                summary: expect.stringContaining('缺少 plan artifact'),
            })
        )
        expect(
            validateDelegationToolCall({
                artifacts: [planArtifact],
                expectedToolId: 'review-subagent',
                policy: deliveryChainDelegationPolicy,
                requestedToolId: 'review-subagent',
                toolCallsSoFar: 1,
            })
        ).toEqual(
            expect.objectContaining({
                summary: expect.stringContaining('缺少必要 artifact'),
            })
        )
        expect(
            validateDelegationToolCall({
                artifacts: [planArtifact, tasksArtifact],
                expectedToolId: 'review-subagent',
                policy: deliveryChainDelegationPolicy,
                requestedToolId: 'review-subagent',
                toolCallsSoFar: 2,
            })
        ).toBeNull()
        expect(
            validateDelegationToolCall({
                artifacts: [planArtifact, tasksArtifact],
                expectedToolId: 'review-subagent',
                policy: deliveryChainDelegationPolicy,
                requestedToolId: 'review-subagent',
                toolCallsSoFar: 5,
            })
        ).toEqual(
            expect.objectContaining({
                summary: expect.stringContaining('超过最大委派次数'),
            })
        )
    })

    it('no Tasklist Agent boundary 通过 local definitions 保持隔离', () => {
        const definitions = getDeliveryChainSubagentDefinitions()

        expect(definitions.every(definition => definition.allowedTools.every(toolName => !toolName.includes('tasklist')))).toBe(true)
        expect(deliveryChainDelegationPolicy.allowParallel).toBe(false)
        expect(deliveryChainDelegationPolicy.allowNestedDelegation).toBe(false)
    })
})
