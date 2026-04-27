import type { MCPPromptAdapterResult, MCPResourceAdapterResult, MCPToolAdapterResult } from '@/lib/ai/mcp/protocol/types'

export interface MCPToolAdapter<TInput = unknown> {
    call(input: TInput): Promise<MCPToolAdapterResult>
}

export interface MCPResourceAdapter<TInput = unknown> {
    read(input: TInput): Promise<MCPResourceAdapterResult>
}

export interface MCPPromptAdapter<TInput = unknown> {
    get(input: TInput): Promise<MCPPromptAdapterResult>
}
