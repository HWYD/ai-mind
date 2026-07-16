const CUSTOM_ELLIPSIS = '...'
const CUSTOM_ELLIPSIS_WIDTH = Array.from(CUSTOM_ELLIPSIS).reduce((total, character) => total + getCharacterWidth(character), 0)

function getCharacterWidth(character: string) {
    // 粗略按字体视觉宽度估算，优先保证聊天标题混排时不让浏览器再补默认省略号。
    if (/\s/.test(character)) {
        return 0.5
    }

    if (/[.,/#!$%^&*;:{}=\-_`~()]/.test(character)) {
        return 0.6
    }

    if (/[A-Z0-9]/.test(character)) {
        return 1.1
    }

    if (/[a-z]/.test(character)) {
        return 0.95
    }

    return (character.codePointAt(0) ?? 0) > 0xff ? 2 : 1
}

export function truncateConversationTitle(title: string, maxUnits = 24) {
    let units = 0
    let truncatedTitle = ''

    for (const character of title) {
        const nextUnits = units + getCharacterWidth(character)

        if (nextUnits + CUSTOM_ELLIPSIS_WIDTH > maxUnits) {
            return truncatedTitle.trimEnd().length > 0 ? `${truncatedTitle.trimEnd()}${CUSTOM_ELLIPSIS}` : CUSTOM_ELLIPSIS
        }

        truncatedTitle += character
        units = nextUnits
    }

    return title
}
