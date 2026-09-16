import { describe, expect, it } from 'vitest'

import { GeneralReActStreamAdapter } from '@/lib/ai/runtime/general-react-agent/stream-adapter'

describe('general-react-agent stream adapter', () => {
    it('用简洁的 agent-run lifecycle 表达通用 Agent，不伪造 agent-graph chunk', () => {
        const adapter = new GeneralReActStreamAdapter({
            answerPartId: 'answer-1',
            runId: 'run-1',
            threadId: 'thread-1',
            tracePartId: 'trace-1',
        })

        expect(adapter.startTrace()).toEqual({
            partId: 'trace-1',
            runId: 'run-1',
            type: 'agent-run-start',
        })
        expect(adapter.endTrace('completed')).toEqual({
            partId: 'trace-1',
            runId: 'run-1',
            status: 'completed',
            type: 'agent-run-end',
        })
    })

    it('最终文本只投影 text DTO，不携带 reasoning、metadata 或 raw state', () => {
        const adapter = new GeneralReActStreamAdapter({
            answerPartId: 'answer-1',
            runId: 'run-1',
            threadId: 'thread-1',
            tracePartId: 'trace-1',
        })

        const chunks = adapter.projectFinalText({
            delta: '安全回答',
            rawState: { messages: ['secret'] },
            reasoningContent: 'private chain of thought',
            responseMetadata: { token: 'private' },
            type: 'model-text-delta',
        })

        expect(chunks).toEqual([
            { partId: 'answer-1', type: 'text-start' },
            { delta: '安全回答', partId: 'answer-1', type: 'text-delta' },
        ])
        expect(JSON.stringify(chunks)).not.toContain('reasoning')
        expect(JSON.stringify(chunks)).not.toContain('metadata')
        expect(adapter.endFinalText()).toEqual({ partId: 'answer-1', type: 'text-end' })
    })

    it('Action 文本没有投影 API，只有 Answer 安全 delta 可以成为最终 text', () => {
        const adapter = new GeneralReActStreamAdapter({
            answerPartId: 'answer-1',
            runId: 'run-1',
            threadId: 'thread-1',
            tracePartId: 'trace-1',
        })

        expect(adapter.projectFinalText({ delta: '可见回答', type: 'model-text-delta' })).toEqual([
            { partId: 'answer-1', type: 'text-start' },
            { delta: '可见回答', partId: 'answer-1', type: 'text-delta' },
        ])
    })

    it('多个 Answer delta 保持原始分片，不建立 Action 候选缓存', () => {
        const adapter = new GeneralReActStreamAdapter({
            answerPartId: 'answer-1',
            runId: 'run-1',
            threadId: 'thread-1',
            tracePartId: 'trace-1',
        })

        expect([
            ...adapter.projectFinalText({ delta: '第一段', type: 'model-text-delta' }),
            ...adapter.projectFinalText({ delta: '第二段', type: 'model-text-delta' }),
        ]).toEqual([
            { partId: 'answer-1', type: 'text-start' },
            { delta: '第一段', partId: 'answer-1', type: 'text-delta' },
            { delta: '第二段', partId: 'answer-1', type: 'text-delta' },
        ])
    })

    it('白名单接收安全 Tool/source chunk，拒绝多余 raw 字段与未知事件', () => {
        const adapter = new GeneralReActStreamAdapter({
            answerPartId: 'answer-1',
            runId: 'run-1',
            threadId: 'thread-1',
            tracePartId: 'trace-1',
        })
        const safe = {
            action: 'search',
            input: '公开网页',
            output: '已搜索到 1 个来源',
            partId: 'tool-1',
            source: 'internal' as const,
            sources: [
                {
                    originTool: 'web-search' as const,
                    sourceId: 'https://example.com/docs',
                    status: 'discovered' as const,
                    title: 'Docs',
                    url: 'https://example.com/docs',
                },
            ],
            title: '网页搜索',
            toolName: 'web-search',
            type: 'tool-end' as const,
        }

        expect(adapter.projectPublicRuntimeChunk(safe)).toEqual(safe)
        expect(adapter.projectPublicRuntimeChunk({ ...safe, rawObservation: 'private webpage body' })).toBeNull()
        expect(adapter.projectPublicRuntimeChunk({ messages: ['private'], type: 'langchain-state' })).toBeNull()
    })

    it('取消和失败只输出固定安全终态文案，不透传 raw Error', () => {
        const adapter = new GeneralReActStreamAdapter({
            answerPartId: 'answer-1',
            runId: 'run-1',
            threadId: 'thread-1',
            tracePartId: 'trace-1',
        })

        expect(adapter.endTrace('cancelled', new Error('secret provider failure'))).toEqual({
            partId: 'trace-1',
            runId: 'run-1',
            status: 'cancelled',
            type: 'agent-run-end',
        })
        expect(JSON.stringify(adapter.endTrace('failed', new Error('secret provider failure')))).not.toContain('secret')
    })
})
