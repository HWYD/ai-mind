import type { StreamErrorCode } from '@ai-mind/stream-core/protocol'
import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages'

import { createId } from '@/lib/ai/create-id'
import { localFileSummaryPromptAdapter, projectDocsResourceAdapter } from '@/lib/ai/mcp/adapters'
import { PROJECT_DOCS_SERVER_ID } from '@/lib/ai/mcp/adapters/docs-resource-shared'
import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'
import { MCPHostError, toErrorMessage } from '@/lib/ai/mcp/protocol/errors'
import type { ChatComposerCommand, ChatComposerReference, ChatRequest } from '@/lib/ai/types/chat'

import { throwIfAborted, writeStreamErrorChunk } from './stream-errors'
import type { ChatExecutionContext, WriteChunk } from './types'

const LOCAL_FILE_SUMMARY_PROMPT_NAME = 'local-file-summary'
const PROJECT_ASSISTANT_SERVER_ID = 'project-assistant-service'
const LATEST_CONTEXT_RESOURCE_NAME = 'latest-context'
const LATEST_CONTEXT_RESOURCE_URI = 'project://latest-context'
const REMOTE_CONTEXT_PREVIEW_CHARS = 3000

type ComposerContextInvocation = CommandHintInvocation | DocsResourceInvocation | DocsSummaryInvocation | RemoteResourceInvocation

interface CommandHintInvocation {
    command: ChatComposerCommand
    kind: 'command-hint'
    userGoal: string
}

interface DocsResourceInvocation {
    command?: ChatComposerCommand
    kind: 'docs-resource'
    reference: ChatComposerReference
    userGoal: string
}

interface DocsSummaryInvocation {
    kind: 'docs-summary'
    reference: ChatComposerReference
    userGoal: string
}

interface RemoteResourceInvocation {
    command?: ChatComposerCommand
    kind: 'remote-resource'
    reference: ChatComposerReference
    userGoal: string
}

interface ExecuteComposerContextOptions {
    context: ChatExecutionContext
    writeChunk: WriteChunk
}

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

function getPrimaryComposerReference(request: ChatRequest) {
    return request.composer?.references?.[0]
}

function isDocsResourceReference(reference: ChatComposerReference | undefined) {
    return reference?.type === 'resource' && reference.source === 'local'
}

function isLatestContextReference(reference: ChatComposerReference | undefined) {
    return (
        reference?.type === 'resource' &&
        reference.source === 'remote' &&
        reference.serverId === PROJECT_ASSISTANT_SERVER_ID &&
        reference.uri === LATEST_CONTEXT_RESOURCE_URI
    )
}

function createResourcePreview(content: string, maxChars: number) {
    return content.length > maxChars ? content.slice(0, maxChars) : content
}

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

