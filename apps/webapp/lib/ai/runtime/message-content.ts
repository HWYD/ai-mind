export function getMessageContentText(content: unknown): string {
    if (typeof content === 'string') {
        return content
    }

    if (!Array.isArray(content)) {
        return ''
    }

    return content
        .map(part => {
            if (typeof part === 'string') {
                return part
            }

            if (typeof part === 'object' && part && 'text' in part) {
                return String(part.text)
            }

            return ''
        })
        .join('')
}
