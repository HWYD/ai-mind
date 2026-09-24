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
    private activeAgentText: { partId: string; modelTurnId: string; text: string } | undefined
    private modelTurnOrdinal = 1
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

    endTrace(state: GeneralReActTraceTerminalState, finalizationMode?: 'constrained' | 'normal' | unknown): ChatStreamChunk {
        return {
            partId: this.options.tracePartId,
            runId: this.options.runId,
            status: state,
            type: 'agent-run-end',
            ...(state === 'completed' && (finalizationMode === 'constrained' || finalizationMode === 'normal') ? { finalizationMode } : {}),
        }
    }

    projectModelText(delta: string): ChatStreamChunk[] {
        if (!delta) {
            return []
        }

        const chunks: ChatStreamChunk[] = []
        if (!this.activeAgentText) {
            const partId = `agent-text:${this.options.runId}:${this.modelTurnOrdinal}`
            const modelTurnId = `${this.options.runId}:${this.modelTurnOrdinal}`
            this.activeAgentText = { modelTurnId, partId, text: '' }
            chunks.push({ modelTurnId, partId, runId: this.options.runId, type: 'agent-text-start' })
        }

        this.activeAgentText.text += delta
        chunks.push({ delta, partId: this.activeAgentText.partId, type: 'agent-text-delta' })
        return chunks
    }

    getActiveModelText(): string {
        return this.activeAgentText?.text ?? ''
    }

    endModelText(input: { outcome: 'commentary' | 'final_answer'; status: 'completed' | 'interrupted' }): ChatStreamChunk | null {
        const active = this.activeAgentText
        this.activeAgentText = undefined
        this.modelTurnOrdinal += 1

        if (!active) {
            return null
        }

        if (input.outcome === 'final_answer' && input.status !== 'completed') {
            throw new TypeError('Final Agent text must complete normally.')
        }

        if (input.outcome === 'final_answer') {
            return {
                outcome: 'final_answer',
                partId: active.partId,
                status: 'completed',
                type: 'agent-text-end',
            }
        }

        return {
            outcome: 'commentary',
            partId: active.partId,
            status: input.status,
            type: 'agent-text-end',
        }
    }

    advanceModelTurn(): void {
        if (!this.activeAgentText) {
            this.modelTurnOrdinal += 1
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
