import type { MCPResourceAdapterResult, MCPToolAdapterResult } from '@/lib/ai/mcp/protocol/types'

export interface MCPToolAdapter<TInput = unknown> {
    call(input: TInput): Promise<MCPToolAdapterResult>
}

export interface MCPResourceAdapter<TInput = unknown> {
    read(input: TInput): Promise<MCPResourceAdapterResult>
}
