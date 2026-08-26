import { execFile } from 'node:child_process'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const verificationScript = path.join(repositoryRoot, 'deploy', 'scripts', 'verify-production.sh')

const fakeDocker = `#!/usr/bin/env bash
set -euo pipefail

case "$*" in
    *" config")
        printf '%s\\n' 'services:' '  webapp:' '    image: ccr.ccs.tencentyun.com/ai-mind/webapp:sha-test' '  postgres:' '    image: ai-mind-postgres-pgvector:sha-test'
        ;;
    *" ps")
        printf '%s\\n' 'postgres healthy 5432/tcp' 'project-assistant-service healthy 8788/tcp' 'webapp healthy'
        ;;
    *" port postgres 5432")
        if [ "\${FAKE_POSTGRES_PORT:-}" = 'published' ]; then
            printf '%s\\n' '0.0.0.0:5432'
        else
            printf '%s\\n' 'invalid IP:0'
        fi
        ;;
    *" port project-assistant-service 8788")
        if [ "\${FAKE_PROJECT_ASSISTANT_SERVICE_PORT:-}" = 'published' ]; then
            printf '%s\\n' '0.0.0.0:8788'
        else
            printf '%s\\n' 'invalid IP:0'
        fi
        ;;
    *" port webapp 3000")
        printf '%s\\n' '127.0.0.1:3000'
        ;;
esac
`

const fakeCurl = `#!/usr/bin/env bash
set -euo pipefail

headers=''
body=''
write_format=''
url=''

while [ "$#" -gt 0 ]; do
    case "$1" in
        -D)
            headers="$2"
            shift 2
            ;;
        -o)
            body="$2"
            shift 2
            ;;
        -w)
            write_format="$2"
            shift 2
            ;;
        -H|--max-time)
            shift 2
            ;;
        *)
            url="$1"
            shift
            ;;
    esac
done

if [[ "$url" == http://* ]]; then
    printf '%s\\n' 'HTTP/1.1 301 Moved Permanently' 'Location: https://ai.hwyblog.cloud/'
    exit 0
fi

if [[ "$url" == *'/api/desktop/compatibility' ]]; then
    printf '%s\\n' 'HTTP/2 200' 'cache-control: no-store' 'content-type: application/json' > "$headers"
    printf '%s' '{"contractVersion":1,"status":"compatible"}' > "$body"
    exit 0
fi

if [ -n "$headers" ]; then
    document_csp="$FAKE_LANDING_DOCUMENT_CSP"
    if [[ "$url" == *'/instant-mind' ]]; then
        document_csp="$FAKE_INSTANT_MIND_DOCUMENT_CSP"
    fi

    printf '%s\\n' 'HTTP/2 200' "content-security-policy: $document_csp" 'permissions-policy: camera=(), clipboard-read=()' 'referrer-policy: strict-origin-when-cross-origin' 'x-content-type-options: nosniff' 'x-frame-options: DENY' > "$headers"
    exit 0
fi

case "$url" in
    *'/mcp'|*'/api/health'|*'/api/ai/models') printf '404' ;;
    *) printf '200' ;;
esac
`

const supportedLandingCsp =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
const supportedInstantMindCsp =
    "default-src 'self'; script-src 'nonce-abc123' 'strict-dynamic' 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"

test(
    'production verifier enforces route-specific document CSP and host-port policies',
    { skip: process.platform === 'win32' ? 'production verifier runs on the Linux deployment host' : false },
    async t => {
        const testDirectory = await mkdtemp(path.join(tmpdir(), 'ai-mind-production-verifier-'))
        const binDirectory = path.join(testDirectory, 'bin')
        const deployRoot = path.join(testDirectory, 'deploy')

        t.after(async () => {
            await rm(testDirectory, { force: true, recursive: true })
        })

        await mkdir(binDirectory)
        await mkdir(deployRoot)
        await Promise.all([
            writeFile(path.join(binDirectory, 'docker'), fakeDocker, 'utf8'),
            writeFile(path.join(binDirectory, 'curl'), fakeCurl, 'utf8'),
            writeFile(path.join(deployRoot, 'compose.production.yml'), 'services: {}\n', 'utf8'),
            writeFile(path.join(deployRoot, '.release.env'), 'RELEASE=test\n', 'utf8'),
        ])
        await Promise.all([chmod(path.join(binDirectory, 'docker'), 0o755), chmod(path.join(binDirectory, 'curl'), 0o755)])

        const runVerifier = (
            { landing = supportedLandingCsp, instantMind = supportedInstantMindCsp } = {},
            environment = {}
        ) =>
            execFileAsync('bash', [verificationScript], {
                cwd: repositoryRoot,
                env: {
                    ...process.env,
                    AI_MIND_DEPLOY_ROOT: deployRoot,
                    AI_MIND_DESKTOP_CANDIDATE_VERSION: '0.5.0',
                    FAKE_LANDING_DOCUMENT_CSP: landing,
                    FAKE_INSTANT_MIND_DOCUMENT_CSP: instantMind,
                    PATH: `${binDirectory}${path.delimiter}${process.env.PATH}`,
                    ...environment,
                },
            })

        await assert.doesNotReject(() => runVerifier())
        await assert.rejects(
            () => runVerifier(undefined, { FAKE_POSTGRES_PORT: 'published' }),
            error => /postgres.*5432/.test(error.stdout)
        )
        await assert.rejects(
            () => runVerifier(undefined, { FAKE_PROJECT_ASSISTANT_SERVICE_PORT: 'published' }),
            error => /project-assistant-service.*8788/.test(error.stdout)
        )
        await assert.rejects(
            () => runVerifier({ instantMind: `${supportedInstantMindCsp}; style-src-attr 'unsafe-inline'` }),
            error => /document security headers/.test(error.stdout)
        )
        await assert.rejects(
            () =>
                runVerifier(
                    {
                        instantMind:
                            "default-src 'self'; script-src 'nonce-abc123' 'strict-dynamic' 'self'; style-src 'self' 'nonce-style123' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
                    }
                ),
            error => /document security headers/.test(error.stdout)
        )
        await assert.rejects(
            () => runVerifier({ landing: supportedInstantMindCsp }),
            error => /document security headers/.test(error.stdout)
        )
        await assert.rejects(
            () => runVerifier({ instantMind: supportedLandingCsp }),
            error => /document security headers/.test(error.stdout)
        )
        await assert.rejects(
            () =>
                runVerifier({
                    instantMind:
                        "default-src 'self'; script-src 'nonce-abc123' 'strict-dynamic' 'self' https://untrusted.example; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
                }),
            error => /document security headers/.test(error.stdout)
        )
        await assert.rejects(
            () =>
                runVerifier({
                    instantMind:
                        "default-src 'self'; script-src 'nonce-abc123' 'strict-dynamic' 'self' *; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
                }),
            error => /document security headers/.test(error.stdout)
        )
    }
)
