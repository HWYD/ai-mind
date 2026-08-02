import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { ZodType } from 'zod'

import { createChatModel, getModelProviderConfig, resolveModelSelection } from '@/lib/ai/model-provider'

import type { ImagePlanningModel } from './nodes/planning-model'

/**
 * Image planning is a structured-output control step, so it must not follow
 * the model selected for ordinary chat. Keeping this selection server-side
 * makes the ImageBrief contract deterministic across entry points.
 */
export const IMAGE_PLANNING_MODEL_ID = 'deepseek/deepseek-v4-pro'

export function createImagePlanningModel(): ImagePlanningModel {
    const modelHandle = createChatModel({
        config: getModelProviderConfig(),
        enableReasoning: false,
        maxRetries: 0,
        resolvedModelSelection: resolveModelSelection({ modelId: IMAGE_PLANNING_MODEL_ID, routeType: 'image' }),
        streaming: false,
        temperature: 0,
    })

    return {
        async invoke(input, options) {
            const runnable = modelHandle.model.withStructuredOutput(options.schema, {
                name: input.schemaName,
            })

            return runnable.invoke(
                [
                    new SystemMessage('Return only the requested strict structured result. Do not disclose reasoning.'),
                    new HumanMessage(`${input.instruction}\n\nUser description:\n${input.rawDescription}`),
                ],
                {
                    signal: options.signal,
                }
            )
        },
    }
}
