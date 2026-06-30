import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'

import { createId } from '@/lib/ai/create-id'
import type { ChatComposerDisplaySegment, ChatComposerPayload } from '@/lib/ai/types/chat'
import type {
    AgentGraphNodeEntry,
    AgentInterruptPart,
    AgentStepPart,
    AgentTextArtifactViewModel,
    MindMessage,
    MindMessagePart,
    MindRole,
    PromptPart,
    ReasoningPart,
    ResourcePart,
    SkillPart,
    TextPart,
    ToolPart,
    WorkflowProgressPart,
    WorkflowProgressStep,
} from '@/lib/ai/types/message'

export function createTextPart(text: string, id?: string, displaySegments?: ChatComposerDisplaySegment[]): TextPart {
    return {
        id,
        type: 'text',
        text,
        format: 'markdown',
        ...(displaySegments?.length ? { displaySegments } : {}),
    }
}

export function createReasoningPart(text: string, id?: string): ReasoningPart {
    return {
        id,
        type: 'reasoning',
        text,
        format: 'markdown',
        visibility: 'collapsed',
    }
}

export function createToolPart(
    partId: string,
    toolName: string,
    input: string,
    title?: string,
    action?: string,
    source?: ToolPart['source'],
    location?: ToolPart['location'],
    serverId?: string
): ToolPart {
    return {
        id: partId,
        type: 'tool',
        toolName,
        title,
        action,
        source,
        location,
        serverId,
        status: 'called',
        input,
    }
}

export function createResourcePart(
    partId: string,
    resourceName: string,
    uri: string,
    serverId: string,
    source?: ResourcePart['source'],
    location?: ResourcePart['location']
): ResourcePart {
    return {
        id: partId,
        type: 'resource',
        resourceName,
        uri,
        source,
        location,
        serverId,
        status: 'loading',
    }
}

export function createSkillPart(skillId: string, name: string, description?: string): SkillPart {
    return {
        id: `skill:${skillId}`,
        type: 'skill',
        skillId,
        name,
        description,
    }
}

export function createPromptPart(
    partId: string,
    promptName: string,
    status: PromptPart['status'],
    source?: PromptPart['source'],
    location?: PromptPart['location'],
    serverId?: string,
    input?: string
): PromptPart {
    return {
        id: partId,
        type: 'prompt',
        promptName,
        source,
        location,
        serverId,
        status,
        input,
    }
}

export function createAgentGraphStepPart(node: AgentGraphNodeEntry, runId: string, agentName: string): AgentStepPart {
    return {
        id: `agent-step:${runId}`,
        type: 'agent-step',
        runId,
        agentName,
        graph: {
            nodes: [node],
            routes: [],
            runtime: 'LangGraph',
        },
        status: node.status,
    }
}

export function createAgentInterruptPart(chunk: Extract<ChatStreamChunk, { type: 'agent-interrupt' }>): AgentInterruptPart {
    return {
        id: `agent-interrupt:${chunk.runId}`,
        type: 'agent-interrupt',
        interruptId: chunk.interruptId,
        interruptKind: chunk.interruptKind as AgentInterruptPart['interruptKind'],
        payload: chunk.payload as AgentInterruptPart['payload'],
        runId: chunk.runId,
        status: 'pending',
        threadId: chunk.threadId,
    }
}

export function createWorkflowProgressPart(chunk: Extract<ChatStreamChunk, { type: 'workflow-progress-start' }>): WorkflowProgressPart {
    return {
        id: chunk.partId,
        type: 'workflow-progress',
        workflowId: chunk.workflowId,
        workflowKind: chunk.workflowKind,
        title: chunk.title,
        status: 'running',
        summary: chunk.summary,
        steps: [],
        startedAt: chunk.startedAt,
        visibility: 'expanded',
    }
}

export function createWorkflowProgressStep(chunk: Extract<ChatStreamChunk, { type: 'workflow-progress-step' }>): WorkflowProgressStep {
    return {
        id: chunk.stepId,
        title: chunk.title,
        status: chunk.status,
        summary: chunk.summary,
        details: chunk.details ?? [],
        startedAt: chunk.startedAt,
        endedAt: chunk.endedAt,
        durationMs: chunk.durationMs,
        failureMessage: chunk.failureMessage,
    }
}

export function createAgentTextArtifact(chunk: Extract<ChatStreamChunk, { type: 'artifact-start' }>): AgentTextArtifactViewModel {
    return {
        artifactId: chunk.artifactId,
        artifactKind: chunk.artifactKind,
        artifactType: chunk.artifactType,
        content: '',
        format: chunk.format,
        metadata: chunk.metadata,
        status: 'streaming',
        title: chunk.title,
    }
}

export function createMessage(role: MindRole, parts: MindMessagePart[], composer?: ChatComposerPayload): MindMessage {
    return {
        id: createId(),
        role,
        parts,
        createdAt: new Date().toISOString(),
        // composer 只表达本轮结构化输入语义；用户气泡的 chip 位置由 text part displaySegments 承接。
        ...(composer ? { composer } : {}),
    }
}

export function createAssistantPlaceholder(messageId: string): MindMessage {
    return {
        id: messageId,
        role: 'assistant',
        parts: [],
        createdAt: new Date().toISOString(),
        status: 'streaming',
    }
}
