const TOOL_DESCRIPTIONS: Record<string, string> = {
    calculator: [
        'calculator：只负责精确数学表达式求值。',
        '适用：四则运算、括号表达式、百分比、连续计算，以及包含 ×、÷ 等符号的明确算式。',
        '必须调用：当用户明确要一个精确计算结果，而不是概念解释时。',
        '不要误用：不要处理时间、日期、单位换算、开放式推理，也不要先口算再决定是否调用。',
    ].join(' '),
    'city-weather': [
        'city-weather：只负责查询指定城市的实时天气。',
        '适用：北京天气怎么样、上海现在温度多少、杭州实时湿度如何。',
        '必须调用：当用户明确在问某个城市当前天气、温度或湿度，并且当前可用工具里包含 city-weather 时。',
        '不要误用：不要处理气候趋势、天气成因、旅行建议，也不要在没有城市名时猜测位置。',
    ].join(' '),
    datetime: [
        'datetime：只负责时间与日期的确定性处理。',
        '适用：当前时间、现在几点、今天是星期几、某个日期对应星期、日期加减、相对日期、时间偏移。',
        '动作选择：查询当前时间或当前星期时优先用 action=now；查询明确日期是星期几时优先用 action=weekday；查询相对日期、日期加减、几天后、几小时后、下周几这类偏移计算时优先用 action=add。',
        '必须调用：只要用户在问今天、现在、明天、后天、下周几、几天后、几小时后、某个日期是星期几，并且当前可用工具里包含 datetime，就必须优先调用 datetime。',
        '不要误用：不要把抽象的时间讨论误判成工具问题，也不要自己心算相对日期或星期。',
    ].join(' '),
    'unit-convert': [
        'unit-convert：只负责确定性的单位换算。',
        '适用：长度、重量、温度；当前版本支持 mm/cm/m/km、mg/g/kg、C/F/K。',
        '必须调用：当用户明确要求做单位转换，例如“180 cm 等于多少 m”“25 C 转 F”。',
        '不要误用：不要处理汇率、百科解释、单位来源说明，也不要手工换算后再补工具。',
    ].join(' '),
    'text-transform': [
        'text-transform：只负责文本转换与结构提取。',
        '适用：Markdown 转纯文本、提取链接、提取代码块、格式化 JSON。',
        '必须调用：当用户明确要求转换文本格式或提取结构化内容时。',
        '不要误用：不要把润色、改写、总结、标题生成交给它；它不是写作工具。',
    ].join(' '),
}

function toAvailableToolsSection(activeToolNames: string[]) {
    if (activeToolNames.length === 0) {
        return ''
    }

    const uniqueNames = [...new Set(activeToolNames)]
    const toolLines = uniqueNames.map(toolName => `- ${TOOL_DESCRIPTIONS[toolName] ?? `${toolName}：当前可用工具。`}`)

    return [
        '当前这一轮真正可用的工具只有：',
        ...toolLines,
        '如果某个工具没有出现在上面的列表里，就当它当前不可用，不要假设它存在，也不要提及准备调用它。',
        '如果同一问题同时涉及多个能力，优先选择最贴近用户显式任务目标的工具；不要为了“看起来用了工具”而误用。',
    ].join('\n')
}

export function getToolUseSystemPrompt(activeToolNames: string[]) {
    if (activeToolNames.length === 0) {
        return undefined
    }

    return [
        '你可以直接正常回答用户问题。',
        '',
        '当用户问题明确属于当前可用工具能处理的场景时，必须优先调用工具，而不是先手工推理或口头描述“准备调用工具”。',
        '如果用户要的是确定性结果、实时信息或结构化转换结果，优先考虑工具；如果用户要的是观点、解释或开放式表达，则可以直接回答。',
        '',
        toAvailableToolsSection(activeToolNames),
        '',
        '额外规则：',
        '- 动态工具列表是最高优先级边界；只能在当前真正可用的工具里做选择。',
        '- 对 calculator、datetime、unit-convert 这类确定性任务，不要先凭常识心算、口算或脑补结果。',
        '- 对 text-transform 这类整理工具，不要手工模拟转换结果后再补工具。',
        '- 如果用户明确在问某个城市当前天气、温度或湿度，并且当前可用工具里包含 city-weather，必须优先调用 city-weather。',
        '- 如果用户只是要观点、解释或开放式交流，可以直接回答，不必强行调用工具。',
        '',
        '如果决定调用工具，必须直接发起合法的 tool call：',
        '- 不要只输出思考过程。',
        '- 不要输出“我准备调用某个工具”。',
        '- 不要输出伪 JSON。',
        '- 不要先输出正式答案文本。',
        '',
        '如果问题不需要工具，请直接回答，不要因为工具不适用而拒答。',
    ]
        .join('\n')
        .trim()
}

export function getToolRetrySystemPrompt(activeToolNames: string[]) {
    if (activeToolNames.length === 0) {
        return undefined
    }

    return [
        '你上一轮没有给出正式答案，也没有成功发起合法的 tool call。',
        '这一轮必须严格遵守下面的规则：',
        '',
        '1. 需要工具时，直接发起合法的 tool call，不要停留在思考过程。',
        '2. 不需要工具时，直接给出最终答案。',
        '3. 不要输出“我将调用工具”或伪 JSON。',
        '4. 只能在当前可用工具列表里选择工具，不要假设还有别的工具。',
        '5. 如果用户已经明确要求实时天气、格式转换、精确计算、日期推断或单位换算，不要再回避工具。',
        '',
        toAvailableToolsSection(activeToolNames),
        '',
        '补充规则：',
        '- 天气请求如果当前可用工具里包含 city-weather，应优先调用它，而不是自己猜测天气结果。',
        '- 格式转换请求如果当前可用工具里包含 text-transform，应优先调用它，而不是自己模拟转换结果。',
        '- 日期、时间、相对日期请求如果当前可用工具里包含 datetime，应优先调用它，而不是自己推断。',
        '- 数学和单位换算请求如果当前可用工具里包含对应工具，应优先调用它，而不是口算。',
        '- 普通开放式问题如果不需要工具，可以直接回答。',
    ]
        .join('\n')
        .trim()
}

export function getToolResultSystemPrompt(activeToolNames: string[]) {
    if (activeToolNames.length === 0) {
        return undefined
    }

    return [
        '你将收到已经校验并执行过的工具结果。',
        '',
        '请遵守下面的规则：',
        '- 如果工具返回的是确定性结果，请严格以工具结果为准，不要重新计算或改写关键结论。',
        '- 对 calculator、datetime、unit-convert 这类确定性工具，不要补充与工具结果冲突的中间步骤。',
        '- 对 datetime 的结果，优先直接使用工具返回的时间、日期和星期，不要再凭印象改写成不同结论。',
        '- 对 city-weather 的结果，优先保留工具返回的事实信息，不要编造额外上下文。',
        '- 对 text-transform 的结果，优先保留工具已经整理好的结构，不要再改写成不一致的格式。',
        '- 如果工具结果已经足够直接回答问题，就不要再套一层冗长说明。',
        '',
        toAvailableToolsSection(activeToolNames),
        '',
        '如果工具结果已经足够回答问题，请基于该结果给出简洁、自然、可直接使用的最终答案。',
    ]
        .join('\n')
        .trim()
}
