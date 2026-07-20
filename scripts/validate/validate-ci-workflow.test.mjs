import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')

function jobBlock(jobName) {
    const header = `\n  ${jobName}:\n`
    const start = workflow.indexOf(header)

    assert.notEqual(start, -1, `CI workflow must define the ${jobName} job`)

    const contentStart = start + header.length
    const nextJob = /\n  [a-z][a-z0-9-]*:\n/g
    nextJob.lastIndex = contentStart
    const nextJobMatch = nextJob.exec(workflow)

    return workflow.slice(contentStart, nextJobMatch?.index)
}

test('keeps stateful CI work behind successful stable validation', () => {
    const stableValidation = jobBlock('stable-validation')
    const statefulIntegration = jobBlock('stateful-integration')
    const docker = jobBlock('docker')

    assert.doesNotMatch(stableValidation, /^    services:/m)
    assert.doesNotMatch(stableValidation, /DATABASE_URL/)
    assert.doesNotMatch(stableValidation, /db:migrate:deploy|db:runtime-checkpoints:setup/)
    assert.match(stableValidation, /pnpm validate:workspace-boundaries/)
    assert.match(stableValidation, /pnpm lint/)
    assert.match(stableValidation, /pnpm typecheck/)
    assert.match(stableValidation, /pnpm test:stable/)
    assert.match(stableValidation, /pnpm build/)

    assert.match(statefulIntegration, /^    needs: stable-validation$/m)
    assert.match(statefulIntegration, /^    services:\n      postgres:/m)
    assert.match(statefulIntegration, /DATABASE_URL/)

    const setupSteps = [
        'pnpm --filter @ai-mind/database db:generate',
        'pnpm --filter @ai-mind/database db:migrate:deploy',
        'pnpm --dir apps/webapp db:runtime-checkpoints:setup',
        'pnpm test:integration',
    ]
    const positions = setupSteps.map(step => statefulIntegration.indexOf(step))

    for (const [index, position] of positions.entries()) {
        assert.notEqual(position, -1, `stateful integration must run ${setupSteps[index]}`)
    }

    assert.deepEqual([...positions].sort((left, right) => left - right), positions)
    assert.doesNotMatch(docker, /^    needs:/m)
    assert.doesNotMatch(workflow, /pnpm test:external/)
})
