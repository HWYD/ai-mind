import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import type { ChatToolDefinition } from './registry'

const lengthUnits = ['mm', 'cm', 'm', 'km'] as const
const weightUnits = ['mg', 'g', 'kg'] as const
const temperatureUnits = ['C', 'F', 'K'] as const

const supportedUnits = [...lengthUnits, ...weightUnits, ...temperatureUnits] as const

type UnitSymbol = (typeof supportedUnits)[number]

const unitConvertToolSchema = z.object({
    value: z.number().finite(),
    from: z.enum(supportedUnits),
    to: z.enum(supportedUnits),
})

const lengthFactors = {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    km: 1000,
} as const

const weightFactors = {
    mg: 0.001,
    g: 1,
    kg: 1000,
} as const

function normalizeUnitSymbol(unit: string): UnitSymbol | string {
    const normalizedUnit = unit.trim().replace(/^°/, '')

    if (normalizedUnit.toLowerCase() === 'c') {
        return 'C'
    }

    if (normalizedUnit.toLowerCase() === 'f') {
        return 'F'
    }

    if (normalizedUnit.toLowerCase() === 'k') {
        return 'K'
    }

    if (normalizedUnit.toLowerCase() === 'mm') {
        return 'mm'
    }

    if (normalizedUnit.toLowerCase() === 'cm') {
        return 'cm'
    }

    if (normalizedUnit.toLowerCase() === 'm') {
        return 'm'
    }

    if (normalizedUnit.toLowerCase() === 'km') {
        return 'km'
    }

    if (normalizedUnit.toLowerCase() === 'mg') {
        return 'mg'
    }

    if (normalizedUnit.toLowerCase() === 'g') {
        return 'g'
    }

    if (normalizedUnit.toLowerCase() === 'kg') {
        return 'kg'
    }

    return normalizedUnit
}

function formatConvertedNumber(value: number) {
    if (Number.isInteger(value)) {
        return String(value)
    }

    return Number(value.toFixed(12)).toString()
}

function getUnitCategory(unit: UnitSymbol) {
    if (lengthUnits.includes(unit as (typeof lengthUnits)[number])) {
        return 'length'
    }

    if (weightUnits.includes(unit as (typeof weightUnits)[number])) {
        return 'weight'
    }

    return 'temperature'
}

function convertLength(value: number, from: (typeof lengthUnits)[number], to: (typeof lengthUnits)[number]) {
    const baseValue = value * lengthFactors[from]
    return baseValue / lengthFactors[to]
}

function convertWeight(value: number, from: (typeof weightUnits)[number], to: (typeof weightUnits)[number]) {
    const baseValue = value * weightFactors[from]
    return baseValue / weightFactors[to]
}

function convertTemperature(value: number, from: (typeof temperatureUnits)[number], to: (typeof temperatureUnits)[number]) {
    const celsiusValue = from === 'C' ? value : from === 'F' ? ((value - 32) * 5) / 9 : value - 273.15

    if (to === 'C') {
        return celsiusValue
    }

    if (to === 'F') {
        return (celsiusValue * 9) / 5 + 32
    }

    return celsiusValue + 273.15
}

function convertUnitValue(value: number, from: UnitSymbol, to: UnitSymbol) {
    const fromCategory = getUnitCategory(from)
    const toCategory = getUnitCategory(to)

    if (fromCategory !== toCategory) {
        throw new Error('单位类型不兼容，无法在长度、重量和温度之间直接换算。')
    }

    if (fromCategory === 'length') {
        return convertLength(value, from as (typeof lengthUnits)[number], to as (typeof lengthUnits)[number])
    }

    if (fromCategory === 'weight') {
        return convertWeight(value, from as (typeof weightUnits)[number], to as (typeof weightUnits)[number])
    }

    return convertTemperature(value, from as (typeof temperatureUnits)[number], to as (typeof temperatureUnits)[number])
}

function formatUnitConvertOutput(value: number, from: UnitSymbol, to: UnitSymbol, result: number) {
    const formattedValue = formatConvertedNumber(value)
    const formattedResult = formatConvertedNumber(result)

    return `${formattedValue} ${from} = ${formattedResult} ${to}`
}

export function normalizeUnitConvertToolArgs(args: unknown): unknown {
    if (!args || typeof args !== 'object') {
        return args
    }

    const normalizedArgs = { ...args } as Record<string, unknown>

    if (typeof normalizedArgs.from === 'string') {
        normalizedArgs.from = normalizeUnitSymbol(normalizedArgs.from)
    }

    if (typeof normalizedArgs.to === 'string') {
        normalizedArgs.to = normalizeUnitSymbol(normalizedArgs.to)
    }

    return normalizedArgs
}

export function formatUnitConvertToolInput(args: unknown): string {
    if (!args || typeof args !== 'object') {
        return JSON.stringify(args ?? {}, null, 2)
    }

    const input = args as Record<string, unknown>

    return `value=${String(input.value ?? '')}, from=${String(input.from ?? '')}, to=${String(input.to ?? '')}`
}

// unit-convert 负责确定性单位换算，只处理当前版本明确支持的长度、重量和温度单位。
export const unitConvertTool = tool(
    async ({ value, from, to }) => {
        try {
            const result = convertUnitValue(value, from, to)

            return formatUnitConvertOutput(value, from, to, result)
        } catch (error) {
            if (error instanceof Error) {
                throw error
            }

            throw new Error('单位换算失败，请检查输入参数。')
        }
    },
    {
        name: 'unit-convert',
        description: '执行长度、重量和温度的确定性单位换算，适用于 cm/m、g/kg、C/F/K 等常见单位转换。',
        schema: unitConvertToolSchema,
    }
)

export const unitConvertToolDefinition: ChatToolDefinition<z.infer<typeof unitConvertToolSchema>> = {
    name: 'unit-convert',
    tool: unitConvertTool,
    schema: unitConvertToolSchema,
    normalizeArgs: normalizeUnitConvertToolArgs,
    formatInput: formatUnitConvertToolInput,
    getDisplayConfig: args => ({
        title: 'unit-convert',
        action: 'convert',
        inputPreview: formatUnitConvertToolInput(args),
    }),
    resultIsAuthoritative: true,
}
