import type { AgentGraphDebugSummary, ChatStreamChunk } from '@ai-mind/stream-core/protocol'

import type {
    AgentGraphNodeEntry,
    AgentGraphRouteEntry,
    AgentGraphTrace,
    AgentInterruptPart,
    AgentStepPart,
    AgentTextArtifactViewModel,
    MindMessage,
    MindMessagePart,
    PromptPart,
    ResourcePart,
    TextPart,
    ToolPart,
    WorkflowProgressPart,
    WorkflowProgressStep,
} from '@/lib/ai/types/message'

import { createAgentGraphStepPart, createReasoningPart, createTextPart, createWorkflowProgressStep } from './message-factory'

export function pruneTransientMessages(messages: MindMessage[]): MindMessage[] {
    return messages.filter(message => {
        if (message.parts.length === 0 && (message.artifacts?.length ?? 0) === 0) {
            return false
        }

        if ((message.artifacts?.length ?? 0) > 0) {
            return true
        }

        return message.parts.some(part => {
            if (
                part.type === 'agent-step' ||
                part.type === 'tool' ||
                part.type === 'resource' ||
                part.type === 'skill' ||
                part.type === 'prompt' ||
                part.type === 'workflow-progress' ||
                part.type === 'agent-interrupt'
            ) {
                return true
            }

            return part.text.trim().length > 0
        })
    })
}

export function ensureAssistantMessage(messages: MindMessage[], messageId: string): MindMessage[] {
    if (messages.some(message => message.id === messageId)) {
        return messages
    }

    return [
        ...messages,
        {
            id: messageId,
            role: 'assistant',
            parts: [],
            createdAt: new Date().toISOString(),
            status: 'resuming',
        },
    ]
}

export function updateMessageStatus(messages: MindMessage[], messageId: string, status: MindMessage['status']): MindMessage[] {
    return messages.map(message => (message.id === messageId ? { ...message, status } : message))
}

export function appendAgentTextArtifact(messages: MindMessage[], messageId: string, artifact: AgentTextArtifactViewModel): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        const existingArtifacts = message.artifacts ?? []
        const existingIndex = existingArtifacts.findIndex(existingArtifact => existingArtifact.artifactId === artifact.artifactId)

        if (existingIndex === -1) {
            return {
                ...message,
                artifacts: [...existingArtifacts, artifact],
            }
        }

        return {
            ...message,
            artifacts: existingArtifacts.map(existingArtifact =>
                existingArtifact.artifactId === artifact.artifactId ? { ...existingArtifact, ...artifact } : existingArtifact
            ),
        }
    })
}

export function upsertAgentInterruptPart(messages: MindMessage[], messageId: string, interruptPart: AgentInterruptPart): MindMessage[] {
    return ensureAssistantMessage(messages, messageId).map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: [...message.parts.filter(part => part.type !== 'agent-interrupt'), interruptPart],
            status: 'paused',
        }
    })
}

export function updateAgentInterruptPartStatus(
    messages: MindMessage[],
    messageId: string,
    interruptId: string,
    status: AgentInterruptPart['status']
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: message.parts.map(part =>
                part.type === 'agent-interrupt' && part.interruptId === interruptId
                    ? {
                          ...part,
                          status,
                      }
                    : part
            ),
        }
    })
}

export function appendAgentTextArtifactDelta(messages: MindMessage[], messageId: string, artifactId: string, delta: string): MindMessage[] {
    if (!delta) {
        return messages
    }

    return messages.map(message => {
        if (message.id !== messageId || !message.artifacts?.length) {
            return message
        }

        return {
            ...message,
            artifacts: message.artifacts.map(artifact =>
                artifact.artifactId === artifactId
                    ? {
                          ...artifact,
                          content: artifact.content + delta,
                      }
                    : artifact
            ),
        }
    })
}

export function updateAgentTextArtifact(
    messages: MindMessage[],
    messageId: string,
    artifactId: string,
    updater: (artifact: AgentTextArtifactViewModel) => AgentTextArtifactViewModel
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId || !message.artifacts?.length) {
            return message
        }

        return {
            ...message,
            artifacts: message.artifacts.map(artifact => (artifact.artifactId === artifactId ? updater(artifact) : artifact)),
        }
    })
}

