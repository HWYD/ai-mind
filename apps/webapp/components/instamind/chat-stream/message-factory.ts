import { createId } from '@/lib/ai/create-id'
import type { ChatComposerDisplaySegment, ChatComposerPayload } from '@/lib/ai/types/chat'
import type {
    MindMessage,
    MindMessagePart,
    MindRole,
    PromptPart,
    ReasoningPart,
    ResourcePart,
    SkillPart,
    TextPart,
    ToolPart,
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
    }
}
