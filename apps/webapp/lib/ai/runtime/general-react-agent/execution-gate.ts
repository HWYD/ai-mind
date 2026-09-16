import { type GeneralReActObserver, generalReActObserver } from './general-react-agent-observer'

const MAX_ACTIVE_GENERAL_REACT_RUNS = 8

export interface GeneralReActExecutionPermit {
    release(): void
}

export class GeneralReActExecutionGate {
    #activePermitCount = 0
    #observer: GeneralReActObserver

    constructor(observer: GeneralReActObserver = generalReActObserver) {
        this.#observer = observer
    }

    tryAcquire(): GeneralReActExecutionPermit | null {
        if (this.#activePermitCount >= MAX_ACTIVE_GENERAL_REACT_RUNS) {
            this.#observer.recordCapacityRejection()
            return null
        }

        this.#activePermitCount += 1
        this.#observer.recordRunStarted()
        let released = false

        return Object.freeze({
            release: () => {
                if (released) {
                    return
                }

                released = true
                this.#activePermitCount -= 1
                this.#observer.recordRunReleased()
            },
        })
    }

    activeCount(): number {
        return this.#activePermitCount
    }
}

export const generalReActExecutionGate = Object.freeze(new GeneralReActExecutionGate())
