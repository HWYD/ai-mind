const MATH_PATTERNS = [/[0-9]+\s*[+\-*/×÷]/, /等于多少/, /计算/, /求值/, /百分比/, /乘以/, /除以/]

const DATETIME_PATTERNS = [
    /现在是什么时候/,
    /现在几点/,
    /今天是周几/,
    /今天星期几/,
    /今天是星期几/,
    /现在是星期几/,
    /明天/,
    /后天/,
    /昨天/,
    /前天/,
    /下周/,
    /下个月/,
    /星期几/,
    /周几/,
    /几天后/,
    /几小时后/,
    /日期/,
    /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/,
]

const UNIT_PATTERNS = [/\b\d+(?:\.\d+)?\s*(mm|cm|m|km|mg|g|kg|c|f|k)\b/i, /等于多少.*(mm|cm|m|km|mg|g|kg|C|F|K)/i, /单位换算/, /换算成/]

const TEXT_TRANSFORM_PATTERNS = [/Markdown.*纯文本/i, /转成纯文本/, /提取.*链接/, /提取.*代码块/, /格式化.*JSON/i, /JSON.*格式化/i]
const WEATHER_PATTERNS = [
    /[\u4e00-\u9fa5]{2,10}(?:市|区|县)?(?:现在)?(?:的)?(?:实时)?(?:天气|温度|湿度)/,
    /(?:查一下|查询|看看|帮我查一下|帮我看一下)[\u4e00-\u9fa5]{2,10}(?:市|区|县)?(?:现在)?(?:的)?(?:天气|温度|湿度)/,
]
const ROOT_TEXT_FILE_PATTERN = /[A-Za-z0-9._-]+\.(?:md|txt|json|yaml|yml|js|ts|tsx)/i
const READ_FILE_PATTERNS = [/读取/, /读一下/, /看一下/, /查看/, /总结/, /提取/, /打开/]

function normalizeText(text: string) {
    return text.trim().replace(/\s+/g, ' ')
}

function matchesAny(text: string, patterns: RegExp[]) {
    return patterns.some(pattern => pattern.test(text))
}

function hasDeterministicUtilityIntent(text: string) {
    return matchesAny(text, [...MATH_PATTERNS, ...DATETIME_PATTERNS, ...UNIT_PATTERNS])
}

function hasPureTextTransformIntent(text: string) {
    return matchesAny(text, TEXT_TRANSFORM_PATTERNS)
}

function hasWeatherIntent(text: string) {
    return matchesAny(text, WEATHER_PATTERNS)
}

function hasRootFileReadIntent(text: string) {
    return ROOT_TEXT_FILE_PATTERN.test(text) && matchesAny(text, READ_FILE_PATTERNS)
}

export function matchesUtilityIntent(text: string) {
    const normalizedText = normalizeText(text)

    return hasDeterministicUtilityIntent(normalizedText) || hasPureTextTransformIntent(normalizedText)
}

export function matchesReaderIntent(text: string) {
    const normalizedText = normalizeText(text)

    return hasWeatherIntent(normalizedText) || hasRootFileReadIntent(normalizedText)
}

export function selectSkillByRules(text: string): 'utility-skill' | 'reader-skill' | undefined {
    const normalizedText = normalizeText(text)
    const readerIntent = matchesReaderIntent(normalizedText)
    const deterministicUtilityIntent = hasDeterministicUtilityIntent(normalizedText)
    const pureTextTransformIntent = hasPureTextTransformIntent(normalizedText)

    if (readerIntent) {
        return 'reader-skill'
    }

    if (pureTextTransformIntent || deterministicUtilityIntent) {
        return 'utility-skill'
    }

    return undefined
}
