const CLOUD_MODEL_IDS = [
    'qwen/qwen3.6-flash',
    'qwen/qwen3.6-plus',
    'qwen/qwen3.7-plus',
    'deepseek/deepseek-v4-flash',
    'deepseek/deepseek-v4-pro',
]

const TASKLIST_MODEL_IDS = ['qwen/qwen3.6-plus', 'deepseek/deepseek-v4-pro']
const baseUrl = (process.env.AI_MIND_SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const planUri = process.env.AI_MIND_SMOKE_PLAN_URI || 'demo://version-plans/v034-langsmith-observability.md'
const timeoutMs = Number(process.env.AI_MIND_SMOKE_TIMEOUT_MS || 180_000)
const chatModelIds = process.env.AI_MIND_SMOKE_SKIP_CHAT === '1' ? [] : CLOUD_MODEL_IDS
const tasklistModelIds = process.env.AI_MIND_SMOKE_TASKLIST_MODEL_IDS
    ? process.env.AI_MIND_SMOKE_TASKLIST_MODEL_IDS.split(',')
          .map(modelId => modelId.trim())
          .filter(Boolean)
    : TASKLIST_MODEL_IDS

if (process.env.AI_MIND_RUN_CLOUD_MODEL_SMOKE !== '1') {
    throw new Error('Set AI_MIND_RUN_CLOUD_MODEL_SMOKE=1 to run real cloud model smoke checks.')
}

function parseNdjson(text) {
    return text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => JSON.parse(line))
}

async function requestChat(payload) {
    const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
            Accept: 'application/x-ndjson; profile="ai-mind-resumable-v1"',
            'content-type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
    })
    const envelopes = parseNdjson(await response.text())

    if (response.ok && envelopes.some(envelope => !envelope || typeof envelope !== 'object' || !('payload' in envelope))) {
        throw new Error('Chat stream response contained a non-envelope line.')
    }

    const chunks = envelopes
        .map(envelope => envelope.payload)
        .filter(payload => payload?.type !== 'run-status')

    return {
        chunks,
        status: response.status,
    }
}

function getErrorCode(chunks) {
    return chunks.find(chunk => chunk.type === 'error')?.errorCode ?? null
}

function summarizeChat(modelId, result) {
    const text = result.chunks
        .filter(chunk => chunk.type === 'text-delta')
        .map(chunk => chunk.delta)
        .join('')
    const summary = {
        type: 'chat',
        modelId,
        httpStatus: result.status,
        finished: result.chunks.some(chunk => chunk.type === 'finish'),
        errorCode: getErrorCode(result.chunks),
        hasText: text.trim().length > 0,
        reasoningChunkCount: result.chunks.filter(chunk => chunk.type === 'reasoning-delta').length,
    }

    return {
        passed: summary.httpStatus === 200 && summary.finished && summary.errorCode === null && summary.hasText,
        summary,
    }
}

function summarizeTasklist(modelId, result) {
    const artifactText = result.chunks
        .filter(chunk => chunk.type === 'artifact-delta')
        .map(chunk => chunk.delta)
        .join('')
    const artifactCompleted = result.chunks.some(chunk => chunk.type === 'artifact-end' && chunk.status === 'completed')
    const completedGraphNodes = result.chunks.filter(chunk => chunk.type === 'agent-graph-node-end' && chunk.status === 'completed')
    const validationNodes = completedGraphNodes.filter(
        chunk => chunk.nodeId === 'validateTasklistV1' || chunk.nodeId === 'validateTasklistV2'
    )
    const completedNodeIds = completedGraphNodes.map(node => node.nodeId)
    const revisionCompleted = completedNodeIds.includes('reviseTasklistV2')
    const summary = {
        type: 'tasklist',
        modelId,
        httpStatus: result.status,
        finished: result.chunks.some(chunk => chunk.type === 'finish'),
        errorCode: getErrorCode(result.chunks),
        artifactCompleted,
        artifactCharCount: artifactText.length,
        completedNodeCount: completedGraphNodes.length,
        completedNodeIds,
        graphNodeCount: completedGraphNodes.length,
        planningDecisionCompleted: completedNodeIds.includes('planningDecision'),
        draftCompleted: completedNodeIds.includes('draftTasklistV1'),
        validationV1: validationNodes[0] ? { severity: validationNodes[0].severity, tags: validationNodes[0].tags ?? [] } : null,
        validationV2: validationNodes[1] ? { severity: validationNodes[1].severity, tags: validationNodes[1].tags ?? [] } : null,
        revisionCompleted,
    }

    return {
        passed:
            summary.httpStatus === 200 &&
            summary.finished &&
            summary.errorCode === null &&
            summary.artifactCompleted &&
            summary.artifactCharCount > 0 &&
            summary.planningDecisionCompleted &&
            summary.draftCompleted &&
            summary.validationV1 !== null &&
            (!summary.revisionCompleted || summary.validationV2 !== null),
        summary,
    }
}

async function runChatSmoke(modelId) {
    const result = await requestChat({
        conversationId: `cloud-smoke-chat-${modelId.replaceAll('/', '-')}`,
        messages: [
            {
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        format: 'markdown',
                        text: 'Reply with exactly MODEL_SMOKE_OK.',
                    },
                ],
            },
        ],
        options: {
            enableReasoning: false,
            maxTokens: 64,
            modelId,
        },
    })

    return summarizeChat(modelId, result)
}

async function runTasklistSmoke(modelId) {
    const referenceLabel = planUri.replace(/^(docs|demo):\/\//, '')
    const userText = `/tasklist @${planUri}`
    const result = await requestChat({
        conversationId: `cloud-smoke-tasklist-${modelId.replaceAll('/', '-')}`,
        composer: {
            plainText: userText,
            command: {
                name: 'tasklist',
                label: '/tasklist',
            },
            references: [
                {
                    id: `cloud-smoke-${referenceLabel}`,
                    type: 'resource',
                    label: referenceLabel,
                    uri: planUri,
                    source: 'local',
                },
            ],
        },
        messages: [
            {
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        format: 'markdown',
                        text: userText,
                    },
                ],
            },
        ],
        options: {
            enableReasoning: false,
            modelId,
        },
    })

    return summarizeTasklist(modelId, result)
}

const results = []

for (const modelId of chatModelIds) {
    try {
        results.push(await runChatSmoke(modelId))
    } catch (error) {
        results.push({
            passed: false,
            summary: {
                type: 'chat',
                modelId,
                error: error instanceof Error ? error.name : 'UnknownError',
            },
        })
    }
}

for (const modelId of tasklistModelIds) {
    try {
        results.push(await runTasklistSmoke(modelId))
    } catch (error) {
        results.push({
            passed: false,
            summary: {
                type: 'tasklist',
                modelId,
                error: error instanceof Error ? error.name : 'UnknownError',
            },
        })
    }
}

for (const result of results) {
    console.log(JSON.stringify({ passed: result.passed, ...result.summary }))
}

if (results.some(result => !result.passed)) {
    process.exitCode = 1
}
