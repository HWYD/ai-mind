import { connection } from 'next/server'

import InstantMindPage from '@/components/instamind/instantmind-page'
import { resolveChatModelsInitialState } from '@/lib/ai/model-provider'

export const runtime = 'nodejs'

export default async function InstantMindRoutePage() {
    await connection()

    return <InstantMindPage initialChatModelsState={resolveChatModelsInitialState()} />
}
