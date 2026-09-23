import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { createAgent, modelRetryMiddleware } from 'langchain'

import { type GeneralReActRunContext, generalReActRunContextSchema } from '@/lib/ai/runtime/general-react-agent/agent-context'
import { generalReActAgentStateSchema } from '@/lib/ai/runtime/general-react-agent/agent-state'
import { createGeneralReActRunPolicyMiddleware } from '@/lib/ai/runtime/general-react-agent/middleware/run-policy-middleware'
import { createGeneralReActToolRuntimeMiddleware } from '@/lib/ai/runtime/general-react-agent/middleware/tool-runtime-middleware'
import { toolSupportsRuntimeScope } from '@/lib/ai/tools'

export function createGeneralReActAgent(input: { context: GeneralReActRunContext; model: BaseChatModel }) {
    const definitions = [...input.context.toolDefinitionMap.values()]
    for (const definition of definitions) {
        if (definition.executionPolicy.kind !== 'standard-tool' || !toolSupportsRuntimeScope(definition, 'general-react-agent')) {
            throw new TypeError(`General ReAct cannot bind non-standard or out-of-scope Tool: ${definition.name}`)
        }
    }

    let modelRetryCount = 0
    let finalState: typeof generalReActAgentStateSchema.State | undefined
    const retryMiddleware = modelRetryMiddleware({
        initialDelayMs: 1_000,
        jitter: true,
        maxRetries: 1,
        onFailure: 'error',
        retryOn: error => {
            if (input.context.hasPublishedPublicText?.() || modelRetryCount >= 1 || !input.context.normalizeModelError(error).retryable) {
                return false
            }
            modelRetryCount += 1
            return true
        },
    })

    const agent = createAgent({
        contextSchema: generalReActRunContextSchema,
        middleware: [
            createGeneralReActRunPolicyMiddleware({ captureFinalState: state => (finalState = state) }),
            createGeneralReActToolRuntimeMiddleware(),
            retryMiddleware,
        ],
        model: input.model,
        stateSchema: generalReActAgentStateSchema,
        tools: definitions.map(definition => definition.tool),
        version: 'v2',
    })

    return {
        agent,
        getFinalState: () => finalState,
        getModelRetryCount: () => modelRetryCount,
    }
}
