import type { NextRequest } from 'next/server'

import { createAgentRunOwnerSessionHash } from '@/lib/ai/agent-runs'
import { resolveSessionId } from '@/lib/ai/rate-limit'
import {
    TemporaryImageContentError,
    TemporaryImageContentService,
} from '@/lib/ai/runtime/image-generation-agent/temporary-image-content-service'

export const runtime = 'nodejs'

const imageContentService = new TemporaryImageContentService()
const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export async function GET(request: NextRequest, context: { params: { runId: string } | Promise<{ runId: string }> }) {
    const { runId } = await context.params

    if (!runIdPattern.test(runId)) {
        return Response.json(
            {
                code: 'IMAGE_RESULT_REQUEST_INVALID',
                error: '图像结果请求无效。',
            },
            { status: 400 }
        )
    }

    try {
        const { sessionId, setCookie } = resolveSessionId(request.cookies)
        const content = await imageContentService.readOwnedResult({
            ownerSessionHash: createAgentRunOwnerSessionHash(sessionId),
            runId,
        })

        const responseBody = new Uint8Array(content.body.byteLength)
        responseBody.set(content.body)

        return new Response(responseBody.buffer, {
            headers: {
                'Cache-Control': 'private, no-store',
                'Content-Disposition': `inline; filename="${content.fileName}"`,
                'Content-Length': String(content.byteLength),
                'Content-Type': content.mimeType,
                'X-Content-Type-Options': 'nosniff',
                ...(setCookie ? { 'Set-Cookie': setCookie } : {}),
            },
        })
    } catch (error) {
        if (error instanceof TemporaryImageContentError) {
            const response = imageContentErrorResponse(error)
            return Response.json(
                {
                    code: error.code,
                    error: response.message,
                },
                { status: response.status }
            )
        }

        // eslint-disable-next-line no-console
        console.error('Image result content route failed:', error)

        return Response.json(
            {
                code: 'IMAGE_PROVIDER_RESULT_INVALID',
                error: '图片结果无法安全读取，请重新发起 /image。',
            },
            { status: 502 }
        )
    }
}

function imageContentErrorResponse(error: TemporaryImageContentError): { message: string; status: number } {
    return {
        IMAGE_PROVIDER_RESULT_INVALID: { message: '图片结果无法安全读取，请重新发起 /image。', status: 502 },
        IMAGE_RESULT_EXPIRED: { message: '临时图片已过期，请重新发起 /image。', status: 410 },
        IMAGE_RESULT_FETCH_TIMEOUT: { message: '图片读取超时，请重新发起 /image。', status: 504 },
        IMAGE_RESULT_FORBIDDEN: { message: '该图片不属于当前会话。', status: 403 },
        IMAGE_RESULT_NOT_FOUND: { message: '图片结果不存在，请重新发起 /image。', status: 404 },
        IMAGE_RESULT_NOT_READY: { message: '图片仍在处理中，请查看当前任务阶段或停止当前任务。', status: 409 },
        IMAGE_RESULT_REQUEST_INVALID: { message: '图像结果请求无效。', status: 400 },
    }[error.code]
}
