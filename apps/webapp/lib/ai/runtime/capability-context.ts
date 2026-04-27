import type { StreamErrorCode } from '@ai-mind/stream-core/protocol'
import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages'

import { buildCapabilityId } from '@/lib/ai/capabilities/id'
import type { CapabilityIdentity, CapabilityLocation, CapabilityType } from '@/lib/ai/capabilities/types'
import { createId } from '@/lib/ai/create-id'
import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'
import { MCPHostError, toErrorMessage } from '@/lib/ai/mcp/protocol/errors'
import type { MCPServerId } from '@/lib/ai/mcp/protocol/types'
import type { SkillDefinition } from '@/lib/ai/skills'
import type { ChatRequest } from '@/lib/ai/types/chat'

import { throwIfAborted, writeStreamErrorChunk } from './stream-errors'
import type { ChatExecutionContext, WriteChunk } from './types'

/**
 * v0.0.11 最小 capability runtime 消费层。
 * 这层只负责 reader-skill 下的固定 remote MCP 能力闭环，不承担通用 planner、workflow 或 Agent 编排职责。
 */
const PROJECT_ASSISTANT_SERVER_ID = 'project-assistant-service'
const LATEST_CONTEXT_RESOURCE_NAME = 'latest-context'
const LATEST_CONTEXT_RESOURCE_URI = 'project://latest-context'
const TASKLIST_DRAFT_PROMPT_NAME = 'tasklist-draft'
const DOC_CONSISTENCY_TOOL_NAME = 'check_doc_consistency'
const REMOTE_CONTEXT_PREVIEW_CHARS = 3000

const PROJECT_CONTEXT_PATTERNS = [/latest-context/i, /当前项目上下文/, /项目上下文/, /项目状态/, /项目.*最近在做什么/]
const TASKLIST_DRAFT_PATTERNS = [/tasklist/i, /任务清单/, /执行清单/]
const DOC_CONSISTENCY_PATTERNS = [/check_doc_consistency/i, /文档一致性/, /检查.*文档.*一致/, /文档.*不一致/]

interface RemoteCapabilityInvocation {
    capabilityType: CapabilityType
    execute: (options: ExecuteRemoteCapabilityOptions) => Promise<BaseMessage[]>
    input: string
    location: Extract<CapabilityLocation, 'remote'>
    name: string
    serverId: MCPServerId
    source: 'mcp'
}

interface ExecuteRemoteCapabilityOptions {
    context: ChatExecutionContext
    writeChunk: WriteChunk
}

type RemoteCapabilityName = typeof DOC_CONSISTENCY_TOOL_NAME | typeof LATEST_CONTEXT_RESOURCE_NAME | typeof TASKLIST_DRAFT_PROMPT_NAME

/**
 * 读取本轮最后一条用户消息，作为 capability 命中和最小参数注入的唯一输入。
 * 当前不读取 assistant 历史，避免把上一轮模型回答误当作本轮 capability 目标。
 */
function getLastUserMessageText(request: ChatRequest) {
    for (let index = request.messages.length - 1; index >= 0; index -= 1) {
        const message = request.messages[index]

        if (message.role !== 'user') {
            continue
        }

        return message.parts
            .map(part => ('text' in part ? part.text : ''))
            .join('\n')
            .trim()
    }

    return ''
}

/**
 * 对一组固定高置信规则做命中判断。
 * v0.0.11 只做最小规则路由，不引入模型分类器或可配置 DSL。
 */
function matchesAny(text: string, patterns: RegExp[]) {
    return patterns.some(pattern => pattern.test(text))
}

/**
 * 构造 remote MCP capability 的标准 identity。
 * 后续是否允许执行会基于这个 identity 和 skill.capabilitySelectors 做匹配。
 */
function createRemoteCapabilityIdentity(name: RemoteCapabilityName, capabilityType: CapabilityType): CapabilityIdentity {
    return {
        capabilityType,
        location: 'remote',
        name,
        providerKind: 'mcp',
        serverId: PROJECT_ASSISTANT_SERVER_ID,
    }
}

/**
 * 判断当前 Skill 是否声明承接该 capability。
 * 这里把 capabilitySelectors 当作“能力边界”，确保 runtime 不会越过 skill 声明去调用远端能力。
 */
