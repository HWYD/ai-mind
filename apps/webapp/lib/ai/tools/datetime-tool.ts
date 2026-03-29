import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import type { ChatToolDefinition } from './registry'

const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

const dateTimeNowSchema = z.object({
    action: z.literal('now'),
    timezone: z.string().trim().min(1).optional(),
})

const dateTimeAddSchema = z.object({
    action: z.literal('add'),
    date: z.string().trim().min(1).optional(),
    amount: z.number().int().min(-10000).max(10000),
    unit: z.enum(['day', 'week', 'month', 'hour', 'minute']),
    timezone: z.string().trim().min(1).optional(),
})

const dateTimeWeekdaySchema = z.object({
    action: z.literal('weekday'),
    date: z.string().trim().min(1),
    timezone: z.string().trim().min(1).optional(),
})

export const datetimeToolSchema = z.discriminatedUnion('action', [dateTimeNowSchema, dateTimeAddSchema, dateTimeWeekdaySchema])

function resolveTimeZone(timezone?: string) {
    return timezone?.trim() || DEFAULT_TIMEZONE
}

function parseDateOrThrow(date: string) {
    const parsedDate = new Date(date)

    if (Number.isNaN(parsedDate.getTime())) {
        throw new Error('日期格式无效，请传入可解析的日期字符串。')
    }

    return parsedDate
}

function getDateTimeParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    })
    const parts = formatter.formatToParts(date)
    const getPartValue = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''

    return {
        year: getPartValue('year'),
        month: getPartValue('month'),
        day: getPartValue('day'),
        hour: getPartValue('hour'),
        minute: getPartValue('minute'),
        second: getPartValue('second'),
    }
}

function formatDateTime(date: Date, timeZone: string) {
    const parts = getDateTimeParts(date, timeZone)

    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

function formatWeekday(date: Date, timeZone: string) {
    return new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        weekday: 'long',
    }).format(date)
}

function shiftDate(date: Date, amount: number, unit: 'day' | 'week' | 'month' | 'hour' | 'minute') {
    const nextDate = new Date(date)

    switch (unit) {
        case 'day':
            nextDate.setUTCDate(nextDate.getUTCDate() + amount)
            return nextDate
        case 'week':
            nextDate.setUTCDate(nextDate.getUTCDate() + amount * 7)
            return nextDate
        case 'month':
            nextDate.setUTCMonth(nextDate.getUTCMonth() + amount)
            return nextDate
        case 'hour':
            nextDate.setUTCHours(nextDate.getUTCHours() + amount)
            return nextDate
        case 'minute':
            nextDate.setUTCMinutes(nextDate.getUTCMinutes() + amount)
            return nextDate
    }
}

function formatNowResult(timeZone: string, date: Date) {
    return ['动作：now', `时区：${timeZone}`, `时间：${formatDateTime(date, timeZone)}`, `星期：${formatWeekday(date, timeZone)}`].join(
        '\n'
    )
}

function formatAddResult(
    timeZone: string,
    sourceDate: Date,
    resultDate: Date,
    amount: number,
    unit: 'day' | 'week' | 'month' | 'hour' | 'minute'
) {
    return [
        '动作：add',
        `时区：${timeZone}`,
        `起始时间：${formatDateTime(sourceDate, timeZone)}`,
        `调整：${amount} ${unit}`,
        `结果时间：${formatDateTime(resultDate, timeZone)}`,
        `结果星期：${formatWeekday(resultDate, timeZone)}`,
    ].join('\n')
}

function formatWeekdayResult(timeZone: string, date: Date) {
    return ['动作：weekday', `时区：${timeZone}`, `日期：${formatDateTime(date, timeZone)}`, `星期：${formatWeekday(date, timeZone)}`].join(
        '\n'
    )
}

export function normalizeDateTimeToolArgs(args: unknown): unknown {
    if (!args || typeof args !== 'object' || !('action' in args)) {
        return args
    }

    const normalizedArgs = { ...args } as Record<string, unknown>

    if (typeof normalizedArgs.timezone === 'string') {
        normalizedArgs.timezone = normalizedArgs.timezone.trim()
    }

    if (typeof normalizedArgs.date === 'string') {
        normalizedArgs.date = normalizedArgs.date.trim()
    }

    return normalizedArgs
}

export function formatDateTimeToolInput(args: unknown): string {
    if (!args || typeof args !== 'object' || !('action' in args)) {
        return JSON.stringify(args ?? {}, null, 2)
    }

    const input = args as Record<string, unknown>
    const action = typeof input.action === 'string' ? input.action : 'unknown'
    const timezone = typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : DEFAULT_TIMEZONE

    switch (action) {
        case 'now':
            return `action=now, timezone=${timezone}`
        case 'add':
            return `action=add, date=${String(input.date ?? 'now')}, amount=${String(input.amount ?? '')}, unit=${String(input.unit ?? '')}, timezone=${timezone}`
        case 'weekday':
            return `action=weekday, date=${String(input.date ?? '')}, timezone=${timezone}`
        default:
            return JSON.stringify(args, null, 2)
    }
}

// datetime 工具只负责时间与日期的确定性计算，不负责自然语言解释。
export const datetimeTool = tool(
    async input => {
        try {
            const timeZone = resolveTimeZone(input.timezone)

            switch (input.action) {
                case 'now':
                    return formatNowResult(timeZone, new Date())
                case 'add': {
                    const sourceDate = input.date ? parseDateOrThrow(input.date) : new Date()
                    const resultDate = shiftDate(sourceDate, input.amount, input.unit)

                    return formatAddResult(timeZone, sourceDate, resultDate, input.amount, input.unit)
                }
                case 'weekday': {
                    const date = parseDateOrThrow(input.date)

                    return formatWeekdayResult(timeZone, date)
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                throw error
            }

            throw new Error('时间工具执行失败，请检查输入参数。')
        }
    },
    {
        name: 'datetime',
        description: '执行当前时间、日期加减和星期判断等确定性时间处理。',
        schema: datetimeToolSchema,
    }
)

export const datetimeToolDefinition: ChatToolDefinition<z.infer<typeof datetimeToolSchema>> = {
    name: 'datetime',
    tool: datetimeTool,
    schema: datetimeToolSchema,
    normalizeArgs: normalizeDateTimeToolArgs,
    formatInput: formatDateTimeToolInput,
    getDisplayConfig: args => ({
        title: 'datetime',
        action: args.action,
        inputPreview: formatDateTimeToolInput(args),
    }),
}
