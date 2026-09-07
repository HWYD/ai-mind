import { z } from 'zod'

export const chatMemoryUsageSummarySchema = z
    .object({
        effectiveWindowTokens: z.int().positive(),
        usedPercent: z.int().nonnegative(),
    })
    .strict()

export type ChatMemoryUsageSummary = z.infer<typeof chatMemoryUsageSummarySchema>