function isRemoteCapabilityAllowed(skillDefinition: SkillDefinition, identity: CapabilityIdentity) {
    const capabilityId = buildCapabilityId(identity)

    return skillDefinition.capabilitySelectors?.some(selector => {
        if (selector.capabilityIds && !selector.capabilityIds.includes(capabilityId)) {
            return false
        }

        if (selector.providerKind && selector.providerKind !== identity.providerKind) {
            return false
        }

        if (selector.location && selector.location !== identity.location) {
            return false
        }

        if (selector.serverId && selector.serverId !== identity.serverId) {
            return false
        }

        if (selector.capabilityType && selector.capabilityType !== identity.capabilityType) {
            return false
        }

        if (selector.names && !selector.names.includes(identity.name)) {
            return false
        }

        return true
    })
}

/**
 * 创建一次可执行的 remote capability invocation。
 * invocation 自带 execute 方法，让 orchestrator 只消费统一对象，不需要知道具体 resource/prompt/tool 名称。
 */
function createRemoteCapabilityInvocation(
    name: RemoteCapabilityName,
    capabilityType: CapabilityType,
    userGoal: string
): RemoteCapabilityInvocation {
    const invocation: RemoteCapabilityInvocation = {
        capabilityType,
        execute: async options => {
            if (capabilityType === 'resource') {
                return executeRemoteResourceInvocation(invocation, options)
            }

            if (capabilityType === 'prompt') {
                return executeRemotePromptInvocation(invocation, options)
            }

            return executeRemoteToolInvocation(invocation, options)
        },
        input: capabilityType === 'resource' ? LATEST_CONTEXT_RESOURCE_URI : `goal=${userGoal}`,
        location: 'remote',
        name,
        serverId: PROJECT_ASSISTANT_SERVER_ID,
        source: 'mcp',
    }

    return invocation
}

/**
 * 将 MCP Host 层错误码映射到流式协议的稳定 errorCode。
 * 前端只依赖这些 MCP_* 语义，不需要解析底层 SDK 或 HTTP 错误文案。
 */
function toMCPStreamErrorCode(error: unknown): StreamErrorCode {
    if (!(error instanceof MCPHostError)) {
        return 'MCP_EXECUTION_FAILED'
    }

    switch (error.code) {
        case 'UNAUTHORIZED':
            return 'MCP_UNAUTHORIZED'
        case 'FORBIDDEN':
            return 'MCP_FORBIDDEN'
        case 'NOT_FOUND':
        case 'SERVER_NOT_FOUND':
            return 'MCP_NOT_FOUND'
        case 'TIMEOUT':
            return 'MCP_TIMEOUT'
        default:
            return 'MCP_EXECUTION_FAILED'
    }
}

/**
 * 从 MCP SDK 返回的 content/contents 数组中抽取文本。
 * 当前 remote mock 能力都只返回 text 内容，非 text 内容先忽略，避免过早扩展多模态结构。
 */
function extractTextFromContentParts(contentParts: Array<unknown> | undefined) {
    const textParts: string[] = []

    for (const contentPart of contentParts ?? []) {
        if (!contentPart || typeof contentPart !== 'object') {
            continue
        }

        if ('text' in contentPart && typeof contentPart.text === 'string') {
            textParts.push(contentPart.text)
        }
    }

    return textParts.join('\n').trim()
}

/**
 * 为资源卡片生成前端预览文本。
 * 完整内容仍会进入模型上下文，前端只展示有限预览，避免大文本撑爆消息流。
 */
function createContentPreview(content: string) {
    return content.length > REMOTE_CONTEXT_PREVIEW_CHARS ? content.slice(0, REMOTE_CONTEXT_PREVIEW_CHARS) : content
}

/**
 * 把 MCP prompts/get 的消息转换成 LangChain BaseMessage。
 * 这是 prompt capability 进入最终回答阶段的适配点，不把完整 prompt 正文直接暴露给前端。
 */
function toPromptContextMessages(messages: Awaited<ReturnType<typeof mcpClientManager.getPrompt>>['result']['messages']): BaseMessage[] {
    const contextMessages: BaseMessage[] = []

    for (const message of messages ?? []) {
        if (message.content.type !== 'text') {
            continue
        }

        const text = message.content.text.trim()

        if (!text) {
            continue
        }

        contextMessages.push(message.role === 'assistant' ? new AIMessage(text) : new HumanMessage(text))
    }

    return contextMessages
}

/**
 * 构造 capability 失败时仍可进入最终回答的上下文。
 * 这样单个 remote 能力不可用时，整轮对话不会中断，模型也会被约束不要编造结果。
 */
