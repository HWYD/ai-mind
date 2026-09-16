import { normalizeSafePublicHttpUrl, normalizeSafeResourceUri } from '@/lib/ai/safe-public-url'
import type {
    AgentGraphPart,
    AgentRunPart,
    ImageBriefPart,
    ImageResultPart,
    MindMessage,
    MindMessagePart,
    PromptPart,
    ResourcePart,
    ToolPart,
    WorkflowProgressPart,
} from '@/lib/ai/types/message'

import {
    LOCAL_CHAT_MAX_MESSAGES_PER_SNAPSHOT,
    LOCAL_CHAT_SCHEMA_VERSION,
    type LocalConversationMetadata,
    type LocalConversationSnapshot,
    recoverableAgentGraphPartSchema,
    recoverableAgentRunPartSchema,
} from './schema'

const RECOVERABLE_PART_TYPES = new Set([
    'agent-graph',
    'agent-run',
    'image-brief',
    'image-result',
    'prompt',
    'resource',
    'skill',
    'text',
    'tool',
    'workflow-progress',
])

function isRecoverablePart(part: MindMessagePart) {
    if (!RECOVERABLE_PART_TYPES.has(part.type)) {
        return false
    }

    if ('status' in part) {
        return part.status === undefined || part.status === 'completed' || part.status === 'failed'
    }

    return true
}

function projectPublicSourceRecords(sources: ToolPart['sources']) {
    return (sources ?? []).flatMap(source => {
        if (source.status !== 'discovered' && source.status !== 'read') {
            return []
        }

        const url = normalizeSafePublicHttpUrl(source.url)
        if (!url) {
            return []
        }

        return [
            {
                originTool: source.originTool,
                sourceId: source.sourceId,
                status: source.status,
                title: source.title,
                url,
            },
        ]
    })
}

function projectPublicToolPart(part: ToolPart): ToolPart {
    const sources = projectPublicSourceRecords(part.sources)

    return {
        ...(part.id ? { id: part.id } : {}),
        ...(part.action ? { action: part.action } : {}),
        ...(part.location ? { location: part.location } : {}),
        ...(part.serverId ? { serverId: part.serverId } : {}),
        ...(sources.length > 0 ? { sources } : {}),
        ...(part.source ? { source: part.source } : {}),
        status: part.status,
        title: part.title,
        toolName: part.toolName,
        type: 'tool',
    } as unknown as ToolPart
}

function projectPublicResourcePart(part: ResourcePart): ResourcePart {
    const uri = normalizeSafeResourceUri(part.uri) ?? 'resource://unknown'

    return {
        ...(part.id ? { id: part.id } : {}),
        ...(part.location ? { location: part.location } : {}),
        resourceName: part.resourceName,
        serverId: part.serverId,
        ...(part.source ? { source: part.source } : {}),
        status: part.status,
        type: 'resource',
        uri,
    }
}

function projectPublicPromptPart(part: PromptPart): PromptPart {
    return {
        ...(part.id ? { id: part.id } : {}),
        ...(part.location ? { location: part.location } : {}),
        ...(typeof part.messageCount === 'number' ? { messageCount: part.messageCount } : {}),
        promptName: part.promptName,
        ...(part.serverId ? { serverId: part.serverId } : {}),
        ...(part.source ? { source: part.source } : {}),
        status: part.status,
        type: 'prompt',
    }
}

function isRecoverableArtifact(artifact: NonNullable<MindMessage['artifacts']>[number]) {
    return artifact.status === 'completed' || artifact.status === 'failed'
}

function projectRecoverableArtifact(artifact: NonNullable<MindMessage['artifacts']>[number]) {
    return {
        artifactId: artifact.artifactId,
        artifactKind: artifact.artifactKind,
        artifactType: 'text' as const,
        content: artifact.content,
        ...(artifact.error ? { error: artifact.error } : {}),
        format: artifact.format,
        ...(artifact.metadata
            ? {
                  metadata: {
                      ...(artifact.metadata.charCount !== undefined ? { charCount: artifact.metadata.charCount } : {}),
                      ...(artifact.metadata.generatedFrom ? { generatedFrom: artifact.metadata.generatedFrom } : {}),
                      ...(artifact.metadata.revision !== undefined ? { revision: artifact.metadata.revision } : {}),
                      ...(artifact.metadata.sectionCount !== undefined ? { sectionCount: artifact.metadata.sectionCount } : {}),
                      ...(artifact.metadata.targetVersion ? { targetVersion: artifact.metadata.targetVersion } : {}),
                      ...(artifact.metadata.validated !== undefined ? { validated: artifact.metadata.validated } : {}),
                  },
              }
            : {}),
        status: artifact.status,
        title: artifact.title,
    }
}

