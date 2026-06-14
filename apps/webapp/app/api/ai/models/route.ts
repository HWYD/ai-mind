import { NextResponse } from 'next/server'

import { ModelProviderConfigError, PublicModelListError, resolvePublicModelList } from '@/lib/ai/model-provider'

export const runtime = 'nodejs'

export async function GET() {
    try {
        return NextResponse.json(resolvePublicModelList())
    } catch (error) {
        if (error instanceof ModelProviderConfigError || error instanceof PublicModelListError) {
            return NextResponse.json(
                {
                    error: 'Model provider configuration is invalid.',
                    code: 'MODEL_PROVIDER_NOT_CONFIGURED',
                },
                { status: 500 }
            )
        }

        // eslint-disable-next-line no-console
        console.error('AI model list failed:', error)

        return NextResponse.json(
            {
                error: 'Internal server error',
                code: 'RUNTIME_INVARIANT_FAILED',
            },
            { status: 500 }
        )
    }
}
