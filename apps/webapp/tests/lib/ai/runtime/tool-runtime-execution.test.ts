import type { ToolCall } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { executeToolCall } from '@/lib/ai/runtime/tool-runtime'
import type { ChatExecutionContext } from '@/lib/ai/runtime/types'
import type { ChatToolDefinition } from '@/lib/ai/tools'

const echoToolSchema = z.object({
    input: z.string(),
})

const resourceToolSchema = z.object({
    uri: z.string(),
})

function createToolCall(name: string, args: Record<string, unknown>): ToolCall {
    return {
        args,
        id: `tool-call:${name}`,
        name,
        type: 'tool_call',
    }
}

function createEchoToolDefinition(): ChatToolDefinition<z.infer<typeof echoToolSchema>> {
    return {
        formatInput: args => `input=${args.input}`,
        formatOutput: result => JSON.stringify(result),
        name: 'echo_internal',
        runtimeScopes: ['skill-binding', 'delivery-chain-manager'],
        schema: echoToolSchema,
        source: 'internal',
        tool: tool(async ({ input }) => ({ echoed: input }), {
            description: 'Echo a short string.',
            name: 'echo_internal',
            schema: echoToolSchema,
        }),
    }
}

function createResourceToolDefinition(): ChatToolDefinition<z.infer<typeof resourceToolSchema>> {
    return {
        formatOutput: result => JSON.stringify(result),
        getResourceDisplayConfig: args => ({
            resourceName: 'Internal Resource',
            uri: args.uri,
        }),
        getResourceResult: (args, result) => ({
            contentPreview: JSON.stringify(result),
            isTruncated: false,
            previewChars: 120,
            resourceName: 'Internal Resource',
            uri: args.uri,
        }),
        name: 'internal_resource',
        outputPartType: 'resource',
        runtimeScopes: ['skill-binding', 'delivery-chain-manager'],
        schema: resourceToolSchema,
        source: 'internal',
        tool: tool(async ({ uri }) => ({ uri, value: 'resource payload' }), {
            description: 'Return a structured resource payload.',
            name: 'internal_resource',
            schema: resourceToolSchema,
        }),
    }
}

describe('runtime/tool-runtime executeToolCall', () => {
    it('默认作用域仍会写 tool-start / tool-end transcript', async () => {
        const writeChunk = vi.fn()
        const context: ChatExecutionContext = {}
        const toolDefinition = createEchoToolDefinition()

        const result = await executeToolCall(createToolCall(toolDefinition.name, { input: 'hello' }), context, writeChunk, {
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })

        expect(result.success).toBe(true)
        expect(result.rawResult).toEqual({
            echoed: 'hello',
        })
        expect(writeChunk.mock.calls.map(([chunk]) => chunk.type)).toEqual(['tool-start', 'tool-end'])
    })

    it('delivery-chain-manager scope 会静默 tool transcript，但仍返回执行结果', async () => {
        const writeChunk = vi.fn()
        const context: ChatExecutionContext = {}
        const toolDefinition = createEchoToolDefinition()

        const result = await executeToolCall(createToolCall(toolDefinition.name, { input: 'hello' }), context, writeChunk, {
            runtimeScope: 'delivery-chain-manager',
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })

        expect(result.success).toBe(true)
        expect(result.rawResult).toEqual({
            echoed: 'hello',
        })
        expect(writeChunk).not.toHaveBeenCalled()
    })

    it('delivery-chain-manager scope 也会静默 resource transcript', async () => {
        const writeChunk = vi.fn()
        const context: ChatExecutionContext = {}
        const toolDefinition = createResourceToolDefinition()

        const result = await executeToolCall(createToolCall(toolDefinition.name, { uri: 'demo://resource.md' }), context, writeChunk, {
            runtimeScope: 'delivery-chain-manager',
            toolDefinitionMap: new Map([[toolDefinition.name, toolDefinition]]),
        })

        expect(result.success).toBe(true)
        expect(result.rawResult).toEqual({
            uri: 'demo://resource.md',
            value: 'resource payload',
        })
        expect(writeChunk).not.toHaveBeenCalled()
    })
})