export function getMessageTextContent(message: MindMessage): string {
    return message.parts
        .filter((part): part is TextPart => part.type === 'text' && part.text.trim().length > 0)
        .map(part => part.text)
        .join('\n\n')
}

export function appendPart(messages: MindMessage[], messageId: string, part: MindMessagePart): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: [...message.parts, part],
        }
    })
}

function appendTextualDeltaToMessage(message: MindMessage, partId: string, partType: 'text' | 'reasoning', delta: string): MindMessage {
    const parts = [...message.parts]
    const targetIndex = parts.findIndex(part => part.id === partId && part.type === partType)

    if (targetIndex === -1) {
        const nextPart = partType === 'reasoning' ? createReasoningPart(delta, partId) : createTextPart(delta, partId)

        return {
            ...message,
            parts: [...message.parts, nextPart],
        }
    }

    const targetPart = parts[targetIndex]

    if (targetPart.type !== partType) {
        return message
    }

    parts[targetIndex] = {
        ...targetPart,
        text: targetPart.text + delta,
    }

    return {
        ...message,
        parts,
    }
}

// 通过 partId 精确追加文本增量，避免并发流式更新时把内容拼到错误的 part 中。
export function appendTextualPartDelta(
    messages: MindMessage[],
    messageId: string,
    partId: string,
    partType: 'text' | 'reasoning',
    delta: string
): MindMessage[] {
    const lastMessageIndex = messages.length - 1
    const lastMessage = messages[lastMessageIndex]

    // 流式文本通常追加到最后一条 assistant 消息，先走快路径，避免每个 delta 都遍历整个消息列表。
    if (lastMessage?.id === messageId) {
        const nextMessage = appendTextualDeltaToMessage(lastMessage, partId, partType, delta)

        return [...messages.slice(0, lastMessageIndex), nextMessage]
    }

    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return appendTextualDeltaToMessage(message, partId, partType, delta)
    })
}

export function updateToolPart(
    messages: MindMessage[],
    messageId: string,
    partId: string,
    updater: (part: ToolPart) => ToolPart
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: message.parts.map(part => {
                if (part.type !== 'tool' || part.id !== partId) {
                    return part
                }

                return updater(part)
            }),
        }
    })
}

export function updateResourcePart(
    messages: MindMessage[],
    messageId: string,
    partId: string,
    updater: (part: ResourcePart) => ResourcePart
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: message.parts.map(part => {
                if (part.type !== 'resource' || part.id !== partId) {
                    return part
                }

                return updater(part)
            }),
        }
    })
}

export function updatePromptPart(
    messages: MindMessage[],
    messageId: string,
    partId: string,
    updater: (part: PromptPart) => PromptPart
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: message.parts.map(part => {
                if (part.type !== 'prompt' || part.id !== partId) {
                    return part
                }

                return updater(part)
            }),
        }
    })
}

export function upsertWorkflowProgressPart(messages: MindMessage[], messageId: string, part: WorkflowProgressPart): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        const existingPartIndex = message.parts.findIndex(
            existingPart => existingPart.type === 'workflow-progress' && existingPart.workflowId === part.workflowId
        )

        if (existingPartIndex === -1) {
            return {
                ...message,
                parts: [...message.parts, part],
            }
        }

        return {
            ...message,
            parts: message.parts.map((existingPart, index) =>
                index === existingPartIndex && existingPart.type === 'workflow-progress'
                    ? {
                          ...existingPart,
                          ...part,
                          steps: part.steps.length > 0 ? part.steps : existingPart.steps,
                      }
                    : existingPart
            ),
        }
    })
}

function upsertWorkflowProgressStep(steps: WorkflowProgressStep[], nextStep: WorkflowProgressStep) {
    const existingIndex = steps.findIndex(step => step.id === nextStep.id)

    if (existingIndex === -1) {
        return [...steps, nextStep]
    }

    return steps.map((step, index) =>
        index === existingIndex
            ? {
                  ...step,
                  ...nextStep,
                  details: nextStep.details.length > 0 ? nextStep.details : step.details,
              }
            : step
    )
}

export function updateWorkflowProgressPart(
    messages: MindMessage[],
    messageId: string,
    workflowId: string,
    updater: (part: WorkflowProgressPart) => WorkflowProgressPart
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: message.parts.map(part => {
                if (part.type !== 'workflow-progress' || part.workflowId !== workflowId) {
                    return part
                }

                return updater(part)
            }),
        }
    })
}