function createFailureContextMessage(invocation: RemoteCapabilityInvocation, error: unknown) {
    return new HumanMessage(
        [
            '以下远程 MCP capability 本轮调用失败。',
            `类型：${invocation.capabilityType}`,
            `名称：${invocation.name}`,
            `服务：${invocation.serverId}`,
            `错误：${toErrorMessage(error)}`,
            '请在最终回答中简短说明该能力暂时不可用，不要编造未获取到的结果。',
        ].join('\n')
    )
}

/**
 * 写出统一错误 chunk。
 * 注意：调用方必须已经先写出对应 start chunk，并复用同一个 partId，前端才能把失败态落到正确卡片上。
 */
function writeRemoteCapabilityError(writeChunk: WriteChunk, invocation: RemoteCapabilityInvocation, partId: string, error: unknown) {
    const basePayload = {
        errorCode: toMCPStreamErrorCode(error),
        location: invocation.location,
        message: toErrorMessage(error),
        partId,
        retryable: true,
        serverId: invocation.serverId,
        source: invocation.source,
        stage: 'final-answer' as const,
    }

    if (invocation.capabilityType === 'resource') {
        writeStreamErrorChunk(writeChunk, {
            ...basePayload,
            resourceName: invocation.name,
            scope: 'resource',
            uri: LATEST_CONTEXT_RESOURCE_URI,
        })
        return
    }

    if (invocation.capabilityType === 'prompt') {
        writeStreamErrorChunk(writeChunk, {
            ...basePayload,
            promptName: invocation.name,
            scope: 'prompt',
        })
        return
    }

    writeStreamErrorChunk(writeChunk, {
        ...basePayload,
        input: invocation.input,
        scope: 'tool',
        toolName: invocation.name,
    })
}

/**
 * 执行 remote resource：project://latest-context。
 * 成功时写 resource-start/resource-end，并把完整 resource 文本注入最终回答上下文。
 */
async function executeRemoteResourceInvocation(invocation: RemoteCapabilityInvocation, options: ExecuteRemoteCapabilityOptions) {
    const partId = createId()

    options.writeChunk({
        type: 'resource-start',
        partId,
        resourceName: invocation.name,
        uri: LATEST_CONTEXT_RESOURCE_URI,
        source: invocation.source,
        location: invocation.location,
        serverId: invocation.serverId,
    })

    try {
        throwIfAborted(options.context.signal)
        const response = await mcpClientManager.readResource(invocation.serverId, {
            uri: LATEST_CONTEXT_RESOURCE_URI,
        })
        const content = extractTextFromContentParts(response.result.contents)

        if (!content) {
            throw new MCPHostError('REQUEST_FAILED', 'project://latest-context 没有返回可用文本内容。')
        }

        options.writeChunk({
            type: 'resource-end',
            partId,
            resourceName: invocation.name,
            uri: LATEST_CONTEXT_RESOURCE_URI,
            source: invocation.source,
            location: invocation.location,
            serverId: invocation.serverId,
            contentPreview: createContentPreview(content),
            isTruncated: content.length > REMOTE_CONTEXT_PREVIEW_CHARS,
            previewChars: REMOTE_CONTEXT_PREVIEW_CHARS,
        })

        return [
            new HumanMessage(
                ['以下是 remote MCP resource `project://latest-context` 返回的项目上下文，请优先基于它回答。', content].join('\n\n')
            ),
        ]
    } catch (error) {
        if (options.context.signal?.aborted) {
            throw error
        }

        writeRemoteCapabilityError(options.writeChunk, invocation, partId, error)

        return [createFailureContextMessage(invocation, error)]
    }
}

/**
 * 执行 remote prompt：tasklist-draft。
 * 成功时写 prompt-start/prompt-end，并把 prompt 返回消息转换为最终回答上下文。
 */
async function executeRemotePromptInvocation(invocation: RemoteCapabilityInvocation, options: ExecuteRemoteCapabilityOptions) {
    const partId = createId()

    options.writeChunk({
        type: 'prompt-start',
        partId,
        promptName: invocation.name,
        source: invocation.source,
        location: invocation.location,
        serverId: invocation.serverId,
        input: invocation.input,
    })

    try {
        throwIfAborted(options.context.signal)
        const response = await mcpClientManager.getPrompt(invocation.serverId, {
            name: TASKLIST_DRAFT_PROMPT_NAME,
            arguments: {
                goal: invocation.input.replace(/^goal=/, ''),
            },
        })
        const messages = toPromptContextMessages(response.result.messages)

        if (messages.length === 0) {
            throw new MCPHostError('REQUEST_FAILED', 'tasklist-draft 没有返回可注入的 prompt 消息。')
        }

        options.writeChunk({
            type: 'prompt-end',
            partId,
            promptName: invocation.name,
            source: invocation.source,
            location: invocation.location,
            serverId: invocation.serverId,
            status: 'completed',
            messageCount: messages.length,
        })

        return messages
    } catch (error) {
        if (options.context.signal?.aborted) {
            throw error
        }

        writeRemoteCapabilityError(options.writeChunk, invocation, partId, error)
        options.writeChunk({
            type: 'prompt-end',
            partId,
            promptName: invocation.name,
            source: invocation.source,
            location: invocation.location,
            serverId: invocation.serverId,
            status: 'failed',
            messageCount: 0,
        })

        return [createFailureContextMessage(invocation, error)]
    }
}

