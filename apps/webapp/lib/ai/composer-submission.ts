import type { ChatComposerPayload } from './types/chat'

export function hasComposerSemanticInput(composer: ChatComposerPayload | undefined) {
    return Boolean(composer?.plainText.trim() || composer?.command || (composer?.references?.length ?? 0) > 0)
}

export function resolveComposerSubmissionText(input: string, composer: ChatComposerPayload | undefined) {
    const text = input.trim()

    if (text) {
        return text
    }

    if (!hasComposerSemanticInput(composer)) {
        return ''
    }

    const commandLabel = composer?.command?.label
    const referenceLabels = composer?.references?.map(reference => `@${reference.label}`) ?? []

    // 后端 messages 仍要求至少有一段非空 text；chip-only 提交时用可读标签作为兼容文本。
    return [commandLabel, ...referenceLabels].filter(Boolean).join(' ').trim()
}
