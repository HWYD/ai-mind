import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { type ReviewerRole, type RunStatus, runStatusSchema } from '@/lib/ai/runtime/delivery-chain/manager'

type Baseline = 'single-agent' | 'fixed-multi-agent-current' | 'structured-supervisor-v0.4.11'

interface EvaluationCase {
    caseId: string
    expected: {
        requiredFindings: string[]
        reviewCoverage: ReviewerRole[]
        revisionTarget: 'none' | 'plan' | 'tasks' | 'both'
        runStatus: RunStatus
        supervisorBranch: 'blocked' | 'clarification_required' | 'execute'
    }
    faultInjection?: {
        failedReviewers: ReviewerRole[]
        failureKind: 'contract_failure' | 'execution_failed' | 'timeout'
    }
    input: { contextRefs: string[]; kind: 'demo' | 'inline'; requirement: string }
    scoringAnchors: Array<{ dimension: string; minimum: number }>
}

interface EvaluationManifest {
    cases: EvaluationCase[]
    schemaVersion: 1
    scorerVersion: string
}

interface EvaluationRunResult {
    baseline: Baseline
    caseId: string
    hardRuleFailures: string[]
    metrics: {
        businessModelCalls: number
        contractModelCalls: number
        contractRepairCalls: number
        elapsedMs: number
    }
    qualityScores: Record<string, number>
    runStatus: RunStatus
    scorerVersion: string
}

function createFixtureAdapter(baseline: Baseline) {
    const costByBaseline: Record<Baseline, Omit<EvaluationRunResult['metrics'], 'elapsedMs'>> = {
        'fixed-multi-agent-current': { businessModelCalls: 5, contractModelCalls: 0, contractRepairCalls: 0 },
        'single-agent': { businessModelCalls: 1, contractModelCalls: 0, contractRepairCalls: 0 },
        'structured-supervisor-v0.4.11': { businessModelCalls: 7, contractModelCalls: 7, contractRepairCalls: 0 },
    }

    return {
        async run(evaluationCase: EvaluationCase, scorerVersion: string): Promise<EvaluationRunResult> {
            return {
                baseline,
                caseId: evaluationCase.caseId,
                hardRuleFailures: [],
                metrics: { ...costByBaseline[baseline], elapsedMs: 1 },
                qualityScores: Object.fromEntries(evaluationCase.scoringAnchors.map(anchor => [anchor.dimension, anchor.minimum])),
                runStatus: evaluationCase.expected.runStatus,
                scorerVersion,
            }
        },
    }
}

function createSafeEvaluationSummary(results: EvaluationRunResult[]) {
    return results.map(result => ({
        baseline: result.baseline,
        businessModelCalls: result.metrics.businessModelCalls,
        caseId: result.caseId,
        contractModelCalls: result.metrics.contractModelCalls,
        contractRepairCalls: result.metrics.contractRepairCalls,
        hardRuleFailures: result.hardRuleFailures,
        runStatus: result.runStatus,
    }))
}

describe('delivery-chain evaluation harness', () => {
    it('loads the frozen eight-case manifest and matching fault-injection fixtures', async () => {
        const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures', 'delivery-chain-evaluation')
        const manifest = JSON.parse(await readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8')) as EvaluationManifest
        const caseFiles = await readdir(path.join(fixtureRoot, 'cases'))

        expect(manifest.schemaVersion).toBe(1)
        expect(manifest.cases).toHaveLength(8)
        expect(new Set(manifest.cases.map(item => item.caseId)).size).toBe(8)
        expect(caseFiles.sort()).toEqual(manifest.cases.map(item => `${item.caseId}.json`).sort())

        for (const evaluationCase of manifest.cases) {
            expect(runStatusSchema.safeParse(evaluationCase.expected.runStatus).success).toBe(true)
            expect(evaluationCase.input.requirement.length).toBeGreaterThan(0)
            expect(evaluationCase.scoringAnchors.length).toBeGreaterThan(0)
            expect(
                (evaluationCase.faultInjection?.failedReviewers ?? []).every(role => !evaluationCase.expected.reviewCoverage.includes(role))
            ).toBe(true)
        }
    })

    it('records comparable, safe quality and cost summaries for all three baseline adapters', async () => {
        const manifestPath = path.join(process.cwd(), 'tests', 'fixtures', 'delivery-chain-evaluation', 'manifest.json')
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as EvaluationManifest
        const baselines: Baseline[] = ['single-agent', 'fixed-multi-agent-current', 'structured-supervisor-v0.4.11']
        const results = await Promise.all(
            baselines.flatMap(baseline =>
                manifest.cases.map(evaluationCase => createFixtureAdapter(baseline).run(evaluationCase, manifest.scorerVersion))
            )
        )
        const summary = createSafeEvaluationSummary(results)

        expect(summary).toHaveLength(24)
        expect(new Set(summary.map(result => result.baseline))).toEqual(new Set(baselines))
        expect(summary.every(result => result.hardRuleFailures.length === 0)).toBe(true)
        expect(summary.every(result => runStatusSchema.safeParse(result.runStatus).success)).toBe(true)
        expect(JSON.stringify(summary)).not.toContain('requirement')
    })
})
