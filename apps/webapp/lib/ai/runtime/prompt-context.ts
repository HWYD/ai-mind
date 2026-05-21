import type { BaseMessage } from '@langchain/core/messages'

import type { ChatRequest } from '@/lib/ai/types/chat'

import type { ExecutedToolResult } from './types'

type PromptRuntimeErrorCode = 'PROMPT_FETCH_FAILED' | 'PROMPT_INJECTION_FAILED'

export class PromptRuntimeError extends Error {
    code: PromptRuntimeErrorCode
    promptName: string
    serverId: string

    constructor(code: PromptRuntimeErrorCode, message: string, options: { promptName: string; serverId: string }) {
        super(message)
        this.name = 'PromptRuntimeError'
        this.code = code
        this.promptName = options.promptName
        this.serverId = options.serverId
    }
}

export interface PromptContextInvocation {
    input: string
    location: 'local'
    promptName: string
    serverId: string
    source: 'mcp'
    execute: () => Promise<BaseMessage[]>
}

/**
 * 判断本轮是否需要注入本地 Prompt 上下文。
 * 模型可见的本地文件读取工具已经下线，所以旧的“工具结果 -> local-file-summary Prompt”
 * 桥接链路会在这里明确关闭；本地摘要能力改由显式 `docs://...` Resource 引用触发。
 */
export function resolvePromptContextInvocation(
    _request: ChatRequest,
    _executedToolResults: ExecutedToolResult[]
): PromptContextInvocation | null {
    return null
}
