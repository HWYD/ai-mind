import { createId } from '../internal/create-id'
import type { AgentArtifactFormat, AgentArtifactKind, AgentTextArtifactMetadata, ChatStreamChunk } from '../protocol'
import type { WriteChunk } from './stream-types'

const DEFAULT_MAX_CHUNK_CHARS = 1600
const FALLBACK_CHUNK_CHARS = 1200

export interface EmitTextArtifactOptions {
    artifactId?: string
    artifactKind: AgentArtifactKind
    format?: AgentArtifactFormat
    metadata?: AgentTextArtifactMetadata
    sourceStepId?: string
    title: string
}

export interface EmitTextArtifactFromMarkdownOptions extends EmitTextArtifactOptions {
    markdown: string
}

export function createTextArtifactId(kind: AgentArtifactKind) {
    return `artifact:${kind}:${createId()}`
}

function splitByHeading(markdown: string, headingPattern: RegExp) {
    const sections = markdown.split(headingPattern).filter(section => section.length > 0)

    return sections.length > 1 ? sections : []
}

function splitByParagraph(markdown: string) {
    const sections: string[] = []
    let cursor = 0
    const separatorPattern = /\n{2,}/g
    let match: RegExpExecArray | null

    while ((match = separatorPattern.exec(markdown))) {
        const endIndex = match.index + match[0].length
        sections.push(markdown.slice(cursor, endIndex))
        cursor = endIndex
    }

    if (cursor < markdown.length) {
        sections.push(markdown.slice(cursor))
    }

    return sections.filter(section => section.length > 0)
}

function splitByFixedLength(markdown: string) {
    const sections: string[] = []

    for (let index = 0; index < markdown.length; index += FALLBACK_CHUNK_CHARS) {
        sections.push(markdown.slice(index, index + FALLBACK_CHUNK_CHARS))
    }

    return sections
}

function splitOversizedChunk(chunk: string, maxChunkChars: number) {
    if (chunk.length <= maxChunkChars) {
        return [chunk]
    }

    const sections: string[] = []

    for (let index = 0; index < chunk.length; index += maxChunkChars) {
        sections.push(chunk.slice(index, index + maxChunkChars))
    }

    return sections
}

function mergeArtifactChunks(chunks: string[], maxChunkChars: number) {
    const merged: string[] = []
    let current = ''

    for (const rawChunk of chunks.flatMap(chunk => splitOversizedChunk(chunk, maxChunkChars))) {
        if (!current) {
            current = rawChunk
            continue
        }

        if (current.length + rawChunk.length <= maxChunkChars) {
            current += rawChunk
            continue
        }

        merged.push(current)
        current = rawChunk
    }

    if (current) {
        merged.push(current)
    }

    return merged
}

export function chunkMarkdownForArtifact(markdown: string, maxChunkChars = DEFAULT_MAX_CHUNK_CHARS) {
    if (!markdown) {
        return []
    }

    const h2Sections = splitByHeading(markdown, /(?=^##\s+)/m)
    const h3Sections = h2Sections.length > 0 ? [] : splitByHeading(markdown, /(?=^###\s+)/m)
    const paragraphSections = h2Sections.length > 0 || h3Sections.length > 0 ? [] : splitByParagraph(markdown)

    if (h2Sections.length > 0) {
        return h2Sections.flatMap(chunk => splitOversizedChunk(chunk, maxChunkChars))
    }

    if (h3Sections.length > 0) {
        return h3Sections.flatMap(chunk => splitOversizedChunk(chunk, maxChunkChars))
    }

    if (paragraphSections.length > 1) {
        return paragraphSections.flatMap(chunk => splitOversizedChunk(chunk, maxChunkChars))
    }

    return mergeArtifactChunks(splitByFixedLength(markdown), maxChunkChars)
}

export function emitTextArtifactStart(writeChunk: WriteChunk, options: EmitTextArtifactOptions & { artifactId: string }) {
    writeChunk({
        type: 'artifact-start',
        artifactId: options.artifactId,
        artifactKind: options.artifactKind,
        artifactType: 'text',
        format: options.format ?? 'markdown',
        metadata: options.metadata,
        sourceStepId: options.sourceStepId,
        title: options.title,
    })
}

export function emitTextArtifactDelta(writeChunk: WriteChunk, artifactId: string, delta: string) {
    if (!delta) {
        return
    }

    writeChunk({
        type: 'artifact-delta',
        artifactId,
        delta,
    })
}

export function emitTextArtifactEnd(
    writeChunk: WriteChunk,
    artifactId: string,
    status: 'completed' | 'failed',
    options: { error?: string; metadata?: AgentTextArtifactMetadata } = {}
) {
    writeChunk({
        type: 'artifact-end',
        artifactId,
        error: options.error,
        metadata: options.metadata,
        status,
    })
}

export function emitTextArtifactFromMarkdown(writeChunk: WriteChunk, options: EmitTextArtifactFromMarkdownOptions) {
    if (!options.markdown) {
        return null
    }

    const artifactId = options.artifactId ?? createTextArtifactId(options.artifactKind)
    const chunks = chunkMarkdownForArtifact(options.markdown)
    const baseMetadata = {
        ...options.metadata,
        charCount: options.markdown.length,
        sectionCount: chunks.length,
    } satisfies AgentTextArtifactMetadata

    emitTextArtifactStart(writeChunk, {
        artifactId,
        artifactKind: options.artifactKind,
        format: options.format ?? 'markdown',
        metadata: options.metadata,
        sourceStepId: options.sourceStepId,
        title: options.title,
    })

    for (const chunk of chunks) {
        emitTextArtifactDelta(writeChunk, artifactId, chunk)
    }

    emitTextArtifactEnd(writeChunk, artifactId, 'completed', {
        metadata: baseMetadata,
    })

    return {
        artifactId,
        chunks,
        endChunk: {
            type: 'artifact-end',
            artifactId,
            metadata: baseMetadata,
            status: 'completed',
        } satisfies ChatStreamChunk,
    }
}