/**
 * 执行 remote tool：check_doc_consistency。
 * 它不走模型 tool_call，而是由 runtime 在高置信 reader 场景下主动调用，用于验证 capability 最小闭环。
 */
async function executeRemoteToolInvocation(invocation: RemoteCapabilityInvocation, options: ExecuteRemoteCapabilityOptions) {
    const partId = createId()

    options.writeChunk({
        type: 'tool-start',
        partId,
        toolName: invocation.name,
        title: '文档一致性检查',
        action: 'check',
        source: invocation.source,
        location: invocation.location,
        serverId: invocation.serverId,
        input: invocation.input,
    })

    try {
        throwIfAborted(options.context.signal)
        const response = await mcpClientManager.callTool(invocation.serverId, {
            name: DOC_CONSISTENCY_TOOL_NAME,
            arguments: {
                focus: invocation.input.replace(/^goal=/, ''),
            },
        })
        const output = extractTextFromContentParts(response.result.content)

        if (!output) {
            throw new MCPHostError('REQUEST_FAILED', 'check_doc_consistency 没有返回可用文本结果。')
        }

        options.writeChunk({
            type: 'tool-end',
            partId,
            toolName: invocation.name,
            title: '文档一致性检查',
            action: 'check',
            source: invocation.source,
            location: invocation.location,
            serverId: invocation.serverId,
            input: invocation.input,
            output,
        })

        return [new HumanMessage(['以下是 remote MCP tool `check_doc_consistency` 的检查结果，请优先基于它回答。', output].join('\n\n'))]
    } catch (error) {
        if (options.context.signal?.aborted) {
            throw error
        }

        writeRemoteCapabilityError(options.writeChunk, invocation, partId, error)

        return [createFailureContextMessage(invocation, error)]
    }
}

/**
 * 将当前用户问题解析成 v0.0.11 固定的 remote capability 调用列表。
 * 这里不是通用 planner，只处理 reader-skill 下的最小闭环验证场景。
 */
export function resolveCapabilityContextInvocations(request: ChatRequest, skillDefinition?: SkillDefinition): RemoteCapabilityInvocation[] {
    if (skillDefinition?.skillId !== 'reader-skill') {
        return []
    }

    const userGoal = getLastUserMessageText(request)
    const invocations: RemoteCapabilityInvocation[] = []
    const candidates: Array<[RemoteCapabilityName, CapabilityType, boolean]> = [
        [LATEST_CONTEXT_RESOURCE_NAME, 'resource', matchesAny(userGoal, PROJECT_CONTEXT_PATTERNS)],
        [TASKLIST_DRAFT_PROMPT_NAME, 'prompt', matchesAny(userGoal, TASKLIST_DRAFT_PATTERNS)],
        [DOC_CONSISTENCY_TOOL_NAME, 'tool', matchesAny(userGoal, DOC_CONSISTENCY_PATTERNS)],
    ]

    for (const [name, capabilityType, matched] of candidates) {
        const identity = createRemoteCapabilityIdentity(name, capabilityType)

        if (matched && isRemoteCapabilityAllowed(skillDefinition, identity)) {
            invocations.push(createRemoteCapabilityInvocation(name, capabilityType, userGoal))
        }
    }

    return invocations
}

/**
 * 顺序执行本轮 remote capability，并把结果转换成最终回答可消费的上下文消息。
 */
export async function executeCapabilityContextInvocations(
    invocations: RemoteCapabilityInvocation[],
    options: ExecuteRemoteCapabilityOptions
): Promise<BaseMessage[]> {
    const contextMessages: BaseMessage[] = []

    for (const invocation of invocations) {
        contextMessages.push(...(await invocation.execute(options)))
    }

    return contextMessages
}
