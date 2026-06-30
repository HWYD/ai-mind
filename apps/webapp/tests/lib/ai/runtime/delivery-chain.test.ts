import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { AIMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatRequest } from '@/lib/ai/types/chat'

const testState = vi.hoisted(() => ({
    readResource: vi.fn(),
    writeStaticTextPart: vi.fn(),
}))

vi.mock('@/lib/ai/mcp/adapters/project-docs-resource-adapter', () => ({
    projectDocsResourceAdapter: {
        read: testState.readResource,
    },
}))

vi.mock('@ai-mind/stream-core', async importOriginal => {
    const actual = await importOriginal<typeof import('@ai-mind/stream-core')>()

    return {
        ...actual,
        writeStaticTextPart: testState.writeStaticTextPart,
    }
})

import {
    DELIVERY_CHAIN_GRAPH_NODE_IDS,
    resolveDeliveryChainInvocation,
    runDeliveryChainGraph,
    startDeliveryChainRun,
} from '@/lib/ai/runtime/delivery-chain'

function createRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
    return {
        conversationId: 'conversation-1',
        messages: [
            {
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        format: 'markdown',
                        text: '帮我规划一个登录表单，支持手机号、密码和错误提示',
                    },
                ],
            },
        ],
        ...overrides,
    }
}

function createScenarioRequest() {
    return createRequest({
        composer: {
            command: {
                label: '生成交付计划',
                name: 'delivery-chain',
            },
            plainText: '',
            references: [
                {
                    id: 'demo:scenario:request-limit-banner',
                    label: 'request-limit-banner/requirement.md',
                    source: 'local',
                    type: 'resource',
                    uri: 'demo://scenarios/request-limit-banner/requirement.md',
                },
            ],
        },
    })
}

function createInlineRequest(text = '帮我规划一个登录表单，支持手机号、密码和错误提示') {
    return createRequest({
        composer: {
            command: {
                label: '生成交付计划',
                name: 'delivery-chain',
            },
            plainText: text,
        },
        messages: [
            {
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        format: 'markdown',
                        text,
                    },
                ],
            },
        ],
    })
}

function createScenarioGraphInput() {
    return {
        requirementRef: 'demo://scenarios/request-limit-banner/requirement.md',
        scenarioId: 'request-limit-banner',
        source: 'demo_scenario' as const,
    }
}

function getWrittenChunks(writeChunk: ReturnType<typeof vi.fn>) {
    return writeChunk.mock.calls.map(([chunk]) => chunk as ChatStreamChunk)
}

function getWorkflowProgressChunks(writeChunk: ReturnType<typeof vi.fn>) {
    return getWrittenChunks(writeChunk).filter(chunk => chunk.type.startsWith('workflow-progress'))
}

const DELIVERY_CHAIN_GRAPH_NODE_ORDER = [
    DELIVERY_CHAIN_GRAPH_NODE_IDS.loadDeliveryChainContext,
    DELIVERY_CHAIN_GRAPH_NODE_IDS.runPlanStage,
    DELIVERY_CHAIN_GRAPH_NODE_IDS.runTaskStage,
    DELIVERY_CHAIN_GRAPH_NODE_IDS.runReviewStage,
    DELIVERY_CHAIN_GRAPH_NODE_IDS.buildDeliveryChainReport,
]

