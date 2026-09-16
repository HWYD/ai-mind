import { tool } from '@langchain/core/tools'
import { evaluate } from 'mathjs'
import { z } from 'zod'

import type { ChatToolDefinition } from './registry'

// 把常见中文和全角运算符转换成 mathjs 更稳定识别的标准形式。
export function normalizeCalculatorExpression(expression: string): string {
    return expression
        .trim()
        .replaceAll('（', '(')
        .replaceAll('）', ')')
        .replaceAll('【', '(')
        .replaceAll('】', ')')
        .replaceAll('＋', '+')
        .replaceAll('－', '-')
        .replaceAll('—', '-')
        .replaceAll('–', '-')
        .replaceAll('×', '*')
        .replaceAll('✕', '*')
        .replaceAll('÷', '/')
        .replaceAll('／', '/')
        .replaceAll('，', ',')
        .replace(/\s+/g, ' ')
}

const calculatorIdentifierAllowlist = new Set([
    'abs',
    'ceil',
    'cos',
    'e',
    'exp',
    'floor',
    'log',
    'ln',
    'max',
    'min',
    'pi',
    'pow',
    'round',
    'sin',
    'sqrt',
    'tan',
])

const maxCalculatorNestingDepth = 32
const maxCalculatorOperators = 64
const maxCalculatorTokens = 128

export function validateCalculatorExpression(expression: string): string {
    const normalizedExpression = normalizeCalculatorExpression(expression)

    if (!normalizedExpression || normalizedExpression.length > 200) {
        throw new Error('计算表达式长度超出限制。')
    }

    if (!/^[0-9a-zA-Z_+*/%^().,\s-]+$/.test(normalizedExpression)) {
        throw new Error('计算表达式包含不支持的语法。')
    }

    const identifiers = normalizedExpression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
    if (identifiers.some(identifier => !calculatorIdentifierAllowlist.has(identifier))) {
        throw new Error('计算表达式包含不支持的标识符。')
    }

    const nestingDepth = [...normalizedExpression].reduce((depth, character) => {
        if (character === '(') return depth + 1
        if (character === ')') return depth - 1
        return depth
    }, 0)
    let depth = 0
    for (const character of normalizedExpression) {
        if (character === '(') depth += 1
        if (character === ')') depth -= 1
        if (depth < 0 || depth > maxCalculatorNestingDepth) {
            throw new Error('计算表达式嵌套层级超出限制。')
        }
    }
    if (nestingDepth !== 0 || depth !== 0) {
        throw new Error('计算表达式括号不匹配。')
    }

    const operatorCount = (normalizedExpression.match(/[+*/%^,-]/g) ?? []).length
    if (operatorCount > maxCalculatorOperators) {
        throw new Error('计算表达式复杂度超出限制。')
    }

    const tokenCount = normalizedExpression.match(/[0-9]+(?:\.[0-9]+)?|[A-Za-z_][A-Za-z0-9_]*|[+*/%^(),-]/g)?.length ?? 0
    if (tokenCount === 0 || tokenCount > maxCalculatorTokens) {
        throw new Error('计算表达式复杂度超出限制。')
    }

    return normalizedExpression
}

export const calculatorToolSchema = z.object({
    expression: z
        .string()
        .min(1)
        .max(200)
        .superRefine((expression, context) => {
            try {
                validateCalculatorExpression(expression)
            } catch (error) {
                context.addIssue({
                    code: 'custom',
                    message: error instanceof Error ? error.message : '计算表达式无效。',
                })
            }
        })
        .describe('需要计算的数学表达式，例如 (12 + 8) * 3'),
})

// 计算器工具只负责执行确定性的数学表达式求值。
export const calculatorTool = tool(
    async ({ expression }) => {
        try {
            const normalizedExpression = validateCalculatorExpression(expression)
            const result = evaluate(normalizedExpression)

            if (typeof result === 'string') {
                return result
            }

            if (typeof result === 'number' || typeof result === 'boolean' || typeof result === 'bigint') {
                return String(result)
            }

            return JSON.stringify(result)
        } catch {
            throw new Error('计算表达式无效，请检查输入格式。')
        }
    },
    {
        name: 'calculator',
        description: '执行数学表达式计算，适用于四则运算、括号、小数和常见数学函数。',
        schema: calculatorToolSchema,
    }
)

// 统一处理 calculator 的参数归一化，避免服务端主流程知道工具细节。
export function normalizeCalculatorToolArgs(args: unknown): unknown {
    if (!args || typeof args !== 'object' || !('expression' in args)) {
        return args
    }

    const expression = args.expression

    if (typeof expression !== 'string') {
        return args
    }

    return {
        ...args,
        expression: normalizeCalculatorExpression(expression),
    }
}

// 把工具参数转成前端可读文本，便于展示 tool part。
export function formatCalculatorToolInput(args: unknown): string {
    if (!args || typeof args !== 'object' || !('expression' in args)) {
        return JSON.stringify(args ?? {}, null, 2)
    }

    const expression = args.expression

    if (typeof expression === 'string') {
        return normalizeCalculatorExpression(expression)
    }

    return JSON.stringify(args, null, 2)
}

export const calculatorToolDefinition: ChatToolDefinition<z.infer<typeof calculatorToolSchema>> = {
    executionPolicy: {
        attemptTimeoutMs: 1000,
        kind: 'standard-tool',
        profile: 'local-deterministic',
        retrySafe: true,
    },
    name: 'calculator',
    tool: calculatorTool,
    schema: calculatorToolSchema,
    normalizeArgs: normalizeCalculatorToolArgs,
    formatInput: formatCalculatorToolInput,
    getDisplayConfig: args => ({
        title: 'calculator',
        action: 'evaluate',
        inputPreview: formatCalculatorToolInput(args),
    }),
    resultIsAuthoritative: true,
    runtimeScopes: ['skill-binding', 'general-react-agent'],
}
