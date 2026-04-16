import { createStreamErrorChunk } from '../src'

describe('stream core package smoke', () => {
    it('creates an error chunk with stable shape', () => {
        const chunk = createStreamErrorChunk({
            scope: 'runtime',
            errorCode: 'MODEL_STREAM_FAILED',
            retryable: true,
            message: 'failed',
            stage: 'runtime',
        })

        expect(chunk.type).toBe('error')
        expect(chunk.scope).toBe('runtime')
        expect(chunk.errorCode).toBe('MODEL_STREAM_FAILED')
    })
})