describe('runtime/delivery-chain', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        testState.readResource.mockImplementation(async ({ uri }: { uri: string }) => ({
            content: `content for ${uri}`,
            contentPreview: `preview for ${uri}`,
            previewChars: 120,
            resourceName: uri.replace('demo://', ''),
            serverId: 'project-docs-server',
            status: 'completed',
            truncated: false,
            uri,
        }))
    })

    it('只在显式 /delivery-chain + scenario requirement 时解析为 ready-scenario', () => {
        expect(resolveDeliveryChainInvocation(createScenarioRequest())).toMatchObject({
            kind: 'ready-scenario',
            scenarioId: 'request-limit-banner',
        })
    })

    it('支持显式 /delivery-chain inline requirement', () => {
        expect(resolveDeliveryChainInvocation(createInlineRequest())).toMatchObject({
            kind: 'ready-inline',
            requirementText: '帮我规划一个登录表单，支持手机号、密码和错误提示',
        })
    })

    it('拒绝 version-plan、非 requirement scenario 文件和 docs scheme', () => {
        expect(
            resolveDeliveryChainInvocation(
                createRequest({
                    composer: {
                        command: {
                            label: '生成交付计划',
                            name: 'delivery-chain',
                        },
                        plainText: '',
                        references: [
                            {
                                id: 'demo:version-plan:v034',
                                label: 'v034-langsmith-observability.md',
                                source: 'local',
                                type: 'resource',
                                uri: 'demo://version-plans/v034-langsmith-observability.md',
                            },
                        ],
                    },
                })
            )
        ).toMatchObject({ kind: 'version-plan-resource' })

        expect(
            resolveDeliveryChainInvocation(
                createRequest({
                    composer: {
                        command: {
                            label: '生成交付计划',
                            name: 'delivery-chain',
                        },
                        plainText: '',
                        references: [
                            {
                                id: 'demo:scenario:context',
                                label: 'request-limit-banner/context.md',
                                source: 'local',
                                type: 'resource',
                                uri: 'demo://scenarios/request-limit-banner/context.md',
                            },
                        ],
                    },
                })
            )
        ).toMatchObject({ kind: 'scenario-non-entry' })

        expect(
            resolveDeliveryChainInvocation(
                createRequest({
                    composer: {
                        command: {
                            label: '生成交付计划',
                            name: 'delivery-chain',
                        },
                        plainText: '',
                        references: [
                            {
                                id: 'docs:version-plan:v034',
                                label: 'v034-langsmith-observability.md',
                                source: 'local',
                                type: 'resource',
                                uri: '@docs://versions/v034-langsmith-observability.md',
                            },
                        ],
                    },
                })
            )
        ).toMatchObject({ kind: 'forbidden-resource' })
    })

    it('空输入会 fail closed 并要求提供 scenario 或需求文本', async () => {
        const writeChunk = vi.fn()

        const handled = await startDeliveryChainRun({
            context: {},
            model: { invoke: vi.fn() } as never,
            request: createRequest({
                composer: {
                    command: {
                        label: '生成交付计划',
                        name: 'delivery-chain',
                    },
                    plainText: '',
                },
                messages: [
                    {
                        role: 'user',
                        parts: [
                            {
                                type: 'text',
                                format: 'markdown',
                                text: '',
                            },
                        ],
                    },
                ],
            }),
            writeChunk,
        })

        expect(handled).toBe(true)
        expect(getWorkflowProgressChunks(writeChunk)).toHaveLength(0)
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.stringContaining('@demo://scenarios/*/requirement.md')
        )
    })

    it('scenario-backed 模式只读取固定 demo 资源，按 Plan -> Task -> Review 顺序执行并输出报告', async () => {
        const invoke = vi
            .fn()
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '## 需求理解\n\n- 需要一个请求上限 banner。\n\n## 实现方案\n\n- 新增轻量提示层。\n\n## 涉及模块\n\n- Chat page\n\n## 非目标\n\n- 不改 stream protocol。\n\n## 风险\n\n- 需要和现有限流状态对齐。\n\n## 验收标准建议\n\n- 接近上限时显示。',
                })
            )
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '## 任务拆解\n\n- 接入限流状态。\n\n## 推荐顺序\n\n1. 先补状态判断\n\n## 风险任务\n\n- Banner 触发阈值\n\n## 验收相关任务\n\n- 补 UI 测试\n\n## 非目标保护任务\n\n- 确认不改 reducer',
                })
            )
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '结论: needs_changes\n\n## 覆盖检查\n\n- 覆盖主要需求。\n\n## 一致性检查\n\n- Plan 与 Task 基本一致。\n\n## 范围漂移检查\n\n- 未发现超出 public demo 边界。\n\n## 风险与下一步建议\n\n- 先确认触发阈值。',
                })
            )
        const writeChunk = vi.fn()

        const handled = await startDeliveryChainRun({
            context: {},
            model: { invoke } as never,
            request: createScenarioRequest(),
            writeChunk,
        })

        expect(handled).toBe(true)
        expect(invoke).toHaveBeenCalledTimes(3)
        expect(testState.readResource.mock.calls.map(([input]) => input.uri)).toEqual([
            'demo://rubrics/plan-rubric.md',
            'demo://rubrics/task-rubric.md',
            'demo://rubrics/review-rubric.md',
            'demo://governance/delivery-boundaries.md',
            'demo://governance/engineering-rules.md',
            'demo://scenarios/request-limit-banner/requirement.md',
            'demo://scenarios/request-limit-banner/context.md',
        ])
        expect(writeChunk).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'resource-start',
                uri: 'demo://scenarios/request-limit-banner/requirement.md',
            })
        )
        expect(getWorkflowProgressChunks(writeChunk)).toEqual([
            expect.objectContaining({
                type: 'workflow-progress-start',
                workflowKind: 'delivery-chain',
            }),
            expect.objectContaining({ status: 'running', stepId: 'load', type: 'workflow-progress-step' }),
            expect.objectContaining({ status: 'completed', stepId: 'load', type: 'workflow-progress-step' }),
            expect.objectContaining({
                details: ['调用模型：生成方案 (plan)'],
                status: 'running',
                stepId: 'plan',
                type: 'workflow-progress-step',
            }),
            expect.objectContaining({ status: 'completed', stepId: 'plan', type: 'workflow-progress-step' }),
            expect.objectContaining({
                details: ['调用模型：拆解任务 (tasks)'],
                status: 'running',
                stepId: 'task',
                type: 'workflow-progress-step',
            }),
            expect.objectContaining({ status: 'completed', stepId: 'task', type: 'workflow-progress-step' }),
            expect.objectContaining({
                details: ['调用模型：交付评审 (review)'],
                status: 'running',
                stepId: 'review',
                type: 'workflow-progress-step',
            }),
            expect.objectContaining({ status: 'completed', stepId: 'review', type: 'workflow-progress-step' }),
            expect.objectContaining({
                details: ['汇总并生成最终报告'],
                status: 'running',
                stepId: 'report',
                type: 'workflow-progress-step',
            }),
            expect.objectContaining({ status: 'completed', stepId: 'report', type: 'workflow-progress-step' }),
            expect.objectContaining({ status: 'completed', type: 'workflow-progress-end' }),
        ])
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(
            writeChunk,
            expect.stringContaining('# Delivery Chain Report / 交付计划报告')
        )
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('## 实现方案'))
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('## 任务拆解'))
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('## 交付评审'))
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('`needs_changes`'))
    })

    it('DeliveryChainGraph happy path 按固定节点顺序执行，且不引入额外 checkpoint 或 HITL chunk', async () => {
        const invoke = vi
            .fn()
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '## 需求理解\n\n- 需要一个请求上限 banner。\n\n## 实现方案\n\n- 新增轻量提示层。\n\n## 涉及模块\n\n- Chat page\n\n## 非目标\n\n- 不改 stream protocol。\n\n## 风险\n\n- 需要和现有限流状态对齐。\n\n## 验收标准建议\n\n- 接近上限时显示。',
                })
            )
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '## 任务拆解\n\n- 接入限流状态。\n\n## 推荐顺序\n\n1. 先补状态判断\n\n## 风险任务\n\n- Banner 触发阈值\n\n## 验收相关任务\n\n- 补 UI 测试\n\n## 非目标保护任务\n\n- 确认不改 reducer',
                })
            )
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '结论: pass\n\n## 覆盖检查\n\n- 覆盖主要需求。\n\n## 一致性检查\n\n- Plan 与 Task 基本一致。\n\n## 范围漂移检查\n\n- 未发现超出 public demo 边界。\n\n## 风险与下一步建议\n\n- 可以进入实现。',
                })
            )
        const writeChunk = vi.fn()

        const graphState = await runDeliveryChainGraph({
            context: {},
            input: createScenarioGraphInput(),
            model: { invoke } as never,
            writeChunk,
        })

        expect(invoke).toHaveBeenCalledTimes(3)
        expect(graphState.visitedNodes).toEqual(DELIVERY_CHAIN_GRAPH_NODE_ORDER)
        expect(graphState.plan).toMatchObject({ stage: 'plan', status: 'completed' })
        expect(graphState.task).toMatchObject({ stage: 'task', status: 'completed' })
        expect(graphState.review).toMatchObject({ stage: 'review', status: 'completed' })
        expect(graphState.reviewDisposition).toBe('pass')
        expect(graphState.status).toBe('completed')
        expect(graphState.reportMarkdown).toContain('# Delivery Chain Report / 交付计划报告')
        expect(graphState.reportMarkdown).toContain('## 实现方案')
        expect(graphState.reportMarkdown).toContain('## 任务拆解')
        expect(graphState.reportMarkdown).toContain('## 交付评审')
        expect(new Set(writeChunk.mock.calls.map(([chunk]) => chunk.type))).toEqual(new Set(['resource-start', 'resource-end']))
    })

    it('graph 在 stage 调用失败时会 soft fail，并继续输出安全报告', async () => {
        const invoke = vi
            .fn()
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '## 需求理解\n\n- 需要一个请求上限 banner。\n\n## 实现方案\n\n- 新增轻量提示层。\n\n## 涉及模块\n\n- Chat page\n\n## 非目标\n\n- 不改 stream protocol。\n\n## 风险\n\n- 需要和现有限流状态对齐。\n\n## 验收标准建议\n\n- 接近上限时显示。',
                })
            )
            .mockRejectedValueOnce(new Error('task stage failed'))
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '结论: needs_changes\n\n## 覆盖检查\n\n- 需要补足任务拆解。\n\n## 一致性检查\n\n- Plan 与 Task 需人工复核。\n\n## 范围漂移检查\n\n- 未发现超出 public demo 边界。\n\n## 风险与下一步建议\n\n- 先补任务细节。',
                })
            )

        const writeChunk = vi.fn()

        const graphState = await runDeliveryChainGraph({
            context: {},
            input: createScenarioGraphInput(),
            model: { invoke } as never,
            writeChunk,
        })

        expect(invoke).toHaveBeenCalledTimes(3)
        expect(graphState.visitedNodes).toEqual(DELIVERY_CHAIN_GRAPH_NODE_ORDER)
        expect(graphState.task).toMatchObject({ stage: 'task', status: 'failed' })
        expect(graphState.reviewDisposition).toBe('needs_changes')
        expect(graphState.status).toBe('failed')
        expect(graphState.reportMarkdown).toContain('TaskStage 调用失败')
        expect(graphState.reportMarkdown).toContain('## 任务拆解')
        expect(graphState.reportMarkdown).toContain('# Delivery Chain Report / 交付计划报告')
        expect(new Set(writeChunk.mock.calls.map(([chunk]) => chunk.type))).toEqual(new Set(['resource-start', 'resource-end']))
    })

    it('短 inline requirement 会在报告里补默认假设', async () => {
        const invoke = vi
            .fn()
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '## 需求理解\n\n- 简化需求。\n\n## 实现方案\n\n- 轻量实现。\n\n## 涉及模块\n\n- Demo shell\n\n## 非目标\n\n- 不写代码。\n\n## 风险\n\n- 信息不足。\n\n## 验收标准建议\n\n- 人工确认。',
                })
            )
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '## 任务拆解\n\n- 补充信息\n\n## 推荐顺序\n\n1. 先确认范围\n\n## 风险任务\n\n- 无\n\n## 验收相关任务\n\n- 无\n\n## 非目标保护任务\n\n- 无',
                })
            )
            .mockResolvedValueOnce(
                new AIMessage({
                    content:
                        '结论: blocked\n\n## 覆盖检查\n\n- 信息不足。\n\n## 一致性检查\n\n- 暂无法确认。\n\n## 范围漂移检查\n\n- 无\n\n## 风险与下一步建议\n\n- 补充上下文。',
                })
            )
        const writeChunk = vi.fn()

        await startDeliveryChainRun({
            context: {},
            model: { invoke } as never,
            request: createInlineRequest('做个表单'),
            writeChunk,
        })

        expect(
            getWorkflowProgressChunks(writeChunk)
                .filter(chunk => chunk.type === 'workflow-progress-step')
                .map(chunk => `${chunk.stepId}:${chunk.status}`)
        ).toEqual([
            'load:running',
            'load:completed',
            'plan:running',
            'plan:completed',
            'task:running',
            'task:completed',
            'review:running',
            'review:completed',
            'report:running',
            'report:completed',
        ])
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('inline requirement 较短'))
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('`blocked`'))
    })
})
