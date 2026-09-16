import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'

import { chatStreamChunkSchema } from '@/lib/ai/stream-chunk-schema'

type GeneralReActTraceTerminalState = 'cancelled' | 'completed' | 'failed'

export type GeneralReActStreamAdapterOptions = {
    answerPartId: string
    runId: string
    threadId: string
    tracePartId: string
}

const allowedRuntimeChunkTypes = new Set([
    'error',
    'prompt-end',
    'prompt-start',
    'resource-end',
    'resource-start',
    'skill-selected',
    'tool-end',
    'tool-start',
])

export class GeneralReActStreamAdapter {
    private textStarted = false
    private textEnded = false

    constructor(private readonly options: GeneralReActStreamAdapterOptions) {}

    startTrace(): ChatStreamChunk {
        return {
            partId: this.options.tracePartId,
            runId: this.options.runId,
            type: 'agent-run-start',
        }
    }

    endTrace(state: GeneralReActTraceTerminalState, _internalError?: unknown): ChatStreamChunk {
        return {
            partId: this.options.tracePartId,
            runId: this.options.runId,
            status: state,
            type: 'agent-run-end',
        }
    }

    projectFinalText(event: { delta: string; type: 'model-text-delta' } & Record<string, unknown>): ChatStreamChunk[] {
        if (!event.delta) {
            return []
        }

        return this.appendPublicText(event.delta)
    }

    private appendPublicText(delta: string): ChatStreamChunk[] {
        const chunks: ChatStreamChunk[] = []
        if (!this.textStarted) {
            this.textStarted = true
            chunks.push({ partId: this.options.answerPartId, type: 'text-start' })
        }
        chunks.push({ delta, partId: this.options.answerPartId, type: 'text-delta' })
        return chunks
    }

    endFinalText(): ChatStreamChunk | null {
        if (!this.textStarted || this.textEnded) {
            return null
        }

        this.textEnded = true
        return { partId: this.options.answerPartId, type: 'text-end' }
    }

    projectPublicRuntimeChunk(candidate: unknown): ChatStreamChunk | null {
        const parsed = chatStreamChunkSchema.safeParse(candidate)
        if (!parsed.success || !allowedRuntimeChunkTypes.has(parsed.data.type)) {
            return null
        }

        return parsed.data as ChatStreamChunk
    }
}
