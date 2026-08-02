const baseUrl = (process.env.AI_MIND_SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const modelId = process.env.AI_MIND_SMOKE_MODEL_ID || 'deepseek/deepseek-v4-pro'
const timeoutMs = Number(process.env.AI_MIND_SMOKE_TIMEOUT_MS || 900_000)

if (process.env.AI_MIND_RUN_DELIVERY_CHAIN_SMOKE !== '1') {
    throw new Error('Set AI_MIND_RUN_DELIVERY_CHAIN_SMOKE=1 to run the real Delivery Chain smoke check.')
}

function parseNdjson(text) {
    return text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => JSON.parse(line))
        .map(envelope => envelope?.payload)
        .filter(Boolean)
}

function toCookieHeader(setCookie) {
    return setCookie?.split(';', 1)[0]
}

async function readReplayStream(streamUrl, cookie) {
    let lastError

    for (let attempt = 1; attempt <= 12; attempt += 1) {
        try {
            const streamResponse = await fetch(new URL(streamUrl, baseUrl), {
                headers: {
                    ...(cookie ? { Cookie: cookie } : {}),
                    'Last-Event-ID': '0',
                },
                signal: AbortSignal.timeout(timeoutMs),
            })

            if (!streamResponse.ok) {
                throw new Error(`Delivery Chain replay stream failed with HTTP ${streamResponse.status}.`)
            }

            return parseNdjson(await streamResponse.text())
        } catch (error) {
            lastError = error
            if (attempt < 12) {
                await new Promise(resolve => setTimeout(resolve, 500))
            }
        }
    }

    throw lastError
}

async function readChatStream(initialResponse) {
    const contentType = initialResponse.headers.get('content-type') || ''
    const cookie = toCookieHeader(initialResponse.headers.get('set-cookie'))

    if (!contentType.includes('application/json')) {
        try {
            return parseNdjson(await initialResponse.text())
        } catch (error) {
            const runId = initialResponse.headers.get('x-run-id')
            if (!runId) throw error
            return readReplayStream(`/api/chat/runs/${encodeURIComponent(runId)}/stream`, cookie)
        }
    }

    const descriptor = await initialResponse.json()
    if (descriptor?.kind !== 'stream-replay' || typeof descriptor.streamUrl !== 'string') {
        throw new Error(`Chat request returned an unexpected JSON response (${initialResponse.status}).`)
    }

    return readReplayStream(descriptor.streamUrl, cookie)
}

const idempotencyKey = crypto.randomUUID()
const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
        Accept: 'application/x-ndjson; profile="ai-mind-resumable-v1"',
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
        createConversation: true,
        composer: {
            command: {
                label: '生成交付计划',
                name: 'delivery-chain',
            },
            plainText: '',
            references: [
                {
                    id: 'demo:scenario:request-limit-banner',
                    label: 'request-limit-banner/requirement.md',
                    source: 'local',
                    type: 'resource',
                    uri: 'demo://scenarios/request-limit-banner/requirement.md',
                },
            ],
        },
        messages: [
            {
                parts: [
                    {
                        format: 'markdown',
                        text: '/delivery-chain @demo://scenarios/request-limit-banner/requirement.md',
                        type: 'text',
                    },
                ],
                role: 'user',
            },
        ],
        options: {
            enableReasoning: false,
            modelId,
        },
    }),
    signal: AbortSignal.timeout(timeoutMs),
})

if (!response.ok) {
    let errorCode = 'UNKNOWN'
    try {
        errorCode = (await response.json())?.code || errorCode
    } catch {
        // Smoke 输出只保留安全错误码，不打印原始响应。
    }
    throw new Error(`Delivery Chain request failed with HTTP ${response.status} (${errorCode}).`)
}

const chunks = await readChatStream(response)
const reportText = chunks
    .filter(chunk => chunk.type === 'text-delta')
    .map(chunk => chunk.delta)
    .join('')
const workflowEnd = chunks.find(chunk => chunk.type === 'workflow-progress-end')
const errorCodes = chunks.filter(chunk => chunk.type === 'error').map(chunk => chunk.errorCode)
const workflowSteps = chunks
    .filter(chunk => chunk.type === 'workflow-progress-step')
    .map(chunk => ({ status: chunk.status, stepId: chunk.stepId, summary: chunk.summary }))
const completedSteps = chunks
    .filter(chunk => chunk.type === 'workflow-progress-step' && chunk.status === 'completed')
    .map(chunk => chunk.stepId)
const summary = {
    modelId,
    httpStatus: response.status,
    eventCount: chunks.length,
    workflowStatus: workflowEnd?.status ?? null,
    finished: chunks.some(chunk => chunk.type === 'finish'),
    errorCodes,
    workflowSteps,
    completedSteps,
    reportChars: reportText.length,
    failureSummary: reportText
        .split(/\r?\n/)
        .find(line => line.includes('Contract') || line.includes('结构化') || line.includes('异常'))?.trim(),
    hasExecuteDecision: reportText.includes('- pre: `execute`'),
    hasPlan: reportText.includes('## 实现方案'),
    hasTasks: reportText.includes('## 任务拆解'),
    hasReview: reportText.includes('## Review Coverage'),
    hasClarificationRequired: reportText.includes('clarification_required'),
    hasMissingSchemaMessage: reportText.includes('Provide the expected planning output schema'),
}
const passed =
    summary.httpStatus === 200 &&
    summary.workflowStatus === 'completed' &&
    summary.finished &&
    summary.errorCodes.length === 0 &&
    summary.hasExecuteDecision &&
    summary.hasPlan &&
    summary.hasTasks &&
    summary.hasReview &&
    !summary.hasClarificationRequired &&
    !summary.hasMissingSchemaMessage

console.log(JSON.stringify({ passed, ...summary }))

if (!passed) {
    process.exitCode = 1
}
