import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'

type ModelTurnStreamFixtureInput = {
    content: string
    finishReason?: string
    modelTurnId?: string
    publicTextDeltas?: string[]
    reasoningContent?: string
    toolCalls?: NonNullable<AIMessage['tool_calls']>
}

class ModelTurnStreamFixtureModel extends BaseChatModel {
    constructor(private readonly input: ModelTurnStreamFixtureInput) {
        super({})
    }

    _llmType(): string {
        return 'general-react-agent-model-turn-stream-fixture'
    }

    bindTools() {
        return this
    }

    async _generate(
        _messages: BaseMessage[],
        _options: this['ParsedCallOptions'],
        runManager?: CallbackManagerForLLMRun
    ): Promise<ChatResult> {
        for (const delta of this.input.publicTextDeltas ?? [this.input.content]) {
            await runManager?.handleLLMNewToken(delta, undefined, undefined, undefined, undefined, {
                chunk: new AIMessageChunk({ content: delta }),
            })
        }

        const message = new AIMessage({
            additional_kwargs: this.input.reasoningContent ? { reasoning_content: this.input.reasoningContent } : {},
            content: this.input.content,
            response_metadata: {
                ...(this.input.finishReason ? { finish_reason: this.input.finishReason } : {}),
                model_turn_id: this.input.modelTurnId ?? 'fixture-turn-1',
            },
            tool_calls: this.input.toolCalls,
        })
        return { generations: [{ message, text: message.text }] }
    }
}

export function createModelTurnStreamFixture(input: ModelTurnStreamFixtureInput) {
    return {
        expected: {
            finishReason: input.finishReason,
            modelTurnId: input.modelTurnId ?? 'fixture-turn-1',
            publicTextDeltas: input.publicTextDeltas ?? [input.content],
            toolCalls: input.toolCalls ?? [],
        },
        model: new ModelTurnStreamFixtureModel(input),
    }
}

export function createCompletedAgentRunEndFixture(finalizationMode: 'normal' | 'constrained') {
    return {
        finalizationMode,
        status: 'completed',
        type: 'agent-run-end',
    } as const
}
