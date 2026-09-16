type ReferenceLoadEnvironment = Record<string, string | undefined>

export type ReferenceLoadConfig = {
    databaseInstance: string
    performanceGate: 'diagnostic' | 'production-like'
    topology: string
}

export function createReferenceLoadConfig(environment: ReferenceLoadEnvironment): ReferenceLoadConfig {
    const performanceGate = environment.AI_MIND_REFERENCE_LOAD_GATE === 'production-like' ? 'production-like' : 'diagnostic'
    const topology = environment.AI_MIND_REFERENCE_LOAD_TOPOLOGY?.trim() || 'unspecified'
    const databaseInstance = environment.AI_MIND_REFERENCE_LOAD_DATABASE_INSTANCE?.trim() || 'unspecified'

    if (performanceGate === 'production-like' && topology === 'unspecified') {
        throw new Error('AI_MIND_REFERENCE_LOAD_TOPOLOGY is required for a production-like reference load.')
    }
    if (performanceGate === 'production-like' && databaseInstance === 'unspecified') {
        throw new Error('AI_MIND_REFERENCE_LOAD_DATABASE_INSTANCE is required for a production-like reference load.')
    }

    return { databaseInstance, performanceGate, topology }
}
