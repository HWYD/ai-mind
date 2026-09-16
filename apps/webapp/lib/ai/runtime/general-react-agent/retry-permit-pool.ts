import { z } from 'zod'

import { GENERAL_REACT_RUNTIME_DEFAULTS } from './runtime-config'

const retryPermitRequestSchema = z
    .object({
        callId: z.string().min(1),
        retryOrdinal: z.union([z.literal(1), z.literal(2)]),
    })
    .strict()

export type RetryPermitRequest = z.infer<typeof retryPermitRequestSchema>

export interface RetryPermitGrant extends RetryPermitRequest {
    permitId: number
}

export interface RetryPermitPoolContract {
    snapshot(): readonly RetryPermitGrant[]
    tryAcquire(request: RetryPermitRequest): RetryPermitGrant | null
}

export class RetryPermitPool implements RetryPermitPoolContract {
    readonly #grants: RetryPermitGrant[] = []
    readonly #grantCountByCall = new Map<string, number>()

    tryAcquire(request: RetryPermitRequest): RetryPermitGrant | null {
        const parsed = retryPermitRequestSchema.parse(request)
        const grantedForCall = this.#grantCountByCall.get(parsed.callId) ?? 0

        if (this.#grants.length >= GENERAL_REACT_RUNTIME_DEFAULTS.maxToolRetries || parsed.retryOrdinal !== grantedForCall + 1) {
            return null
        }

        const grant = Object.freeze({
            callId: parsed.callId,
            permitId: this.#grants.length + 1,
            retryOrdinal: parsed.retryOrdinal,
        })
        this.#grants.push(grant)
        this.#grantCountByCall.set(parsed.callId, parsed.retryOrdinal)

        return grant
    }

    snapshot(): readonly RetryPermitGrant[] {
        return Object.freeze([...this.#grants])
    }
}