export function applyWorkflowProgressStepChunk(
    messages: MindMessage[],
    messageId: string,
    chunk: Extract<ChatStreamChunk, { type: 'workflow-progress-step' }>
): MindMessage[] {
    return updateWorkflowProgressPart(messages, messageId, chunk.workflowId, part => ({
        ...part,
        steps: upsertWorkflowProgressStep(part.steps, createWorkflowProgressStep(chunk)),
    }))
}

type AgentGraphNodeUpdate = Partial<Omit<AgentGraphNodeEntry, 'nodeId'>> & Pick<AgentGraphNodeEntry, 'nodeId'>

function getAgentStepPartStatus(graph: AgentGraphTrace): AgentStepPart['status'] {
    if (graph.nodes.some(node => node.status === 'running')) {
        return 'running'
    }

    if (graph.nodes.some(node => node.status === 'failed')) {
        return 'failed'
    }

    if (graph.nodes.some(node => node.status === 'paused')) {
        return 'paused'
    }

    if (graph.nodes.length > 0 && graph.nodes.every(node => node.status === 'skipped')) {
        return 'skipped'
    }

    return 'completed'
}

function createGraphNodeFromUpdate(update: AgentGraphNodeUpdate, fallbackStepIndex: number): AgentGraphNodeEntry {
    return {
        nodeId: update.nodeId,
        partId: update.partId ?? `agent-graph-node:${update.nodeId}`,
        patchSummaries: update.patchSummaries ?? [],
        status: update.status ?? 'running',
        stepIndex: update.stepIndex ?? fallbackStepIndex,
        title: update.title ?? update.nodeId,
        ...(update.durationMs !== undefined ? { durationMs: update.durationMs } : {}),
        ...(update.error !== undefined ? { error: update.error } : {}),
        ...(update.severity !== undefined ? { severity: update.severity } : {}),
        ...(update.summary !== undefined ? { summary: update.summary } : {}),
        ...(update.tags !== undefined ? { tags: update.tags } : {}),
    }
}

function upsertAgentGraphNode(nodes: AgentGraphNodeEntry[], update: AgentGraphNodeUpdate) {
    const existingIndex = nodes.findIndex(node => node.nodeId === update.nodeId)

    if (existingIndex === -1) {
        return [...nodes, createGraphNodeFromUpdate(update, nodes.length + 1)].sort((left, right) => left.stepIndex - right.stepIndex)
    }

    return nodes.map(node => {
        if (node.nodeId !== update.nodeId) {
            return node
        }

        return {
            ...node,
            ...update,
            patchSummaries: [...node.patchSummaries, ...(update.patchSummaries ?? [])],
            partId: update.partId ?? node.partId,
            status: update.status ?? node.status,
            stepIndex: update.stepIndex ?? node.stepIndex,
            title: update.title ?? node.title,
        }
    })
}

function appendAgentGraphRoute(routes: AgentGraphRouteEntry[], route: AgentGraphRouteEntry) {
    const routeExists = routes.some(
        existingRoute =>
            existingRoute.fromNodeId === route.fromNodeId &&
            existingRoute.toNodeId === route.toNodeId &&
            existingRoute.routeLabel === route.routeLabel &&
            existingRoute.reason === route.reason
    )

    return routeExists ? routes : [...routes, route]
}

export function upsertAgentGraphNodePart(
    messages: MindMessage[],
    messageId: string,
    node: AgentGraphNodeUpdate,
    runId: string,
    agentName: string
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        const existingPart = message.parts.find((part): part is AgentStepPart => part.type === 'agent-step' && part.runId === runId)

        if (!existingPart) {
            return {
                ...message,
                parts: [...message.parts, createAgentGraphStepPart(createGraphNodeFromUpdate(node, 1), runId, agentName)],
            }
        }

        const nextGraph = {
            ...existingPart.graph,
            nodes: upsertAgentGraphNode(existingPart.graph.nodes, node),
        }

        return {
            ...message,
            parts: message.parts.map(part => {
                if (part.type !== 'agent-step' || part.runId !== runId) {
                    return part
                }

                return {
                    ...part,
                    agentName,
                    graph: nextGraph,
                    status: getAgentStepPartStatus(nextGraph),
                }
            }),
        }
    })
}

