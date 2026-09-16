import { z } from 'zod'

const toolFingerprintSchema = z.string().min(1)

export interface ToolFingerprintAdmissionContract {
    tryAcquire(fingerprint: string): boolean
}

// 该对象只存在于单次 Run context，保证并行 Action task 在进入 provider 前同步竞争同一指纹。
export class ToolFingerprintAdmission implements ToolFingerprintAdmissionContract {
    readonly #admittedFingerprints = new Set<string>()

    tryAcquire(fingerprint: string): boolean {
        const parsedFingerprint = toolFingerprintSchema.parse(fingerprint)
        if (this.#admittedFingerprints.has(parsedFingerprint)) {
            return false
        }

        this.#admittedFingerprints.add(parsedFingerprint)
        return true
    }
}