function projectRecoverablePart(part: MindMessagePart): MindMessagePart | null {
    if (!isRecoverablePart(part)) {
        return null
    }

    if (part.type === 'image-brief') {
        return {
            id: part.id,
            runId: part.runId,
            summary: {
                ...part.summary,
                assumptions: [...part.summary.assumptions],
                avoid: [...part.summary.avoid],
                mustInclude: [...part.summary.mustInclude],
                subjects: [...part.summary.subjects],
                ...(part.summary.visibleText ? { visibleText: [...part.summary.visibleText] } : {}),
            },
            type: 'image-brief',
        } satisfies ImageBriefPart
    }

    if (part.type === 'agent-run') {
        const parsed = recoverableAgentRunPartSchema.safeParse(part)
        return parsed.success ? (parsed.data as AgentRunPart) : null
    }

    if (part.type === 'agent-graph') {
        const parsed = recoverableAgentGraphPartSchema.safeParse(part)
        return parsed.success ? (parsed.data as AgentGraphPart) : null
    }

    if (part.type === 'image-result') {
        return {
            contentPath: part.contentPath,
            expiresAt: part.expiresAt,
            ...(part.height ? { height: part.height } : {}),
            id: part.id,
            ...(part.mimeType ? { mimeType: part.mimeType } : {}),
            runId: part.runId,
            suggestedFileName: part.suggestedFileName,
            temporary: true,
            type: 'image-result',
            ...(part.width ? { width: part.width } : {}),
        } satisfies ImageResultPart
    }

    if (part.type === 'tool') {
        return projectPublicToolPart(part)
    }

    if (part.type === 'resource') {
        return projectPublicResourcePart(part)
    }

    if (part.type === 'prompt') {
        return projectPublicPromptPart(part)
    }

    if (part.type === 'workflow-progress') {
        return {
            ...(part.durationMs !== undefined ? { durationMs: part.durationMs } : {}),
            ...(part.endedAt !== undefined ? { endedAt: part.endedAt } : {}),
            ...(part.failureMessage !== undefined ? { failureMessage: part.failureMessage } : {}),
            ...(part.id ? { id: part.id } : {}),
            status: part.status,
            steps: part.steps.map(step => ({ ...step })),
            ...(part.startedAt !== undefined ? { startedAt: part.startedAt } : {}),
            ...(part.summary !== undefined ? { summary: part.summary } : {}),
            title: part.title,
            type: 'workflow-progress',
            visibility: part.visibility,
            workflowId: part.workflowId,
            workflowKind: part.workflowKind,
        } satisfies WorkflowProgressPart
    }

    if (part.type === 'skill') {
        return {
            ...(part.id ? { id: part.id } : {}),
            name: part.name,
            skillId: part.skillId,
            type: 'skill',
        }
    }

    if (part.type === 'text') {
        return {
            ...(part.displaySegments?.length ? { displaySegments: part.displaySegments } : {}),
            ...(part.id ? { id: part.id } : {}),
            format: 'markdown',
            text: part.text,
            type: 'text',
        }
    }

    return null
}

export function projectRecoverableMessages(messages: MindMessage[]): MindMessage[] {
    return messages
        .filter(message => {
            if ((message.role !== 'user' && message.role !== 'assistant') || (message.status && message.status !== 'completed')) {
                return false
            }

            const agentRun = message.parts.find((part): part is AgentRunPart => part.type === 'agent-run')
            if (!agentRun) {
                return true
            }

            return agentRun.status === 'completed' && message.parts.some(part => part.type === 'text' && part.text.trim().length > 0)
        })
        .map(message => {
            const parts = message.parts.flatMap(part => {
                const recoverablePart = projectRecoverablePart(part)

                return recoverablePart ? [recoverablePart] : []
            })
            const artifacts = message.artifacts?.filter(isRecoverableArtifact).map(projectRecoverableArtifact)

            return {
                createdAt: message.createdAt,
                id: message.id,
                parts,
                ...(artifacts && artifacts.length > 0 ? { artifacts } : { artifacts: undefined }),
                role: message.role,
                status: 'completed' as const,
            }
        })
        .filter(message => message.parts.length > 0 || (message.artifacts?.length ?? 0) > 0)
}

export function trimSnapshotMessages(messages: MindMessage[], limit = LOCAL_CHAT_MAX_MESSAGES_PER_SNAPSHOT) {
    if (messages.length <= limit) {
        return messages
    }

    return messages.slice(messages.length - limit)
}

export function createLocalConversationSnapshot(options: {
    conversation: LocalConversationMetadata
    messages: MindMessage[]
    previousRevision?: number
    snapshotAt?: string
}): LocalConversationSnapshot | null {
    const recoverableMessages = trimSnapshotMessages(projectRecoverableMessages(options.messages))

    if (recoverableMessages.length === 0) {
        return null
    }

    const snapshotAt = options.snapshotAt ?? new Date().toISOString()

    return {
        conversationId: options.conversation.id,
        createdAt: options.conversation.createdAt,
        lastActiveAt: options.conversation.lastActiveAt,
        messages: recoverableMessages,
        revision: (options.previousRevision ?? 0) + 1,
        schemaVersion: LOCAL_CHAT_SCHEMA_VERSION,
        snapshotAt,
        title: options.conversation.title,
    }
}
