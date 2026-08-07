import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
const turboConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'turbo.json'), 'utf8'))

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
        'xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" pnpm test:integration',
    ]
    const positions = setupSteps.map(step => statefulIntegration.indexOf(step))

    for (const [index, position] of positions.entries()) {
        assert.notEqual(position, -1, `stateful integration must run ${setupSteps[index]}`)
    }

    assert.deepEqual([...positions].sort((left, right) => left - right), positions)
    assert.deepEqual(turboConfig.tasks['test:integration'].passThroughEnv, ['DISPLAY'])
    assert.doesNotMatch(docker, /^    needs:/m)
    assert.doesNotMatch(workflow, /pnpm test:external/)
})

test('keeps Windows desktop verification isolated from production deploy and preview distribution', () => {
    const desktopWindows = jobBlock('desktop-windows')

    assert.match(desktopWindows, /^    needs: stable-validation$/m)
    assert.match(desktopWindows, /^    runs-on: windows-latest$/m)
    assert.match(desktopWindows, /pnpm install --frozen-lockfile/)
    assert.match(desktopWindows, /pnpm --version/)
    assert.match(desktopWindows, /verify-pnpm-builds\.mjs --platform win32-x64/)
    assert.match(desktopWindows, /--install-log \.artifacts\/desktop\/pnpm-install\.log/)
    assert.match(desktopWindows, /--report \.artifacts\/desktop\/pnpm-builds-win32-x64\.json/)
    assert.match(desktopWindows, /pnpm --filter @ai-mind\/desktop test:stable/)
    assert.match(desktopWindows, /pnpm --filter @ai-mind\/desktop test:integration/)
    assert.match(desktopWindows, /pnpm --filter @ai-mind\/desktop make:windows/)
    assert.match(desktopWindows, /write-release-manifest\.mjs/)
    assert.match(desktopWindows, /verify-release-artifact\.mjs/)
    const windowsVerificationPositions = [
        desktopWindows.indexOf('pnpm install --frozen-lockfile'),
        desktopWindows.indexOf('verify-pnpm-builds.mjs --platform win32-x64'),
        desktopWindows.indexOf('pnpm --filter @ai-mind/desktop test:stable'),
        desktopWindows.indexOf('pnpm --filter @ai-mind/desktop test:integration'),
        desktopWindows.indexOf('pnpm --filter @ai-mind/desktop make:windows'),
        desktopWindows.indexOf('verify-release-artifact.mjs'),
    ]
    assert.deepEqual([...windowsVerificationPositions].sort((left, right) => left - right), windowsVerificationPositions)
    assert.doesNotMatch(desktopWindows, /preview:make|upload-artifact|deploy-production|TCR_|secrets\./)
})

test('keeps macOS arm64 desktop verification native, unsigned, and non-distributable', () => {
    const desktopMacos = jobBlock('desktop-macos-arm64')

    assert.match(desktopMacos, /^    needs: stable-validation$/m)
    assert.match(desktopMacos, /^    runs-on: macos-14$/m)
    assert.match(desktopMacos, /uname -m.*arm64/)
    assert.match(desktopMacos, /pnpm install --frozen-lockfile/)
    assert.match(desktopMacos, /pnpm --version/)
    assert.match(desktopMacos, /verify-pnpm-builds\.mjs --platform darwin-arm64/)
    assert.match(desktopMacos, /--install-log \.artifacts\/desktop\/pnpm-install\.log/)
    assert.match(desktopMacos, /--report \.artifacts\/desktop\/pnpm-builds-darwin-arm64\.json/)
    assert.match(desktopMacos, /pnpm --filter @ai-mind\/desktop test:stable/)
    assert.match(desktopMacos, /pnpm --filter @ai-mind\/desktop test:integration/)
    assert.match(desktopMacos, /pnpm --filter @ai-mind\/desktop make:macos-arm64/)
    assert.match(desktopMacos, /--platform darwin-arm64/)
    assert.match(desktopMacos, /file .*arm64/)
    assert.match(desktopMacos, /universal/)
    const macosVerificationPositions = [
        desktopMacos.indexOf('pnpm install --frozen-lockfile'),
        desktopMacos.indexOf('verify-pnpm-builds.mjs --platform darwin-arm64'),
        desktopMacos.indexOf('pnpm --filter @ai-mind/desktop test:stable'),
        desktopMacos.indexOf('pnpm --filter @ai-mind/desktop test:integration'),
        desktopMacos.indexOf('pnpm --filter @ai-mind/desktop make:macos-arm64'),
        desktopMacos.indexOf('verify-release-artifact.mjs'),
    ]
    assert.deepEqual([...macosVerificationPositions].sort((left, right) => left - right), macosVerificationPositions)
    assert.doesNotMatch(desktopMacos, /preview:make|upload-artifact|deploy-production|TCR_|secrets\./)
})
