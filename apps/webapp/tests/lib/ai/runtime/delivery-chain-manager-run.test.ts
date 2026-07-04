import { AIMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import { adaptFinalTurnCandidate, DELIVERY_FINAL_TEXT_LIMIT, DELIVERY_FINAL_TEXT_TRUNCATION_NOTICE } from '@/lib/ai/runtime/chat-memory'
import type { DeliveryChainInput, DeliveryChainResourceBundle } from '@/lib/ai/runtime/delivery-chain/graph-state'
import {
    createDeliveryChainSubagentTools,
    createRuntimeArtifact,
    type DeliveryChainSubagentToolDefinition,
    findRuntimeArtifact,
    runControlledDeliveryManager,
    type SubagentToolCallInput,
    subagentToolCallInputSchema,
    type SubagentToolInput,
} from '@/lib/ai/runtime/delivery-chain/manager'

const modelProviderMocks = vi.hoisted(() => ({
    createChatModel: vi.fn(),
    getModelProviderConfig: vi.fn(),
}))

vi.mock('@/lib/ai/model-provider', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/model-provider')>()

    return {
        ...actual,
        createChatModel: modelProviderMocks.createChatModel,
        getModelProviderConfig: modelProviderMocks.getModelProviderConfig,
    }
})

const testResolvedModelSelection: ResolvedModelSelection = {
    catalogItem: {
        availableIn: ['development'],
        capabilities: {
            chat: true,
            embedding: false,
            jsonOutput: true,
            streaming: true,
            tasklist: false,
            toolCalling: true,
        },
        enabled: true,
        id: 'test-model',
        label: 'Test Model',
        modelKey: 'test-model',
        provider: 'ollama',
        providerModel: 'test-model',
    },
    modelId: 'test-model',
    provider: 'ollama',
    providerModel: 'test-model',
    routeType: 'chat',
}

function createInput(): DeliveryChainInput {
    return {
        requirementRef: 'demo://scenarios/request-limit-banner/requirement.md',
        scenarioId: 'request-limit-banner',
        source: 'demo_scenario',
    }
}

function createResources(): DeliveryChainResourceBundle {
    return {
        contextText: '需要在接近请求上限时展示提醒 banner。',
        governanceText: '只读 @demo:// 公开 demo 资源，不写代码文件。',
        planRubricText: '- 明确实现方案与非目标',
        requirementText: '当接近请求上限时，显示提示 banner。',
        reviewRubricText: '- 判断覆盖与风险',
        scenarioId: 'request-limit-banner',
        sourceRefs: ['demo://scenarios/request-limit-banner/requirement.md', 'demo://scenarios/request-limit-banner/context.md'],
        taskRubricText: '- 任务要按依赖顺序拆解',
        warnings: [],
    }
}

function extractBalancedJson(content: string, startIndex: number) {
    let depth = 0
    let endIndex = -1

    for (let index = startIndex; index < content.length; index += 1) {
        const char = content[index]

        if (char === '{') {
            depth += 1
        } else if (char === '}') {
            depth -= 1

            if (depth === 0) {
                endIndex = index + 1
                break
            }
        }
    }

    if (endIndex < 0) {
        throw new Error(`未找到完整 JSON: ${content}`)
    }

    return content.slice(startIndex, endIndex)
}

function extractToolInvocation(messages: unknown[]) {
    const humanMessage = messages.at(-1) as { content?: string }
    const content = typeof humanMessage?.content === 'string' ? humanMessage.content : ''
    const marker = '请直接发起工具调用'
    const markerIndex = content.indexOf(marker)
    const jsonStart = content.indexOf('{', markerIndex >= 0 ? markerIndex : 0)

    if (jsonStart < 0) {
        throw new Error(`未找到 tool 参数 JSON: ${content}`)
    }

    return JSON.parse(extractBalancedJson(content, jsonStart)) as SubagentToolCallInput
}

function extractExpectedTool(messages: unknown[]) {
    const humanMessage = messages.at(-1) as { content?: string }
    const content = typeof humanMessage?.content === 'string' ? humanMessage.content : ''
    const match = content.match(/下一步必须调用工具[:：]\s*(plan-subagent|task-subagent|review-subagent)/)

    if (match?.[1]) {
        return match[1] as 'plan-subagent' | 'task-subagent' | 'review-subagent'
    }

    // v0.4.1: Review Group 返回 3 个 review-class tools
    if (content.includes('同时调用以下 3 个评审工具')) {
        return 'review-group'
    }

    return 'plan-subagent'
}

