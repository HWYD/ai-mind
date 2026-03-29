import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import type { ChatToolDefinition, ToolDisplayConfig } from './registry'

const MAX_TEXT_LENGTH = 50000
const PREVIEW_LENGTH = 120

const markdownToTextSchema = z.object({
    action: z.literal('markdown-to-text'),
    text: z.string().min(1).max(MAX_TEXT_LENGTH),
})

const extractLinksSchema = z.object({
    action: z.literal('extract-links'),
    text: z.string().min(1).max(MAX_TEXT_LENGTH),
})

const extractCodeBlocksSchema = z.object({
    action: z.literal('extract-code-blocks'),
    text: z.string().min(1).max(MAX_TEXT_LENGTH),
})

const jsonPrettySchema = z.object({
    action: z.literal('json-pretty'),
    text: z.string().min(1).max(MAX_TEXT_LENGTH),
})

export const textTransformToolSchema = z.discriminatedUnion('action', [
    markdownToTextSchema,
    extractLinksSchema,
    extractCodeBlocksSchema,
    jsonPrettySchema,
])

function normalizeTextTransformText(text: string) {
    return text.replace(/\r\n?/g, '\n').trim()
}

function truncatePreview(text: string, maxLength = PREVIEW_LENGTH) {
    const normalizedText = text.replace(/\s+/g, ' ').trim()

    if (normalizedText.length <= maxLength) {
        return normalizedText
    }

    return `${normalizedText.slice(0, maxLength)}...`
}

function markdownToText(markdown: string) {
    return markdown
        .replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, language: string, code: string) => {
            const languageLabel = language.trim()

            if (!languageLabel) {
                return `\n${code.trim()}\n`
            }

            return `\n[${languageLabel}]\n${code.trim()}\n`
        })
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[([^\]]*)]\(([^)]+)\)/g, (_, alt: string, url: string) => {
            const label = alt.trim()

            if (!label) {
                return url.trim()
            }

            return `${label} (${url.trim()})`
        })
        .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/^\s*[-*_]{3,}\s*$/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

function trimTrailingUrlPunctuation(url: string) {
    return url.replace(/[),.;!?]+$/g, '')
}

function extractLinks(text: string) {
    const links = new Set<string>()
    const markdownLinkRegex = /\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g
    const urlRegex = /https?:\/\/[^\s<>"'`]+/g

    for (const match of text.matchAll(markdownLinkRegex)) {
        const url = trimTrailingUrlPunctuation(match[1] ?? '')

        if (url) {
            links.add(url)
        }
    }

    for (const match of text.matchAll(urlRegex)) {
        const url = trimTrailingUrlPunctuation(match[0] ?? '')

        if (url) {
            links.add(url)
        }
    }

    return Array.from(links)
}

function extractCodeBlocks(text: string) {
    const codeBlocks: Array<{
        language: string
        code: string
    }> = []
    const codeBlockRegex = /```([^\n`]*)\n([\s\S]*?)```/g

    for (const match of text.matchAll(codeBlockRegex)) {
        codeBlocks.push({
            language: (match[1] ?? '').trim() || 'plain',
            code: (match[2] ?? '').trim(),
        })
    }

    return codeBlocks
}

function formatExtractLinksResult(links: string[]) {
    if (links.length === 0) {
        return '未提取到链接。'
    }

    return [`共提取到 ${links.length} 个链接：`, ...links.map((link, index) => `${index + 1}. ${link}`)].join('\n')
}

function formatExtractCodeBlocksResult(
    codeBlocks: Array<{
        language: string
        code: string
    }>
) {
    if (codeBlocks.length === 0) {
        return '未提取到代码块。'
    }

    return [
        `共提取到 ${codeBlocks.length} 个代码块：`,
        ...codeBlocks.map((codeBlock, index) => `#${index + 1} [${codeBlock.language}]\n${codeBlock.code || '(空代码块)'}`),
    ].join('\n\n')
}

function formatJsonPrettyResult(text: string) {
    try {
        return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
        throw new Error('JSON 格式无效，请检查输入内容。')
    }
}

// text-transform 只负责可验证的文本转换和结构提取，不承担开放式生成任务。
export const textTransformTool = tool(
    async input => {
        const text = normalizeTextTransformText(input.text)

        switch (input.action) {
            case 'markdown-to-text':
                return markdownToText(text)
            case 'extract-links':
                return formatExtractLinksResult(extractLinks(text))
            case 'extract-code-blocks':
                return formatExtractCodeBlocksResult(extractCodeBlocks(text))
            case 'json-pretty':
                return formatJsonPrettyResult(text)
        }
    },
    {
        name: 'text-transform',
        description: '执行文本转换与结构提取，适用于把 Markdown 转纯文本、提取链接、提取代码块和格式化 JSON。',
        schema: textTransformToolSchema,
    }
)

export function normalizeTextTransformToolArgs(args: unknown): unknown {
    if (!args || typeof args !== 'object' || !('action' in args) || !('text' in args)) {
        return args
    }

    const normalizedArgs = { ...args } as Record<string, unknown>

    if (typeof normalizedArgs.text === 'string') {
        normalizedArgs.text = normalizeTextTransformText(normalizedArgs.text)
    }

    return normalizedArgs
}

export function formatTextTransformToolInput(args: unknown): string {
    if (!args || typeof args !== 'object' || !('action' in args) || !('text' in args)) {
        return JSON.stringify(args ?? {}, null, 2)
    }

    const input = args as Record<string, unknown>
    const action = typeof input.action === 'string' ? input.action : 'unknown'
    const text = typeof input.text === 'string' ? truncatePreview(input.text) : ''

    return `action=${action}, text=${text}`
}

function getTextTransformDisplayConfig(args: unknown): ToolDisplayConfig {
    if (!args || typeof args !== 'object') {
        return {
            title: 'text-transform',
        }
    }

    const input = args as Record<string, unknown>

    return {
        title: 'text-transform',
        action: typeof input.action === 'string' ? input.action : undefined,
        inputPreview: typeof input.text === 'string' ? truncatePreview(input.text) : undefined,
    }
}

export const textTransformToolDefinition: ChatToolDefinition<z.infer<typeof textTransformToolSchema>> = {
    name: 'text-transform',
    tool: textTransformTool,
    schema: textTransformToolSchema,
    normalizeArgs: normalizeTextTransformToolArgs,
    formatInput: formatTextTransformToolInput,
    getDisplayConfig: getTextTransformDisplayConfig,
}
