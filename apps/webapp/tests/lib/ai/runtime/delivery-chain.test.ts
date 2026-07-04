import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { AIMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import type { SubagentToolCallInput } from '@/lib/ai/runtime/delivery-chain/manager'
import type { ChatRequest } from '@/lib/ai/types/chat'

const testState = vi.hoisted(() => ({
    readResource: vi.fn(),
    writeStaticTextPart: vi.fn(),
}))

const modelProviderMocks = vi.hoisted(() => ({
    createChatModel: vi.fn(),
    getModelProviderConfig: vi.fn(),
}))

const chatMemoryMocks = vi.hoisted(() => ({
    appendCompletedTurn: vi.fn(),
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

vi.mock('@/lib/ai/model-provider', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/model-provider')>()

    return {
        ...actual,
        createChatModel: modelProviderMocks.createChatModel,
        getModelProviderConfig: modelProviderMocks.getModelProviderConfig,
    }
})

vi.mock('@/lib/ai/runtime/chat-memory', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/runtime/chat-memory')>()

    return {
        ...actual,
        chatMemoryService: {
            ...actual.chatMemoryService,
            appendCompletedTurn: chatMemoryMocks.appendCompletedTurn,
        },
    }
})

import { buildChatMemoryThreadId } from '@/lib/ai/runtime/chat-memory'
import { resolveDeliveryChainInvocation, startDeliveryChainRun } from '@/lib/ai/runtime/delivery-chain'

const chatMemoryEnv = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

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
    const markerIndex = content.indexOf('请直接发起工具调用')
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

function createDeliveryChainModelHandle(options?: {
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
        bindTools:
            options?.toolCalling === false
                ? undefined
                : vi.fn(() => ({
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

    return {
        baseInvoke,
        handle: modelHandle,
    }
}

function getWrittenChunks(writeChunk: ReturnType<typeof vi.fn>) {
    return writeChunk.mock.calls.map(([chunk]) => chunk as ChatStreamChunk)
}

function getWorkflowProgressChunks(writeChunk: ReturnType<typeof vi.fn>) {
    return getWrittenChunks(writeChunk).filter(chunk => chunk.type.startsWith('workflow-progress'))
}

function getThreadMemoryStatusChunks(writeChunk: ReturnType<typeof vi.fn>) {
    return getWrittenChunks(writeChunk).filter(
        (chunk): chunk is Extract<ChatStreamChunk, { type: 'thread-memory-status' }> => chunk.type === 'thread-memory-status'
    )
}

describe('runtime/delivery-chain', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', chatMemoryEnv.AI_MIND_AGENT_RUN_SESSION_SECRET)
        modelProviderMocks.getModelProviderConfig.mockReturnValue({
            allowedProviders: ['ollama'],
            chatMaxOutputTokens: 4096,
            deepseek: {},
            ollama: { baseUrl: 'http://localhost:11434' },
            qwen: {},
            tasklistMaxOutputTokens: 8192,
        })
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

    it('scenario 模式不会把 command/resource fallback 文本误当成 inline requirement', () => {
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
                                id: 'demo:scenario:request-limit-banner',
                                label: 'request-limit-banner/requirement.md',
                                source: 'local',
                                type: 'resource',
                                uri: 'demo://scenarios/request-limit-banner/requirement.md',
                            },
                        ],
                    },
                    messages: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    type: 'text',
                                    format: 'markdown',
                                    text: '生成交付计划 @request-limit-banner/requirement.md',
                                },
                            ],
                        },
                    ],
                })
            )
        ).toMatchObject({
            inlineRequirementText: undefined,
            kind: 'ready-scenario',
            scenarioId: 'request-limit-banner',
        })
    })

    it('scenario 模式仍保留用户显式补充的 inline note', () => {
        expect(
            resolveDeliveryChainInvocation(
                createRequest({
                    composer: {
                        command: {
                            label: '生成交付计划',
                            name: 'delivery-chain',
                        },
                        plainText: '重点关注移动端状态提示和回退方案',
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
                    messages: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    type: 'text',
                                    format: 'markdown',
                                    text: '生成交付计划 @request-limit-banner/requirement.md',
                                },
                            ],
                        },
                    ],
                })
            )
        ).toMatchObject({
            inlineRequirementText: '重点关注移动端状态提示和回退方案',
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
            modelHandle: {} as never,
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
            resolvedModelSelection: testResolvedModelSelection,
            writeChunk,
        })

        expect(handled).toBe(true)
        expect(getWorkflowProgressChunks(writeChunk)).toHaveLength(0)
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.stringContaining('@demo://scenarios/*/requirement.md')
        )
    })

    it('scenario-backed 模式只读取固定 demo 资源，按 Manager 串行委派并输出报告', async () => {
        const modelHandle = createDeliveryChainModelHandle({
            stageResponses: [
                [
                    '## 需求理解',
                    '',
                    '- 需要一个请求上限 banner',
                    '',
                    '## 实现方案',
                    '',
                    '- 新增轻量提示层。',
                    '',
                    '## 涉及模块',
                    '',
                    '- Chat page',
                    '',
                    '## 非目标',
                    '',
                    '- 不改 stream protocol。',
                    '',
                    '## 风险',
                    '',
                    '- 需要和现有限流状态对齐。',
                    '',
                    '## 验收标准建议',
                    '',
                    '- 接近上限时显示。',
                ].join('\n'),
                [
                    '## 任务拆解',
                    '',
                    '- 接入限流状态。',
                    '',
                    '## 推荐顺序',
                    '',
                    '1. 先补状态判断',
                    '',
                    '## 风险任务',
                    '',
                    '- Banner 触发阈值',
                    '',
                    '## 验收相关任务',
                    '',
                    '- 补 UI 测试',
                    '',
                    '## 非目标保护任务',
                    '',
                    '- 确认不改 reducer',
                ].join('\n'),
                [
                    '结论: needs_changes',
                    '',
                    '## 覆盖检查',
                    '',
                    '- 覆盖主要需求。',
                    '',
                    '## 一致性检查',
                    '',
                    '- Plan 与 Task 基本一致。',
                    '',
                    '## 范围漂移检查',
                    '',
                    '- 未发现超出 public demo 边界。',
                    '',
                    '## 风险与下一步建议',
                    '',
                    '- 先确认触发阈值。',
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
        const writeChunk = vi.fn()

        const handled = await startDeliveryChainRun({
            context: {
                sessionId: 'delivery-scenario-session',
            },
            modelHandle: modelHandle.handle as never,
            request: createScenarioRequest(),
            resolvedModelSelection: testResolvedModelSelection,
            writeChunk,
        })

        expect(handled).toBe(true)
        // v0.4.1: baseInvoke 5 次（plan + task + 3 review）
        expect(modelHandle.baseInvoke).toHaveBeenCalledTimes(5)
        const resourceStartUris = writeChunk.mock.calls
            .map(([chunk]) => chunk as ChatStreamChunk)
            .filter((chunk): chunk is Extract<ChatStreamChunk, { type: 'resource-start' }> => chunk.type === 'resource-start')
            .map(chunk => chunk.uri)

        expect(resourceStartUris).toEqual([
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
        expect(
            getWorkflowProgressChunks(writeChunk)
                .filter(chunk => chunk.type === 'workflow-progress-step')
                .map(chunk => `${chunk.stepId}:${chunk.status}`)
        ).toEqual([
            'load:running',
            'load:completed',
            'delegate-plan:running',
            'delegate-plan:completed',
            'delegate-task:running',
            'delegate-task:completed',
            'delegate-review-group:running',
            'delegate-review-group:completed',
            'synthesize-report:running',
            'synthesize-report:completed',
        ])
        expect(getWorkflowProgressChunks(writeChunk)).toContainEqual(
            expect.objectContaining({
                type: 'workflow-progress-end',
                status: 'completed',
            })
        )
        const progressPayload = JSON.stringify(getWorkflowProgressChunks(writeChunk))
        expect(progressPayload).not.toContain('"inputArtifacts"')
        expect(progressPayload).not.toContain('"artifacts"')
        expect(progressPayload).not.toContain('"markdown"')
        expect(progressPayload).not.toContain('"summaryForManager"')
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(
            writeChunk,
            expect.stringContaining('# Delivery Chain Report / 交付计划报告')
        )
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('## 实现方案'))
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('## 任务拆解'))
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('## Review 总评'))
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('`needs_review`'))

        const chunkTypes = new Set(getWrittenChunks(writeChunk).map(chunk => chunk.type))
        expect(chunkTypes.has('tool-start')).toBe(false)
        expect(chunkTypes.has('tool-end')).toBe(false)
        expect(chunkTypes.has('artifact-start')).toBe(false)
        expect(chunkTypes.has('artifact-end')).toBe(false)
        expect(JSON.stringify(getWrittenChunks(writeChunk))).not.toContain('runtimeArtifact')
        expect(JSON.stringify(getWrittenChunks(writeChunk))).not.toContain('chat-memory')
        expect(chatMemoryMocks.appendCompletedTurn).toHaveBeenCalledWith(
            buildChatMemoryThreadId('delivery-scenario-session', chatMemoryEnv),
            expect.objectContaining({
                assistantMessageId: expect.stringContaining('delivery-chain:'),
                completionStatus: 'completed',
                source: 'delivery-chain',
                userMessageId: expect.stringContaining('delivery-chain:'),
                userText: '帮我规划一个登录表单，支持手机号、密码和错误提示',
            }),
            expect.objectContaining({
                onStatus: expect.any(Function),
            })
        )
    })

    it('Delivery final-turn append 会把 chat-memory compaction status relay 到当前 stream', async () => {
        chatMemoryMocks.appendCompletedTurn.mockImplementationOnce(async (_threadId, _input, options) => {
            options?.onStatus?.({
                status: 'started',
                message: '自动压缩上下文中',
            })
            options?.onStatus?.({
                status: 'succeeded',
                message: '上下文已自动压缩',
                pinnedDecisionCount: 1,
                summaryLength: 96,
            })
        })
        const modelHandle = createDeliveryChainModelHandle({
            stageResponses: [
                [
                    '## 需求理解',
                    '',
                    '- 需要一个请求上限 banner',
                    '',
                    '## 实现方案',
                    '',
                    '- 新增轻量提示层。',
                    '',
                    '## 涉及模块',
                    '',
                    '- Chat page',
                    '',
                    '## 非目标',
                    '',
                    '- 不改 stream protocol。',
                    '',
                    '## 风险',
                    '',
                    '- 需要和现有限流状态对齐。',
                    '',
                    '## 验收标准建议',
                    '',
                    '- 接近上限时显示。',
                ].join('\n'),
                [
                    '## 任务拆解',
                    '',
                    '- 接入限流状态。',
                    '',
                    '## 推荐顺序',
                    '',
                    '1. 先补状态判断',
                    '',
                    '## 风险任务',
                    '',
                    '- Banner 触发阈值',
                    '',
                    '## 验收相关任务',
                    '',
                    '- 补 UI 测试',
                    '',
                    '## 非目标保护任务',
                    '',
                    '- 确认不改 reducer',
                ].join('\n'),
                [
                    '结论: needs_changes',
                    '',
                    '## 覆盖检查',
                    '',
                    '- 覆盖主要需求。',
                    '',
                    '## 一致性检查',
                    '',
                    '- Plan 与 Task 基本一致。',
                    '',
                    '## 范围漂移检查',
                    '',
                    '- 未发现超出 public demo 边界。',
                    '',
                    '## 风险与下一步建议',
                    '',
                    '- 先确认触发阈值。',
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
        const writeChunk = vi.fn()

        const handled = await startDeliveryChainRun({
            context: {
                sessionId: 'delivery-scenario-session',
            },
            modelHandle: modelHandle.handle as never,
            request: createScenarioRequest(),
            resolvedModelSelection: testResolvedModelSelection,
            writeChunk,
        })

        expect(handled).toBe(true)
        expect(getThreadMemoryStatusChunks(writeChunk)).toEqual([
            {
                type: 'thread-memory-status',
                status: 'started',
                message: '自动压缩上下文中',
            },
            {
                type: 'thread-memory-status',
                status: 'succeeded',
                message: '上下文已自动压缩',
                pinnedDecisionCount: 1,
                summaryLength: 96,
            },
        ])
    })

    it('短 inline requirement 会在报告里补默认假设，blocked review 仍输出最终报告', async () => {
        const modelHandle = createDeliveryChainModelHandle({
            stageResponses: [
                [
                    '## 需求理解',
                    '',
                    '- 简化需求。',
                    '',
                    '## 实现方案',
                    '',
                    '- 轻量实现。',
                    '',
                    '## 涉及模块',
                    '',
                    '- Demo shell',
                    '',
                    '## 非目标',
                    '',
                    '- 不写代码。',
                    '',
                    '## 风险',
                    '',
                    '- 信息不足。',
                    '',
                    '## 验收标准建议',
                    '',
                    '- 人工确认。',
                ].join('\n'),
                [
                    '## 任务拆解',
                    '',
                    '- 补充信息',
                    '',
                    '## 推荐顺序',
                    '',
                    '1. 先确认范围',
                    '',
                    '## 风险任务',
                    '',
                    '- 无',
                    '',
                    '## 验收相关任务',
                    '',
                    '- 无',
                    '',
                    '## 非目标保护任务',
                    '',
                    '- 无',
                ].join('\n'),
                [
                    '结论: blocked',
                    '',
                    '## 覆盖检查',
                    '',
                    '- 信息不足。',
                    '',
                    '## 一致性检查',
                    '',
                    '- 暂无法确认。',
                    '',
                    '## 范围漂移检查',
                    '',
                    '- 无',
                    '',
                    '## 风险与下一步建议',
                    '',
                    '- 补充上下文。',
                ].join('\n'),
                // v0.4.1: risk-subagent
                [
                    'severity: medium',
                    '',
                    '## 风险识别',
                    '',
                    '- 信息不足风险',
                    '',
                    '## 风险等级',
                    '',
                    '- medium',
                    '',
                    '## 缓解建议',
                    '',
                    '- 补充上下文',
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
        const writeChunk = vi.fn()

        await startDeliveryChainRun({
            context: {
                sessionId: 'delivery-inline-session',
            },
            modelHandle: modelHandle.handle as never,
            request: createInlineRequest('做个表单'),
            resolvedModelSelection: testResolvedModelSelection,
            writeChunk,
        })

        expect(
            getWorkflowProgressChunks(writeChunk)
                .filter(chunk => chunk.type === 'workflow-progress-step')
                .map(chunk => `${chunk.stepId}:${chunk.status}`)
        ).toEqual([
            'load:running',
            'load:completed',
            'delegate-plan:running',
            'delegate-plan:completed',
            'delegate-task:running',
            'delegate-task:completed',
            'delegate-review-group:running',
            'delegate-review-group:completed',
            'synthesize-report:running',
            'synthesize-report:completed',
        ])
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('inline requirement 较短'))
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('`blocked`'))
        expect(chatMemoryMocks.appendCompletedTurn).toHaveBeenCalledWith(
            buildChatMemoryThreadId('delivery-inline-session', chatMemoryEnv),
            expect.objectContaining({
                assistantMessageId: expect.stringContaining('delivery-chain:'),
                completionStatus: 'blocked',
                source: 'delivery-chain',
                userMessageId: expect.stringContaining('delivery-chain:'),
                userText: '做个表单',
            }),
            expect.objectContaining({
                onStatus: expect.any(Function),
            })
        )
    })

    it('当前模型不支持 tool-calling 时 fail closed，并输出安全报告', async () => {
        const modelHandle = createDeliveryChainModelHandle({
            toolCalling: false,
        })
        const writeChunk = vi.fn()

        const handled = await startDeliveryChainRun({
            context: {},
            modelHandle: modelHandle.handle as never,
            request: createScenarioRequest(),
            resolvedModelSelection: testResolvedModelSelection,
            writeChunk,
        })

        expect(handled).toBe(true)
        expect(modelHandle.baseInvoke).not.toHaveBeenCalled()
        expect(
            getWorkflowProgressChunks(writeChunk)
                .filter(chunk => chunk.type === 'workflow-progress-step')
                .map(chunk => `${chunk.stepId}:${chunk.status}`)
        ).toEqual(['load:running', 'load:completed', 'delegate-plan:failed'])
        expect(getWorkflowProgressChunks(writeChunk)).toContainEqual(
            expect.objectContaining({
                type: 'workflow-progress-end',
                status: 'failed',
            })
        )
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('tool-calling'))
        expect(chatMemoryMocks.appendCompletedTurn).not.toHaveBeenCalled()
    })

    it('Manager 阶段模型调用抛错时不会误报读取上下文失败', async () => {
        const modelHandle = createDeliveryChainModelHandle({
            boundInvoke: async () => {
                throw new Error('provider tool-call failed')
            },
        })
        const writeChunk = vi.fn()

        const handled = await startDeliveryChainRun({
            context: {},
            modelHandle: modelHandle.handle as never,
            request: createScenarioRequest(),
            resolvedModelSelection: testResolvedModelSelection,
            writeChunk,
        })

        expect(handled).toBe(true)
        expect(
            getWorkflowProgressChunks(writeChunk)
                .filter(chunk => chunk.type === 'workflow-progress-step')
                .map(chunk => `${chunk.stepId}:${chunk.status}`)
        ).toEqual(['load:running', 'load:completed', 'delegate-plan:running', 'delegate-plan:failed'])
        expect(JSON.stringify(getWorkflowProgressChunks(writeChunk))).not.toContain('读取上下文未完成')
        expect(testState.writeStaticTextPart).toHaveBeenCalledWith(writeChunk, expect.stringContaining('provider tool-call failed'))
        expect(chatMemoryMocks.appendCompletedTurn).not.toHaveBeenCalled()
    })
})
