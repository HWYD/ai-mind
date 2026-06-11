import { writeStaticTextPart } from '@ai-mind/stream-core'

import type { ChatExecutionContext, ChatSession, WriteChunk } from '../../types'
import type { VersionPlanTasklistAgentState } from '../contract/types'
import { readVersionPlanForTasklistAgent } from '../resources/version-plan-reader'
import { runVersionPlanTasklistAgent } from '../tasklist-agent-runner'

export interface RunLegacyVersionPlanTasklistAgentRuntimeOptions {
    context: ChatExecutionContext
    model: ChatSession['baseModel']
    skeletonState: VersionPlanTasklistAgentState
    userGoal: string
    writeChunk: WriteChunk
}

export type LegacyVersionPlanTasklistAgentRuntimeResult =
    | {
          state: VersionPlanTasklistAgentState
          status: 'completed'
      }
    | {
          errorMessage: string
          state: VersionPlanTasklistAgentState
          status: 'read_failed'
      }

export async function runLegacyVersionPlanTasklistAgentRuntime(
    options: RunLegacyVersionPlanTasklistAgentRuntimeOptions
): Promise<LegacyVersionPlanTasklistAgentRuntimeResult> {
    const readResult = await readVersionPlanForTasklistAgent(options.skeletonState, {
        context: options.context,
        stepIndex: 1,
        userGoal: options.userGoal,
        writeChunk: options.writeChunk,
    })

    if (readResult.success === false) {
        writeStaticTextPart(
            options.writeChunk,
            [
                '版本方案读取失败，暂时无法继续生成 tasklist 草稿。',
                '',
                `错误信息：${readResult.errorMessage}`,
                '',
                '请确认引用的是可读取的 docs://versions/*.md 文件。v0.1.0 不会自动扫描 versions 目录，也不会读取 docs/tasklists/*。',
            ].join('\n')
        )

        return {
            errorMessage: readResult.errorMessage,
            state: readResult.state,
            status: 'read_failed',
        }
    }

    const finalState = await runVersionPlanTasklistAgent({
        context: options.context,
        initialState: readResult.state,
        model: options.model,
        userGoal: options.userGoal,
        writeChunk: options.writeChunk,
    })

    return {
        state: finalState,
        status: 'completed',
    }
}
