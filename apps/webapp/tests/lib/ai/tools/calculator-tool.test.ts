import { performance } from 'node:perf_hooks'

import { describe, expect, it } from 'vitest'

import { calculatorTool, calculatorToolSchema } from '@/lib/ai/tools/calculator-tool'

describe('calculator tool safety bounds', () => {
    it('rejects unsupported syntax and excessive nesting before evaluation', () => {
        expect(calculatorToolSchema.safeParse({ expression: '2 + 2' }).success).toBe(true)
        expect(calculatorToolSchema.safeParse({ expression: '2 + process.env.SECRET' }).success).toBe(false)
        expect(calculatorToolSchema.safeParse({ expression: '('.repeat(40) + '1' + ')'.repeat(40) }).success).toBe(false)
        expect(calculatorToolSchema.safeParse({ expression: '1'.repeat(201) }).success).toBe(false)
        expect(calculatorToolSchema.safeParse({ expression: `${'1+'.repeat(65)}1` }).success).toBe(false)
        expect(calculatorToolSchema.safeParse({ expression: `${'1+'.repeat(64)}1` }).success).toBe(false)
        expect(calculatorToolSchema.safeParse({ expression: `1 + ${'1+'.repeat(64)}1` }).success).toBe(false)
    })

    it('keeps a maximum valid expression within the synchronous CPU budget', async () => {
        const expression = Array.from({ length: 30 }, () => '1+1').join('+')
        const parsed = calculatorToolSchema.safeParse({ expression })
        expect(parsed.success).toBe(true)

        const startedAt = performance.now()
        const result = await calculatorTool.invoke({ expression })
        const elapsedMs = performance.now() - startedAt

        expect(String(result)).toContain('60')
        expect(elapsedMs).toBeLessThan(50)
    })

    it('keeps repeated maximum-valid evaluations below the 5ms p95 target', async () => {
        const expression = Array.from({ length: 30 }, () => '1+1').join('+')
        const samples: number[] = []

        for (let index = 0; index < 25; index += 1) {
            const startedAt = performance.now()
            await calculatorTool.invoke({ expression })
            samples.push(performance.now() - startedAt)
        }

        samples.sort((left, right) => left - right)
        const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? 0
        expect(p95).toBeLessThanOrEqual(5)
    })
})
