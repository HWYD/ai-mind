import { Embeddings } from '@langchain/core/embeddings'

const DEFAULT_DOUBAO_EMBEDDING_API_PATH = '/embeddings'

interface DoubaoEmbeddingClientOptions {
    apiKey: string
    baseURL: string
    dimensions?: number
    model: string
    timeoutMs: number
    fetchImpl?: typeof fetch
}

interface DoubaoEmbeddingResponseItem {
    embedding?: unknown
}

interface DoubaoEmbeddingResponse {
    data?: unknown
}

function resolveEmbeddingsEndpoint(baseURL: string): string {
    const trimmed = baseURL.trim()

    if (!trimmed) {
        throw new Error('A non-empty Doubao baseURL is required for UserMemory embeddings.')
    }

    const normalized = trimmed.replace(/\/+$/g, '')

    if (normalized.endsWith('/embeddings')) {
        return normalized
    }

    return `${normalized}${DEFAULT_DOUBAO_EMBEDDING_API_PATH}`
}

function toEmbeddingVector(rawValue: unknown, dimensions?: number): number[] {
    if (!Array.isArray(rawValue)) {
        throw new Error('Doubao embedding response item does not contain an embedding array.')
    }

    const vector = rawValue.map(value => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error('Doubao embedding response item contains a non-numeric vector value.')
        }

        return value
    })

    if (typeof dimensions === 'number' && vector.length !== dimensions) {
        throw new Error(`Doubao embedding dimensions mismatch. Expected ${dimensions}, received ${vector.length}.`)
    }

    return vector
}

function parseEmbeddingResponse(responseJson: DoubaoEmbeddingResponse, expectedCount: number, dimensions?: number): number[][] {
    if (!Array.isArray(responseJson.data)) {
        throw new Error('Doubao embedding response does not contain a data array.')
    }

    if (responseJson.data.length !== expectedCount) {
        throw new Error(`Doubao embedding response count mismatch. Expected ${expectedCount}, received ${responseJson.data.length}.`)
    }

    return responseJson.data.map(item => {
        if (!item || typeof item !== 'object') {
            throw new Error('Doubao embedding response item is invalid.')
        }

        return toEmbeddingVector((item as DoubaoEmbeddingResponseItem).embedding, dimensions)
    })
}

export class DoubaoEmbeddings extends Embeddings {
    private readonly apiKey: string
    private readonly dimensions?: number
    private readonly endpoint: string
    private readonly fetchImpl: typeof fetch
    private readonly model: string
    private readonly timeoutMs: number

    constructor(options: DoubaoEmbeddingClientOptions) {
        super({})

        this.apiKey = options.apiKey.trim()
        this.dimensions = options.dimensions
        this.endpoint = resolveEmbeddingsEndpoint(options.baseURL)
        this.fetchImpl = options.fetchImpl ?? fetch
        this.model = options.model
        this.timeoutMs = options.timeoutMs

        if (!this.apiKey) {
            throw new Error('AI_MIND_DOUBAO_API_KEY is required when AI_MIND_USER_MEMORY_STORE=postgres.')
        }
    }

    async embedDocuments(documents: string[]): Promise<number[][]> {
        if (documents.length === 0) {
            return []
        }

        return this.requestEmbeddings(documents)
    }

    async embedQuery(document: string): Promise<number[]> {
        const [embedding] = await this.requestEmbeddings([document])

        if (!embedding) {
            throw new Error('Doubao embedding query returned no vector.')
        }

        return embedding
    }

    private async requestEmbeddings(texts: string[]): Promise<number[][]> {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
            controller.abort()
        }, this.timeoutMs)

        try {
            const response = await this.fetchImpl(this.endpoint, {
                body: JSON.stringify({
                    dimensions: this.dimensions,
                    encoding_format: 'float',
                    input: texts,
                    model: this.model,
                }),
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                method: 'POST',
                signal: controller.signal,
            })

            if (!response.ok) {
                throw new Error(`Doubao embedding request failed with status ${response.status}.`)
            }

            const responseJson = (await response.json()) as DoubaoEmbeddingResponse

            return parseEmbeddingResponse(responseJson, texts.length, this.dimensions)
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Doubao embedding request timed out.')
            }

            throw error
        } finally {
            clearTimeout(timeoutId)
        }
    }
}

export function createDoubaoEmbeddings(options: DoubaoEmbeddingClientOptions): DoubaoEmbeddings {
    return new DoubaoEmbeddings(options)
}

export function resolveDoubaoEmbeddingsEndpoint(baseURL: string): string {
    return resolveEmbeddingsEndpoint(baseURL)
}
