import { tool } from '@langchain/core/tools'
import { evaluate } from 'mathjs'
import { z } from 'zod'

export const calculatorToolSchema = z.object({
    expression: z.string().min(1).max(200).describe('需要计算的数学表达式，例如 (12 + 8) * 3'),
})

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

// 计算器工具只负责执行确定性的数学表达式求值。
export const calculatorTool = tool(
    async ({ expression }) => {
        try {
            const normalizedExpression = normalizeCalculatorExpression(expression)
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
