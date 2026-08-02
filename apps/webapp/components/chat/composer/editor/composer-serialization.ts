import type { Editor, JSONContent } from '@tiptap/react'

import type { ChatComposerDisplaySegment } from '@/lib/ai/types/chat'

import type { ComposerCommand, ComposerPayload, ComposerReference } from '../composer-types'
import { COMMAND_CHIP_NODE_NAME, RESOURCE_CHIP_NODE_NAME } from './composer-chip-nodes'

export function textToTiptapContent(text: string): JSONContent {
    const lines = text.length > 0 ? text.split('\n') : ['']

    return {
        type: 'doc',
        content: lines.map(line => ({
            type: 'paragraph',
            content: line ? [{ type: 'text', text: line }] : undefined,
        })),
    }
}

export function getEditorPlainText(editor: Editor) {
    return getPlainTextFromContent(editor.getJSON())
}

// Tiptap attrs 来自可序列化 JSON，读取时统一做类型收窄，避免后续 runtime 误用异常结构。
function getStringAttribute(attrs: JSONContent['attrs'], key: string) {
    const value = attrs?.[key]

    return typeof value === 'string' ? value : ''
}

function getOptionalStringAttribute(attrs: JSONContent['attrs'], key: string) {
    const value = attrs?.[key]

    return typeof value === 'string' && value ? value : undefined
}

function getInlineTextFromContent(content: JSONContent[] | undefined): string {
    return (content ?? [])
        .map(node => {
            if (node.type === 'text') {
                return node.text ?? ''
            }

            if (node.type === 'hardBreak') {
                return '\n'
            }

            if (node.type === COMMAND_CHIP_NODE_NAME || node.type === RESOURCE_CHIP_NODE_NAME) {
                // chip 的含义进入 composer.command/references；plainText 只保留用户真正输入的自然语言。
                return ''
            }

            return getInlineTextFromContent(node.content)
        })
        .join('')
}

export function getPlainTextFromContent(content: JSONContent): string {
    if (content.type !== 'doc') {
        return getInlineTextFromContent(content.content).replace(/\u00a0/g, ' ')
    }

    return (content.content ?? [])
        .map(node => getInlineTextFromContent(node.content))
        .join('\n')
        .replace(/\u00a0/g, ' ')
}

function extractComposerMetadata(content: JSONContent) {
    let command: ComposerCommand | undefined
    let reference: ComposerReference | undefined

    function visit(node: JSONContent) {
        if (node.type === COMMAND_CHIP_NODE_NAME) {
            const name = getStringAttribute(node.attrs, 'name')
            const label = getStringAttribute(node.attrs, 'label')

            if (name === 'check' || name === 'delivery-chain' || name === 'image' || name === 'summary' || name === 'tasklist') {
                command = { name, label: label || name }
            }

            return
        }

        if (node.type === RESOURCE_CHIP_NODE_NAME) {
            const id = getStringAttribute(node.attrs, 'id')
            const label = getStringAttribute(node.attrs, 'label')
            const source = getStringAttribute(node.attrs, 'source')
            const uri = getStringAttribute(node.attrs, 'uri')

            if (id && label && uri && (source === 'local' || source === 'remote')) {
                // v0.0.12 UI 暂时只保留一个资源 chip，但 payload 仍使用数组形态，为后续多引用留接口余量。
                reference = {
                    id,
                    type: 'resource',
                    label,
                    uri,
                    source,
                    ...(() => {
                        const serverId = getOptionalStringAttribute(node.attrs, 'serverId')

                        return serverId ? { serverId } : {}
                    })(),
                }
            }

            return
        }

        node.content?.forEach(visit)
    }

    visit(content)

    return {
        command,
        references: reference ? [reference] : [],
    }
}

function appendTextSegment(segments: ChatComposerDisplaySegment[], text: string) {
    if (!text) {
        return
    }

    const lastSegment = segments.at(-1)

    if (lastSegment?.type === 'text') {
        lastSegment.text += text
        return
    }

    segments.push({ type: 'text', text })
}

function buildDisplaySegmentsFromInlineContent(content: JSONContent[] | undefined): ChatComposerDisplaySegment[] {
    const segments: ChatComposerDisplaySegment[] = []

    for (const node of content ?? []) {
        if (node.type === 'text') {
            appendTextSegment(segments, node.text ?? '')
            continue
        }

        if (node.type === 'hardBreak') {
            appendTextSegment(segments, '\n')
            continue
        }

        if (node.type === COMMAND_CHIP_NODE_NAME) {
            const name = getStringAttribute(node.attrs, 'name')
            const label = getStringAttribute(node.attrs, 'label')

            if (name === 'check' || name === 'delivery-chain' || name === 'image' || name === 'summary' || name === 'tasklist') {
                segments.push({ type: 'command', command: { name, label: label || name } })
            }

            continue
        }

        if (node.type === RESOURCE_CHIP_NODE_NAME) {
            const id = getStringAttribute(node.attrs, 'id')
            const label = getStringAttribute(node.attrs, 'label')
            const source = getStringAttribute(node.attrs, 'source')
            const uri = getStringAttribute(node.attrs, 'uri')

            if (id && label && uri && (source === 'local' || source === 'remote')) {
                segments.push({
                    type: 'resource',
                    reference: {
                        id,
                        type: 'resource',
                        label,
                        uri,
                        source,
                        ...(() => {
                            const serverId = getOptionalStringAttribute(node.attrs, 'serverId')

                            return serverId ? { serverId } : {}
                        })(),
                    },
                })
            }

            continue
        }

        for (const childSegment of buildDisplaySegmentsFromInlineContent(node.content)) {
            if (childSegment.type === 'text') {
                appendTextSegment(segments, childSegment.text)
            } else {
                segments.push(childSegment)
            }
        }
    }

    return segments
}

export function serializeComposerDisplaySegments(editor: Editor): ChatComposerDisplaySegment[] {
    const editorJSON = editor.getJSON()

    if (editorJSON.type !== 'doc') {
        return buildDisplaySegmentsFromInlineContent(editorJSON.content)
    }

    const segments: ChatComposerDisplaySegment[] = []

    for (const [paragraphIndex, paragraph] of (editorJSON.content ?? []).entries()) {
        if (paragraphIndex > 0) {
            appendTextSegment(segments, '\n')
        }

        for (const segment of buildDisplaySegmentsFromInlineContent(paragraph.content)) {
            if (segment.type === 'text') {
                appendTextSegment(segments, segment.text)
            } else {
                segments.push(segment)
            }
        }
    }

    return segments
}

export function serializeComposerPayload(editor: Editor): ComposerPayload {
    const editorJSON = editor.getJSON()
    const metadata = extractComposerMetadata(editorJSON)

    // 发送给后端的 composer 只保留语义；inline chip 的展示位置由 text part displaySegments 承接。
    return {
        plainText: getPlainTextFromContent(editorJSON),
        ...(metadata.command ? { command: metadata.command } : {}),
        ...(metadata.references && metadata.references.length > 0 ? { references: metadata.references } : {}),
    }
}