// v0.4.1: 从 Review Group 的 prompt 中提取 3 个 tool call inputs
function extractReviewGroupToolInvocations(messages: unknown[]): SubagentToolCallInput[] {
    const humanMessage = messages.at(-1) as { content?: string }
    const content = typeof humanMessage?.content === 'string' ? humanMessage.content : ''
    const marker = '请直接发起 3 个工具调用'
    const markerIndex = content.indexOf(marker)
    const arrayStart = content.indexOf('[', markerIndex >= 0 ? markerIndex : 0)

    if (arrayStart < 0) {
        throw new Error(`未找到 Review Group tool 参数 JSON: ${content}`)
    }

    // 找到匹配的 ]
    let depth = 0
    let endIndex = -1

    for (let i = arrayStart; i < content.length; i += 1) {
        if (content[i] === '[') depth += 1
        else if (content[i] === ']') {
            depth -= 1
            if (depth === 0) {
                endIndex = i + 1
                break
            }
        }
    }

    if (endIndex < 0) {
        throw new Error(`未找到完整 JSON 数组: ${content}`)
    }

    return JSON.parse(content.slice(arrayStart, endIndex)) as SubagentToolCallInput[]
}

function createManagerToolCall(name: string, args: SubagentToolCallInput) {
    return {
        args,
        id: `tool-call:${name}`,
        name,
        type: 'tool_call' as const,
    }
}

function serializeMessages(messages: unknown[]) {
    return messages
        .map(message => {
            const content = (message as { content?: unknown })?.content
            return typeof content === 'string' ? content : JSON.stringify(content)
        })
        .join('\n\n')
}

function overrideSubagentToolDefinition(
    definitions: DeliveryChainSubagentToolDefinition[],
    subagentId: DeliveryChainSubagentToolDefinition['id'],
    handler: () => unknown
) {
    return definitions.map(definition =>
        definition.id === subagentId
            ? {
                  ...definition,
                  chatToolDefinition: {
                      ...definition.chatToolDefinition,
                      tool: tool(async () => handler(), {
                          description: definition.description,
                          name: definition.id,
                          schema: subagentToolCallInputSchema,
                      }),
                  },
              }
            : definition
    ) as DeliveryChainSubagentToolDefinition[]
}

function createInvocationResolver(inputs: Record<string, SubagentToolInput>) {
    return ({ invocationId }: { invocationId: string }) => inputs[invocationId] ?? null
}

function setupMockChatModels(options?: {
    boundInvoke?: (messages: unknown[]) => Promise<AIMessage>
    stageResponses?: string[]
    toolCalling?: boolean
}) {
    // v0.4.1: 使用索引而非 shift()，避免并行调用时竞态
    const stageResponses = [...(options?.stageResponses ?? [])]
    let invokeCount = 0
    const baseInvoke = vi.fn().mockImplementation(async (messages: unknown[]) => {
        // v0.4.1: Review Group 并行调用时，根据 SystemMessage 内容返回对应的 response
        const systemMessage = (messages as Array<{ content?: string }>)[0]
        const content = typeof systemMessage?.content === 'string' ? systemMessage.content : ''

        if (content.includes('风险评审专家')) {
            return new AIMessage({ content: stageResponses[3] ?? '' })
        }

        if (content.includes('边界检查专家')) {
            return new AIMessage({ content: stageResponses[4] ?? '' })
        }

        if (content.includes('交付评审专家')) {
            return new AIMessage({ content: stageResponses[2] ?? '' })
        }

        // 串行阶段按顺序返回
        return new AIMessage({ content: stageResponses[invokeCount++] ?? '' })
    })
    const boundInvoke =
        options?.boundInvoke ??
        (async (messages: unknown[]) => {
            // v0.4.1: Review Group 阶段返回 3 个 review-class tool calls
            const expectedTool = extractExpectedTool(messages)

            if (expectedTool === 'review-group') {
                const reviewInputs = extractReviewGroupToolInvocations(messages)
                const reviewToolNames = ['review-subagent', 'risk-subagent', 'boundary-subagent']

                return new AIMessage({
                    content: '',
                    tool_calls: reviewToolNames.map((name, index) =>
                        createManagerToolCall(name, reviewInputs[index] ?? { invocationId: `fallback-${index}` })
                    ),
                })
            }

            return new AIMessage({
                content: '',
                tool_calls: [createManagerToolCall(expectedTool, extractToolInvocation(messages))],
            })
        })

    const modelHandle = {
        bindTools: vi.fn(() => ({
            invoke: vi.fn().mockImplementation(boundInvoke),
        })),
        capabilities: {
            jsonOutput: true,
            reasoning: true,
            streaming: true,
            toolCalling: options?.toolCalling ?? true,
            usageInStream: true,
        },
        model: {
            invoke: baseInvoke,
        },
        modelId: 'test-model',
        normalizeError: vi.fn(error => error),
        provider: 'ollama' as const,
        providerModel: 'test-model',
    }

    modelProviderMocks.createChatModel.mockReturnValue(modelHandle)

    return { baseInvoke, modelHandle }
}