function toPromptContextMessages(
    messages:
        | Awaited<ReturnType<typeof localFileSummaryPromptAdapter.get>>['messages']
        | Awaited<ReturnType<typeof mcpClientManager.getPrompt>>['result']['messages']
): BaseMessage[] {
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

function createCommandHintMessage(command: ChatComposerCommand, userGoal: string) {
    const commandInstructions: Record<ChatComposerCommand['name'], string> = {
        check: '用户选择了“检查文档一致性”。请围绕一致性检查来组织回答，但不要声称已经调用远程工具或完成真实比对。',
        'delivery-chain':
            '用户选择了“交付链路”。如果本轮没有被受控 Delivery Chain runtime 接管，请提醒用户需要引用 @demo://scenarios/*/requirement.md 或直接补充需求。',
        summary: '用户选择了“总结文档”。如果本轮没有可用文档上下文，请说明需要引用文档或提供内容后才能总结。',
        tasklist: '用户选择了“生成任务清单”。请把回答组织成 tasklist 草稿；如果缺少版本目标，请先给出可继续细化的通用草稿。',
    }

    return new HumanMessage(
        [
            `Composer command：${command.label}（${command.name}）。`,
            commandInstructions[command.name],
            `用户本轮输入：${userGoal || '未提供额外文字，仅选择了 Composer command。'}`,
        ].join('\n')
    )
}

function createDocsResourceContextMessage(options: {
    command?: ChatComposerCommand
    content: string
    resourceName: string
    uri: string
    userGoal: string
}) {
    return new HumanMessage(
        [
            `以下是 Composer 引用的本地 demo resource：${options.uri}。`,
            `文档名称：${options.resourceName}`,
            options.command ? `Composer command：${options.command.label}（${options.command.name}）。` : '',
            `用户本轮输入：${options.userGoal || '未提供额外文字，仅引用了文档资源。'}`,
            '请优先基于该文档内容回答；如果用户没有提出明确问题，请简短说明你已经读取该文档，并给出可继续处理的方向。',
            options.content,
        ]
            .filter(Boolean)
            .join('\n\n')
    )
}

function writeResourceError(
    writeChunk: WriteChunk,
    partId: string,
    error: unknown,
    options: {
        location: 'local' | 'remote'
        resourceName: string
        serverId: string
        uri: string
    }
) {
    writeStreamErrorChunk(writeChunk, {
        scope: 'resource',
        errorCode: toMCPStreamErrorCode(error),
        retryable: true,
        message: toErrorMessage(error),
        stage: 'final-answer',
        partId,
        resourceName: options.resourceName,
        uri: options.uri,
        source: 'mcp',
        location: options.location,
        serverId: options.serverId,
    })
}

function writePromptError(writeChunk: WriteChunk, partId: string, error: unknown) {
    writeStreamErrorChunk(writeChunk, {
        scope: 'prompt',
        errorCode: toMCPStreamErrorCode(error),
        retryable: true,
        message: toErrorMessage(error),
        stage: 'final-answer',
        partId,
        promptName: LOCAL_FILE_SUMMARY_PROMPT_NAME,
        source: 'mcp',
        location: 'local',
        serverId: PROJECT_DOCS_SERVER_ID,
    })
}

async function executeDocsSummaryInvocation(invocation: DocsSummaryInvocation, options: ExecuteComposerContextOptions) {
    const resourcePartId = createId()

    options.writeChunk({
        type: 'resource-start',
        partId: resourcePartId,
        resourceName: invocation.reference.label,
        uri: invocation.reference.uri,
        source: 'mcp',
        location: 'local',
        serverId: PROJECT_DOCS_SERVER_ID,
    })

    try {
        throwIfAborted(options.context.signal)
        const resource = await projectDocsResourceAdapter.read({
            uri: invocation.reference.uri,
        })

        options.writeChunk({
            type: 'resource-end',
            partId: resourcePartId,
            resourceName: resource.resourceName,
            uri: resource.uri,
            source: 'mcp',
            location: 'local',
            serverId: resource.serverId,
            contentPreview: resource.contentPreview,
            isTruncated: resource.truncated,
            previewChars: resource.previewChars,
        })

        const promptPartId = createId()
        const promptInput = [`filename=${resource.resourceName}`, `userGoal=${invocation.userGoal || '通用摘要'}`].join('\n')

        options.writeChunk({
            type: 'prompt-start',
            partId: promptPartId,
            promptName: LOCAL_FILE_SUMMARY_PROMPT_NAME,
            source: 'mcp',
            location: 'local',
            serverId: PROJECT_DOCS_SERVER_ID,
            input: promptInput,
        })

        try {
            throwIfAborted(options.context.signal)
            const prompt = await localFileSummaryPromptAdapter.get({
                filename: resource.resourceName,
                content: resource.content,
                userGoal: invocation.userGoal,
            })
            const messages = toPromptContextMessages(prompt.messages)

            if (messages.length === 0) {
                throw new MCPHostError('REQUEST_FAILED', 'local-file-summary 没有返回可注入的 prompt 消息。')
            }

            options.writeChunk({
                type: 'prompt-end',
                partId: promptPartId,
                promptName: prompt.promptName,
                source: 'mcp',
                location: 'local',
                serverId: prompt.serverId,
                status: 'completed',
                messageCount: messages.length,
            })

            return messages
        } catch (error) {
            if (options.context.signal?.aborted) {
                throw error
            }

            writePromptError(options.writeChunk, promptPartId, error)
            options.writeChunk({
                type: 'prompt-end',
                partId: promptPartId,
                promptName: LOCAL_FILE_SUMMARY_PROMPT_NAME,
                source: 'mcp',
                location: 'local',
                serverId: PROJECT_DOCS_SERVER_ID,
                status: 'failed',
                messageCount: 0,
            })
            return [new HumanMessage(`local-file-summary Prompt 获取失败：${toErrorMessage(error)}。请不要编造摘要内容。`)]
        }
    } catch (error) {
        if (options.context.signal?.aborted) {
            throw error
        }

        writeResourceError(options.writeChunk, resourcePartId, error, {
            location: 'local',
            resourceName: invocation.reference.label,
            serverId: PROJECT_DOCS_SERVER_ID,
            uri: invocation.reference.uri,
        })
        return [new HumanMessage(`demo resource 读取失败：${toErrorMessage(error)}。请说明无法读取文档，不要编造摘要。`)]
    }
}

async function executeDocsResourceInvocation(invocation: DocsResourceInvocation, options: ExecuteComposerContextOptions) {
    const resourcePartId = createId()

    options.writeChunk({
        type: 'resource-start',
        partId: resourcePartId,
        resourceName: invocation.reference.label,
        uri: invocation.reference.uri,
        source: 'mcp',
        location: 'local',
        serverId: PROJECT_DOCS_SERVER_ID,
    })

    try {
        throwIfAborted(options.context.signal)
        const resource = await projectDocsResourceAdapter.read({
            uri: invocation.reference.uri,
        })

        options.writeChunk({
            type: 'resource-end',
            partId: resourcePartId,
            resourceName: resource.resourceName,
            uri: resource.uri,
            source: 'mcp',
            location: 'local',
            serverId: resource.serverId,
            contentPreview: resource.contentPreview,
            isTruncated: resource.truncated,
            previewChars: resource.previewChars,
        })

        return [
            createDocsResourceContextMessage({
                command: invocation.command,
                content: resource.content,
                resourceName: resource.resourceName,
                uri: resource.uri,
                userGoal: invocation.userGoal,
            }),
        ]
    } catch (error) {
        if (options.context.signal?.aborted) {
            throw error
        }

        writeResourceError(options.writeChunk, resourcePartId, error, {
            location: 'local',
            resourceName: invocation.reference.label,
            serverId: PROJECT_DOCS_SERVER_ID,
            uri: invocation.reference.uri,
        })
        return [new HumanMessage(`demo resource 读取失败：${toErrorMessage(error)}。请说明无法读取文档，不要编造文档内容。`)]
    }
}

async function executeRemoteResourceInvocation(invocation: RemoteResourceInvocation, options: ExecuteComposerContextOptions) {
    const partId = createId()

    options.writeChunk({
        type: 'resource-start',
        partId,
        resourceName: LATEST_CONTEXT_RESOURCE_NAME,
        uri: LATEST_CONTEXT_RESOURCE_URI,
        source: 'mcp',
        location: 'remote',
        serverId: PROJECT_ASSISTANT_SERVER_ID,
    })

    try {
        throwIfAborted(options.context.signal)
        const response = await mcpClientManager.readResource(PROJECT_ASSISTANT_SERVER_ID, {
            uri: LATEST_CONTEXT_RESOURCE_URI,
        })
        const content = extractTextFromContentParts(response.result.contents)

        if (!content) {
            throw new MCPHostError('REQUEST_FAILED', 'project://latest-context 没有返回可用文本内容。')
        }

        options.writeChunk({
            type: 'resource-end',
            partId,
            resourceName: LATEST_CONTEXT_RESOURCE_NAME,
            uri: LATEST_CONTEXT_RESOURCE_URI,
            source: 'mcp',
            location: 'remote',
            serverId: PROJECT_ASSISTANT_SERVER_ID,
            contentPreview: createResourcePreview(content, REMOTE_CONTEXT_PREVIEW_CHARS),
            isTruncated: content.length > REMOTE_CONTEXT_PREVIEW_CHARS,
            previewChars: REMOTE_CONTEXT_PREVIEW_CHARS,
        })

        return [
            new HumanMessage(
                [
                    '以下是 remote MCP resource `project://latest-context` 返回的项目上下文，请优先基于它回答。',
                    `用户本轮目标：${invocation.userGoal || '未提供额外目标'}`,
                    invocation.command ? `Composer command：${invocation.command.label}（${invocation.command.name}）。` : '',
                    content,
                ]
                    .filter(Boolean)
                    .join('\n\n')
            ),
        ]
    } catch (error) {
        if (options.context.signal?.aborted) {
            throw error
        }

        writeResourceError(options.writeChunk, partId, error, {
            location: 'remote',
            resourceName: LATEST_CONTEXT_RESOURCE_NAME,
            serverId: PROJECT_ASSISTANT_SERVER_ID,
            uri: LATEST_CONTEXT_RESOURCE_URI,
        })
        return [
            new HumanMessage(
                `project://latest-context 读取失败：${toErrorMessage(error)}。请说明 remote context 暂时不可用，不要编造结果。`
            ),
        ]
    }
}

export function resolveComposerContextInvocation(request: ChatRequest): ComposerContextInvocation | null {
    const command = request.composer?.command
    const commandName = command?.name
    const reference = getPrimaryComposerReference(request)
    const userGoal = getLastUserMessageText(request)

    if (commandName === 'summary' && isDocsResourceReference(reference)) {
        return {
            kind: 'docs-summary',
            reference,
            userGoal,
        }
    }

    if (isDocsResourceReference(reference)) {
        return {
            command,
            kind: 'docs-resource',
            reference,
            userGoal,
        }
    }

    if (isLatestContextReference(reference)) {
        return {
            command,
            kind: 'remote-resource',
            reference,
            userGoal,
        }
    }

    if (command) {
        return {
            command,
            kind: 'command-hint',
            userGoal,
        }
    }

    return null
}

export async function executeComposerContextInvocation(invocation: ComposerContextInvocation, options: ExecuteComposerContextOptions) {
    if (invocation.kind === 'command-hint') {
        return [createCommandHintMessage(invocation.command, invocation.userGoal)]
    }

    if (invocation.kind === 'docs-resource') {
        return executeDocsResourceInvocation(invocation, options)
    }

    if (invocation.kind === 'docs-summary') {
        return executeDocsSummaryInvocation(invocation, options)
    }

    return executeRemoteResourceInvocation(invocation, options)
}
