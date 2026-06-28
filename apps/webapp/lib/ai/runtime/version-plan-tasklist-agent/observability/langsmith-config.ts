export type TasklistLangSmithEnvironment = 'development' | 'production' | 'test' | 'unknown'

export type TasklistLangSmithConfig =
    | {
          apiKey: string
          enabled: true
          environment: TasklistLangSmithEnvironment
          project: string
      }
    | {
          disabledReason: 'missing_api_key' | 'tracing_off'
          enabled: false
          environment: TasklistLangSmithEnvironment
          project: string
      }

export type TasklistLangSmithEnv = Partial<Record<'LANGSMITH_API_KEY' | 'LANGSMITH_PROJECT' | 'LANGSMITH_TRACING' | 'NODE_ENV', string>>

const DEFAULT_LANGSMITH_PROJECT = 'ai-mind-dev'

function resolveTasklistLangSmithEnvironment(nodeEnv: string | undefined): TasklistLangSmithEnvironment {
    switch (nodeEnv) {
        case 'development':
        case 'production':
        case 'test':
            return nodeEnv
        default:
            return 'unknown'
    }
}

export function resolveTasklistLangSmithConfig(env: TasklistLangSmithEnv = process.env): TasklistLangSmithConfig {
    const tracingEnabled = env.LANGSMITH_TRACING?.trim() === 'true'
    const apiKey = env.LANGSMITH_API_KEY?.trim()
    const project = env.LANGSMITH_PROJECT?.trim() || DEFAULT_LANGSMITH_PROJECT
    const environment = resolveTasklistLangSmithEnvironment(env.NODE_ENV)

    if (!tracingEnabled) {
        return {
            disabledReason: 'tracing_off',
            enabled: false,
            environment,
            project,
        }
    }

    if (!apiKey) {
        return {
            disabledReason: 'missing_api_key',
            enabled: false,
            environment,
            project,
        }
    }

    return {
        apiKey,
        enabled: true,
        environment,
        project,
    }
}
