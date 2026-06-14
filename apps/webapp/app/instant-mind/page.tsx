import InstantMindPage from '@/components/instamind/instantmind-page'
import { resolveChatModelsInitialState } from '@/lib/ai/model-provider'

export const runtime = 'nodejs'

export default function InstantMindRoutePage() {
    return <InstantMindPage initialChatModelsState={resolveChatModelsInitialState()} />
}