function createProgressRecorder() {
    const events: Array<{ failureMessage?: string; status: string; stepId: string; summary?: string }> = []

    return {
        events,
        onProgress(event: { failureMessage?: string; status: string; stepId: string; summary?: string }) {
            events.push(event)
        },
    }
}

describe('runtime/delivery-chain-manager run', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        modelProviderMocks.getModelProviderConfig.mockReturnValue({
            allowedProviders: ['ollama'],
            chatMaxOutputTokens: 4096,
            deepseek: {},
            ollama: { baseUrl: 'http://localhost:11434' },
            qwen: {},
            tasklistMaxOutputTokens: 8192,
        })
    })

    it('plan-subagent completed 输出 plan artifact，并按 policy 串行委派 3 次', async () => {
        const managerPrompts: string[] = []
        const { baseInvoke } = setupMockChatModels({
            boundInvoke: async messages => {
                managerPrompts.push(serializeMessages(messages))
                const expectedTool = extractExpectedTool(messages)

                // v0.4.1: Review Group 阶段返回 3 个 review-class tool calls
                if (expectedTool === 'review-group') {
                    const reviewInputs = extractReviewGroupToolInvocations(messages)
                    const reviewToolNames = ['review-subagent', 'risk-subagent', 'boundary-subagent']

                    return new AIMessage({
                        content: '',
                        tool_calls: reviewToolNames.map((name, index) =>
                            createManagerToolCall(name, reviewInputs[index] ?? { invocationId: `fallback-${index}` })
                        ),
                    })
                }

                return new AIMessage({
                    content: '',
                    tool_calls: [createManagerToolCall(expectedTool, extractToolInvocation(messages))],
                })
            },
            stageResponses: [
                [
                    '## 需求理解',
                    '',
                    '- 需要限流 banner',
                    '',
                    '## 实现方案',
                    '',
                    '- 接入状态并显示提醒',
                    '',
                    '## 涉及模块',
                    '',
                    '- Chat page',
                    '',
                    '## 非目标',
                    '',
                    '- 不改 reducer',
                    '',
                    '## 风险',
                    '',
                    '- 阈值定义',
                    '',
                    '## 验收标准建议',
                    '',
                    '- 接近上限时展示 banner',
                ].join('\n'),
                [
                    '## 任务拆解',
                    '',
                    '- 接入限流状态',
                    '',
                    '## 推荐顺序',
                    '',
                    '1. 先补状态',
                    '',
                    '## 风险任务',
                    '',
                    '- 阈值确认',
                    '',
                    '## 验收相关任务',
                    '',
                    '- UI 验证',
                    '',
                    '## 非目标保护任务',
                    '',
                    '- 确认不改 reducer',
                ].join('\n'),
                // v0.4.1: review-subagent
                [
                    '结论: pass',
                    '',
                    '## 覆盖检查',
                    '',
                    '- 覆盖主要需求',
                    '',
                    '## 一致性检查',
                    '',
                    '- plan 与 tasks 一致',
                    '',
                    '## 范围漂移检查',
                    '',
                    '- 未超边界',
                    '',
                    '## 风险与下一步建议',
                    '',
                    '- 可进入实现',
                ].join('\n'),
                // v0.4.1: risk-subagent
                [
                    'severity: low',
                    '',
                    '## 风险识别',
                    '',
                    '- 低风险',
                    '',
                    '## 风险等级',
                    '',
                    '- low',
                    '',
                    '## 缓解建议',
                    '',
                    '- 无需特殊处理',
                ].join('\n'),
                // v0.4.1: boundary-subagent
                [
                    'boundaryStatus: passed',
                    '',
                    '## DB / 持久化边界',
                    '',
                    '- 未触碰',
                    '',
                    '## HITL / checkpoint / resume 边界',
                    '',
                    '- 未触碰',
                    '',
                    '## Stream / UI 边界',
                    '',
                    '- 未触碰',
                    '',
                    '## Tool / Agent 边界',
                    '',
                    '- 未触碰',
                    '',
                    '## 安全边界',
                    '',
                    '- 未触碰',
                ].join('\n'),
            ],
        })
        const progress = createProgressRecorder()

        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            onProgress: progress.onProgress,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-1',
        })

        expect(baseInvoke).toHaveBeenCalledTimes(5)
        expect(result.status).toBe('completed')
        expect(findRuntimeArtifact(result.artifacts, 'plan')).toBeDefined()
        expect(findRuntimeArtifact(result.artifacts, 'tasks')).toBeDefined()
        expect(findRuntimeArtifact(result.artifacts, 'review')).toBeDefined()
        expect(findRuntimeArtifact(result.artifacts, 'delivery_report')).toBeDefined()
        expect(result.trace.invocations).toHaveLength(5)
        expect(result.reportMarkdown).toContain('# Delivery Chain Report / 交付计划报告')
        expect(result.reportMarkdown).toContain('## 实现方案')
        expect(result.reportMarkdown).toContain('## 任务拆解')
        expect(result.reportMarkdown).toContain('## Review 总评')
        expect(progress.events.map(event => `${event.stepId}:${event.status}`)).toEqual([
            'delegate-plan:running',
            'delegate-plan:completed',
            'delegate-task:running',
            'delegate-task:completed',
            'delegate-review-group:running',
            'delegate-review-group:completed',
            'synthesize-report:running',
            'synthesize-report:completed',
        ])
        const serializedProgress = JSON.stringify(progress.events)
        expect(serializedProgress).not.toContain('"inputArtifacts"')
        expect(serializedProgress).not.toContain('"artifacts"')
        expect(serializedProgress).not.toContain('"markdown"')
        expect(managerPrompts).toHaveLength(3)
        expect(managerPrompts.every(prompt => prompt.includes('"invocationId"'))).toBe(true)
        expect(managerPrompts.every(prompt => !prompt.includes('"contextBlocks"'))).toBe(true)
        expect(managerPrompts.every(prompt => !prompt.includes('"inputArtifacts"'))).toBe(true)
        expect(managerPrompts.every(prompt => !prompt.includes('"constraints"'))).toBe(true)
        expect(managerPrompts.join('\n')).not.toContain('AI Mind 的 ControlledDeliveryManager')
        expect(managerPrompts.join('\n')).not.toContain('Agent-as-tool delegation MVP')
        expect(managerPrompts.join('\n')).toContain('任务委派管理器')
    })

    it('manager long final report 交给 final-turn adapter 时会按 8000 字符确定性截断', async () => {
        const longPlanSection = 'A'.repeat(4_600)
        const longTaskSection = 'B'.repeat(4_600)
        setupMockChatModels({
            stageResponses: [
                [
                    '## 需求理解',
                    '',
                    `- ${longPlanSection}`,
                    '',
                    '## 实现方案',
                    '',
                    `- ${longPlanSection}`,
                    '',
                    '## 涉及模块',
                    '',
                    '- Chat page',
                    '',
                    '## 非目标',
                    '',
                    '- 不改 reducer',
                    '',
                    '## 风险',
                    '',
                    '- 阈值定义',
                    '',
                    '## 验收标准建议',
                    '',
                    '- 接近上限时展示 banner',
                ].join('\n'),
                [
                    '## 任务拆解',
                    '',
                    `- ${longTaskSection}`,
                    '',
                    '## 推荐顺序',
                    '',
                    '1. 先补状态',
                    '',
                    '## 风险任务',
                    '',
                    '- 阈值确认',
                    '',
                    '## 验收相关任务',
                    '',
                    '- UI 验证',
                    '',
                    '## 非目标保护任务',
                    '',
                    '- 确认不改 reducer',
                ].join('\n'),
                [
                    '结论: pass',
                    '',
                    '## 覆盖检查',
                    '',
                    '- 覆盖主要需求',
                    '',
                    '## 一致性检查',
                    '',
                    '- plan 与 tasks 一致',
                    '',
                    '## 范围漂移检查',
                    '',
                    '- 未超边界',
                    '',
                    '## 风险与下一步建议',
                    '',
                    '- 可进入实现',
                ].join('\n'),
                [
                    'severity: low',
                    '',
                    '## 风险识别',
                    '',
                    '- 低风险',
                    '',
                    '## 风险等级',
                    '',
                    '- low',
                    '',
                    '## 缓解建议',
                    '',
                    '- 无需特殊处理',
                ].join('\n'),
                [
                    'boundaryStatus: passed',
                    '',
                    '## DB / 持久化边界',
                    '',
                    '- 未触碰',
                    '',
                    '## HITL / checkpoint / resume 边界',
                    '',
                    '- 未触碰',
                    '',
                    '## Stream / UI 边界',
                    '',
                    '- 未触碰',
                    '',
                    '## Tool / Agent 边界',
                    '',
                    '- 未触碰',
                    '',
                    '## 安全边界',
                    '',
                    '- 未触碰',
                ].join('\n'),
            ],
        })

        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-long-report',
        })

        expect(result.status).toBe('completed')
        expect(result.reportMarkdown.length).toBeGreaterThan(DELIVERY_FINAL_TEXT_LIMIT)

        const adapted = adaptFinalTurnCandidate({
            assistantText: result.reportMarkdown,
            completionStatus: 'completed',
            source: 'delivery-chain',
            userText: '生成交付计划',
        })

        expect(adapted?.assistantText.length).toBeLessThanOrEqual(DELIVERY_FINAL_TEXT_LIMIT)
        expect(adapted?.assistantText.endsWith(DELIVERY_FINAL_TEXT_TRUNCATION_NOTICE)).toBe(true)
    })

    it('task-subagent 缺少 plan artifact 时不能 completed', async () => {
        setupMockChatModels({
            boundInvoke: async messages =>
                new AIMessage({
                    content: '',
                    tool_calls: [createManagerToolCall('task-subagent', extractToolInvocation(messages))],
                }),
        })

        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-2',
        })

        expect(result.status).toBe('failed')
        expect(findRuntimeArtifact(result.artifacts, 'tasks')).toBeUndefined()
        expect(result.failureMessage).toContain('期望调用 plan-subagent')
    })

    it('review-subagent 缺少 plan/tasks artifact 时不能 completed', async () => {
        setupMockChatModels({
            boundInvoke: async messages =>
                new AIMessage({
                    content: '',
                    tool_calls: [createManagerToolCall('review-subagent', extractToolInvocation(messages))],
                }),
        })

        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-3',
        })

        expect(result.status).toBe('failed')
        expect(findRuntimeArtifact(result.artifacts, 'review')).toBeUndefined()
        expect(result.failureMessage).toContain('期望调用 plan-subagent')
    })

    it('未注册 tool call 会 fail closed', async () => {
        setupMockChatModels({
            boundInvoke: async messages =>
                new AIMessage({
                    content: '',
                    tool_calls: [createManagerToolCall('rogue-subagent', extractToolInvocation(messages))],
                }),
        })

        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-3b',
        })

        expect(result.status).toBe('failed')
        expect(result.failureMessage).toContain('未收到合法 tool call')
        expect(findRuntimeArtifact(result.artifacts, 'plan')).toBeUndefined()
        expect(result.trace.invocations).toHaveLength(1)
    })

    it('maxDelegations 通过固定 5 次工具调用生效，且不会继续第 6 次', async () => {
        const boundInvoke = vi.fn().mockImplementation(async messages => {
            const expectedTool = extractExpectedTool(messages)

            // v0.4.1: Review Group 阶段返回 3 个 review-class tool calls
            if (expectedTool === 'review-group') {
                const reviewInputs = extractReviewGroupToolInvocations(messages)
                const reviewToolNames = ['review-subagent', 'risk-subagent', 'boundary-subagent']

                return new AIMessage({
                    content: '',
                    tool_calls: reviewToolNames.map((name, index) =>
                        createManagerToolCall(name, reviewInputs[index] ?? { invocationId: `fallback-${index}` })
                    ),
                })
            }

            return new AIMessage({
                content: '',
                tool_calls: [createManagerToolCall(expectedTool, extractToolInvocation(messages))],
            })
        })
        setupMockChatModels({
            boundInvoke,
            stageResponses: [
                [
                    '## 需求理解',
                    '',
                    '- plan',
                    '',
                    '## 实现方案',
                    '',
                    '- plan',
                    '',
                    '## 涉及模块',
                    '',
                    '- module',
                    '',
                    '## 非目标',
                    '',
                    '- no',
                    '',
                    '## 风险',
                    '',
                    '- risk',
                    '',
                    '## 验收标准建议',
                    '',
                    '- done',
                ].join('\n'),
                [
                    '## 任务拆解',
                    '',
                    '- task',
                    '',
                    '## 推荐顺序',
                    '',
                    '1. a',
                    '',
                    '## 风险任务',
                    '',
                    '- b',
                    '',
                    '## 验收相关任务',
                    '',
                    '- c',
                    '',
                    '## 非目标保护任务',
                    '',
                    '- d',
                ].join('\n'),
                // v0.4.1: review-subagent
                [
                    '结论: pass',
                    '',
                    '## 覆盖检查',
                    '',
                    '- ok',
                    '',
                    '## 一致性检查',
                    '',
                    '- ok',
                    '',
                    '## 范围漂移检查',
                    '',
                    '- ok',
                    '',
                    '## 风险与下一步建议',
                    '',
                    '- ok',
                ].join('\n'),
                // v0.4.1: risk-subagent
                [
                    'severity: low',
                    '',
                    '## 风险识别',
                    '',
                    '- low risk',
                    '',
                    '## 风险等级',
                    '',
                    '- low',
                    '',
                    '## 缓解建议',
                    '',
                    '- none',
                ].join('\n'),
                // v0.4.1: boundary-subagent
                [
                    'boundaryStatus: passed',
                    '',
                    '## DB / 持久化边界',
                    '',
                    '- ok',
                    '',
                    '## HITL / checkpoint / resume 边界',
                    '',
                    '- ok',
                    '',
                    '## Stream / UI 边界',
                    '',
                    '- ok',
                    '',
                    '## Tool / Agent 边界',
                    '',
                    '- ok',
                    '',
                    '## 安全边界',
                    '',
                    '- ok',
                ].join('\n'),
            ],
        })

        await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-4',
        })

        // v0.4.1: manager invoke 3 次（plan + task + review-group），baseInvoke 5 次（plan + task + 3 review）
        expect(boundInvoke).toHaveBeenCalledTimes(3)
    })

    it('no parallel delegation：一次多个 tool calls 会 fail closed', async () => {
        setupMockChatModels({
            boundInvoke: async messages =>
                new AIMessage({
                    content: '',
                    tool_calls: [
                        createManagerToolCall(extractExpectedTool(messages), extractToolInvocation(messages)),
                        createManagerToolCall('task-subagent', extractToolInvocation(messages)),
                    ],
                }),
        })

        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-5',
        })

        expect(result.status).toBe('failed')
        expect(result.failureMessage).toContain('多个 tool calls')
    })

    it('failed subagent 不生成正式 artifact', async () => {
        const { modelHandle } = setupMockChatModels({
            stageResponses: [],
        })
        const subagentTools = overrideSubagentToolDefinition(
            createDeliveryChainSubagentTools({
                model: modelHandle.model as never,
            }),
            'plan-subagent',
            () => ({
                markdown: '## 实现方案\n\n- 当前阶段未返回有效内容，请人工补充。',
                status: 'failed' as const,
                summaryForManager: 'Plan Subagent 未完成。',
                warnings: ['Plan Subagent 调用失败，已使用保底文本。'],
            })
        )

        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            subagentTools,
            workflowId: 'workflow-6',
        })

        expect(result.status).toBe('failed')
        expect(findRuntimeArtifact(result.artifacts, 'plan')).toBeUndefined()
    })

    it('invalid JSON-like tool result 会 fail closed', async () => {
        const { modelHandle } = setupMockChatModels({
            stageResponses: [],
        })
        const subagentTools = overrideSubagentToolDefinition(
            createDeliveryChainSubagentTools({
                model: modelHandle.model as never,
            }),
            'plan-subagent',
            () => ({
                markdown: '## 实现方案\n\n- plan',
                status: 'completed' as const,
                warnings: [],
            })
        )

        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            subagentTools,
            workflowId: 'workflow-7',
        })

        expect(result.status).toBe('failed')
        expect(result.failureMessage).toContain('JSON result')
    })

    it('当前模型不支持 tool-calling 时 fail closed，不降级 runner', async () => {
        const { modelHandle, baseInvoke } = setupMockChatModels({
            toolCalling: false,
        })

        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {
                ...modelHandle,
                bindTools: undefined,
            } as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-8',
        })

        expect(result.status).toBe('failed')
        expect(result.failureMessage).toContain('tool-calling')
        expect(baseInvoke).not.toHaveBeenCalled()
    })

    it('subagent model prompts 使用更通用的职责与边界表达', async () => {
        const promptSnapshots: string[] = []
        const stageResponses = ['## 需求理解\n\n- ok', '## 任务拆解\n\n- ok', '结论: pass\n\n## 覆盖检查\n\n- ok']
        const planInvocationId = 'plan-invocation'
        const taskInvocationId = 'task-invocation'
        const reviewInvocationId = 'review-invocation'
        const toolModel = {
            invoke: vi.fn().mockImplementation(async (messages: unknown[]) => {
                promptSnapshots.push(serializeMessages(messages))
                return new AIMessage({ content: stageResponses.shift() ?? '' })
            }),
        } as never

        const planArtifact = createRuntimeArtifact({
            kind: 'plan',
            markdown: '## 实现方案\n\n- plan',
            source: {
                stage: 'plan',
                subagentId: 'plan-subagent',
            },
            title: 'Delivery Chain Plan',
        })
        const taskArtifact = createRuntimeArtifact({
            kind: 'tasks',
            markdown: '## 任务拆解\n\n- task',
            source: {
                stage: 'task',
                subagentId: 'task-subagent',
            },
            title: 'Delivery Chain Tasks',
        })
        const baseInput = {
            constraints: ['不得读取未授权资源，不得写文件，不得触发人工审批或人工中断流程，不得调用其他代理或其他工作流运行时。'],
            contextBlocks: [
                {
                    kind: 'requirement' as const,
                    markdown: '当接近请求上限时，显示提示 banner。',
                    title: 'Requirement',
                },
            ],
        }
        const tools = createDeliveryChainSubagentTools({
            model: toolModel,
            resolveInvocationInput: createInvocationResolver({
                [planInvocationId]: {
                    ...baseInput,
                    inputArtifacts: [],
                    instruction: '请基于 requirement 产出 plan artifact。',
                },
                [reviewInvocationId]: {
                    ...baseInput,
                    inputArtifacts: [planArtifact, taskArtifact],
                    instruction: '请消费 plan 与 tasks artifacts，并产出 review artifact。',
                },
                [taskInvocationId]: {
                    ...baseInput,
                    inputArtifacts: [planArtifact],
                    instruction: '请消费 plan artifact，并产出 tasks artifact。',
                },
            }),
        })

        await tools
            .find(tool => tool.id === 'plan-subagent')!
            .chatToolDefinition.tool.invoke({
                invocationId: planInvocationId,
            })
        await tools
            .find(tool => tool.id === 'task-subagent')!
            .chatToolDefinition.tool.invoke({
                invocationId: taskInvocationId,
            })
        await tools
            .find(tool => tool.id === 'review-subagent')!
            .chatToolDefinition.tool.invoke({
                invocationId: reviewInvocationId,
            })

        const serializedPrompts = promptSnapshots.join('\n')

        expect(serializedPrompts).not.toContain('你是 Delivery Chain 的')
        expect(serializedPrompts).not.toContain('Tasklist Agent')
        expect(serializedPrompts).not.toContain('HITL')
        expect(serializedPrompts).toContain('人工审批或人工中断流程')
        expect(serializedPrompts).toContain('其他代理或其他工作流')
    })

    it('review group 内出现未注册 tool 必须 fail closed', async () => {
        const { baseInvoke } = setupMockChatModels({
            boundInvoke: async messages => {
                const expectedTool = extractExpectedTool(messages)
                if (expectedTool === 'review-group') {
                    return new AIMessage({
                        content: '',
                        tool_calls: [
                            createManagerToolCall(
                                'review-subagent',
                                extractReviewGroupToolInvocations(messages)[0] ?? { invocationId: 'fallback-0' }
                            ),
                            createManagerToolCall(
                                'rogue-subagent',
                                extractReviewGroupToolInvocations(messages)[1] ?? { invocationId: 'fallback-1' }
                            ),
                            createManagerToolCall(
                                'boundary-subagent',
                                extractReviewGroupToolInvocations(messages)[2] ?? { invocationId: 'fallback-2' }
                            ),
                        ],
                    })
                }
                return new AIMessage({
                    content: '',
                    tool_calls: [createManagerToolCall(expectedTool, extractToolInvocation(messages))],
                })
            },
            stageResponses: [
                '## 实现方案\n\n- plan',
                '## 任务拆解\n\n- task',
                '结论: pass\n## 覆盖检查\n\n- ok',
                'severity: low\n## 风险识别\n\n- low',
                'boundaryStatus: passed\n## DB / 持久化边界\n\n- ok',
            ],
        })
        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-rogue-in-review',
        })
        expect(result.status).toBe('failed')
        expect(result.failureMessage).toContain('未注册')
    })

    it('review group 不能调用 plan/task tool', async () => {
        const { baseInvoke } = setupMockChatModels({
            boundInvoke: async messages => {
                const expectedTool = extractExpectedTool(messages)
                if (expectedTool === 'review-group') {
                    return new AIMessage({
                        content: '',
                        tool_calls: [
                            createManagerToolCall(
                                'review-subagent',
                                extractReviewGroupToolInvocations(messages)[0] ?? { invocationId: 'fallback-0' }
                            ),
                            createManagerToolCall(
                                'plan-subagent',
                                extractReviewGroupToolInvocations(messages)[1] ?? { invocationId: 'fallback-1' }
                            ),
                            createManagerToolCall(
                                'boundary-subagent',
                                extractReviewGroupToolInvocations(messages)[2] ?? { invocationId: 'fallback-2' }
                            ),
                        ],
                    })
                }
                return new AIMessage({
                    content: '',
                    tool_calls: [createManagerToolCall(expectedTool, extractToolInvocation(messages))],
                })
            },
            stageResponses: [
                '## 实现方案\n\n- plan',
                '## 任务拆解\n\n- task',
                '结论: pass\n## 覆盖检查\n\n- ok',
                'severity: low\n## 风险识别\n\n- low',
                'boundaryStatus: passed\n## DB / 持久化边界\n\n- ok',
            ],
        })
        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-plan-in-review',
        })
        expect(result.status).toBe('failed')
        expect(result.failureMessage).toContain('非 review-class tool')
    })

    it('boundary blocked 强制 final report blocked', async () => {
        const { baseInvoke } = setupMockChatModels({
            stageResponses: [
                '## 实现方案\n\n- plan',
                '## 任务拆解\n\n- task',
                '结论: pass\n## 覆盖检查\n\n- ok',
                'severity: low\n## 风险识别\n\n- low',
                'boundaryStatus: blocked\n## DB / 持久化边界\n\n- 触碰了数据库边界',
            ],
        })
        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-boundary-blocked',
        })
        expect(result.status).toBe('blocked')
        expect(result.reportMarkdown).toContain('blocked')
    })

    it('3 个 review 全部 failed fail closed', async () => {
        const { baseInvoke } = setupMockChatModels({
            boundInvoke: async messages => {
                const expectedTool = extractExpectedTool(messages)
                if (expectedTool === 'review-group') {
                    const reviewInputs = extractReviewGroupToolInvocations(messages)
                    const reviewToolNames = ['review-subagent', 'risk-subagent', 'boundary-subagent']
                    return new AIMessage({
                        content: '',
                        tool_calls: reviewToolNames.map((name, index) =>
                            createManagerToolCall(name, reviewInputs[index] ?? { invocationId: `fallback-${index}` })
                        ),
                    })
                }
                return new AIMessage({
                    content: '',
                    tool_calls: [createManagerToolCall(expectedTool, extractToolInvocation(messages))],
                })
            },
        })
        // 让 review 阶段的 baseInvoke 抛异常，触发 executor catch 返回 failed
        baseInvoke.mockImplementation(async (messages: unknown[]) => {
            const systemMessage = (messages as Array<{ content?: string }>)[0]
            const content = typeof systemMessage?.content === 'string' ? systemMessage.content : ''
            if (content.includes('评审专家') || content.includes('边界检查专家')) {
                throw new Error('model unavailable')
            }
            return new AIMessage({ content: baseInvoke.mock.calls.length === 1 ? '## 实现方案\n\n- plan' : '## 任务拆解\n\n- task' })
        })
        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-all-review-failed',
        })
        expect(result.status).toBe('failed')
        expect(result.failureMessage).toContain('全部评审子 Agent 失败')
    })

    it('Manager synthesis 不是 raw concatenation', async () => {
        const { baseInvoke } = setupMockChatModels({
            stageResponses: [
                '## 实现方案\n\n- plan',
                '## 任务拆解\n\n- task',
                '结论: pass\n## 覆盖检查\n\n- ok',
                'severity: low\n## 风险识别\n\n- low',
                'boundaryStatus: passed\n## DB / 持久化边界\n\n- ok',
            ],
        })
        const result = await runControlledDeliveryManager({
            input: createInput(),
            modelHandle: {} as never,
            resolvedModelSelection: testResolvedModelSelection,
            resources: createResources(),
            workflowId: 'workflow-synthesis-check',
        })
        expect(result.status).toBe('completed')
        expect(result.reportMarkdown).toContain('## 综合结论')
        expect(result.reportMarkdown).toContain('## 本轮评审覆盖情况')
        expect(result.reportMarkdown).toContain('## Review 总评')
        expect(result.reportMarkdown).toContain('## 风险评估')
        expect(result.reportMarkdown).toContain('## 边界检查')
    })
})