export function appendAgentGraphRoutePart(
    messages: MindMessage[],
    messageId: string,
    route: AgentGraphRouteEntry,
    runId: string,
    agentName: string
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        const existingPart = message.parts.find((part): part is AgentStepPart => part.type === 'agent-step' && part.runId === runId)

        if (!existingPart) {
            return {
                ...message,
                parts: [
                    ...message.parts,
                    {
                        id: `agent-step:${runId}`,
                        type: 'agent-step',
                        runId,
                        agentName,
                        graph: {
                            nodes: [],
                            routes: [route],
                            runtime: 'LangGraph',
                        },
                        status: 'completed',
                    },
                ],
            }
        }

        const nextGraph = {
            ...existingPart.graph,
            routes: appendAgentGraphRoute(existingPart.graph.routes, route),
        }

        return {
            ...message,
            parts: message.parts.map(part => {
                if (part.type !== 'agent-step' || part.runId !== runId) {
                    return part
                }

                return {
                    ...part,
                    agentName,
                    graph: nextGraph,
                    status: getAgentStepPartStatus(nextGraph),
                }
            }),
        }
    })
}

export function upsertAgentGraphDebugSummaryPart(
    messages: MindMessage[],
    messageId: string,
    summary: AgentGraphDebugSummary,
    runId: string,
    agentName: string
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        const existingPart = message.parts.find((part): part is AgentStepPart => part.type === 'agent-step' && part.runId === runId)

        if (!existingPart) {
            return {
                ...message,
                parts: [
                    ...message.parts,
                    {
                        id: `agent-step:${runId}`,
                        type: 'agent-step',
                        runId,
                        agentName,
                        graph: {
                            debugSummary: summary,
                            nodes: [],
                            routes: [],
                            runtime: 'LangGraph',
                        },
                        status: 'completed',
                    },
                ],
            }
        }

        const nextGraph = {
            ...existingPart.graph,
            debugSummary: summary,
        }

        return {
            ...message,
            parts: message.parts.map(part => {
                if (part.type !== 'agent-step' || part.runId !== runId) {
                    return part
                }

                return {
                    ...part,
                    agentName,
                    graph: nextGraph,
                    status: getAgentStepPartStatus(nextGraph),
                }
            }),
        }
    })
}

export function removeMessage(messages: MindMessage[], messageId: string | null): MindMessage[] {
    if (!messageId) {
        return messages
    }

    return messages.filter(message => message.id !== messageId)
}

export function removeUserTurnPair(messages: MindMessage[], userMessageId: string): MindMessage[] {
    const userMessageIndex = messages.findIndex(message => message.id === userMessageId && message.role === 'user')

    if (userMessageIndex === -1) {
        return messages
    }

    const messageIdsToRemove = new Set<string>([userMessageId])

    for (let index = userMessageIndex + 1; index < messages.length; index += 1) {
        const message = messages[index]

        if (message.role === 'user') {
            break
        }

        if (message.role === 'assistant') {
            messageIdsToRemove.add(message.id)
            break
        }
    }

    return messages.filter(message => !messageIdsToRemove.has(message.id))
}

export function getLastUserTurnForRegeneration(messages: MindMessage[]) {
    const stableMessages = pruneTransientMessages(messages)
    let lastUserIndex = -1

    for (let index = stableMessages.length - 1; index >= 0; index -= 1) {
        if (stableMessages[index].role === 'user') {
            lastUserIndex = index
            break
        }
    }

    if (lastUserIndex === -1) {
        return null
    }

    const lastUserMessage = stableMessages[lastUserIndex]
    const userText = getMessageTextContent(lastUserMessage).trim()
    const hasAssistantAfterUser = stableMessages.slice(lastUserIndex + 1).some(message => message.role === 'assistant')

    if (!userText || !hasAssistantAfterUser) {
        return null
    }

    return {
        baseMessages: stableMessages.slice(0, lastUserIndex),
        composer: lastUserMessage.composer,
        displaySegments: lastUserMessage.parts.find((part): part is TextPart => part.type === 'text')?.displaySegments,
        userText,
    }
}
